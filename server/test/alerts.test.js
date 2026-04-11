import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, closeDb } from '../src/db.js';
import { evaluateAlerts } from '../src/alerts.js';
import { randomBytes } from 'crypto';
import { unlinkSync, existsSync } from 'fs';

function tmpDbPath() {
  return `/tmp/test-alerts-${randomBytes(8).toString('hex')}.db`;
}

let db;
let dbPath;

beforeEach(() => {
  dbPath = tmpDbPath();
  db = createDb(dbPath);
});

afterEach(() => {
  closeDb(db);
  db = null;
  if (existsSync(dbPath)) unlinkSync(dbPath);
  for (const ext of ['-wal', '-shm']) {
    if (existsSync(dbPath + ext)) unlinkSync(dbPath + ext);
  }
});

/** Helper: insert an alert_rule and return its id */
function insertRule(db, overrides = {}) {
  const rule = {
    name: 'Test Rule',
    condition_type: 'user_gpu_mem_exceeds',
    target: 'alice',
    threshold: 10000,
    duration_min: 5,
    enabled: 1,
    ...overrides,
  };
  const info = db.prepare(`
    INSERT INTO alert_rules (name, condition_type, target, threshold, duration_min, enabled)
    VALUES (@name, @condition_type, @target, @threshold, @duration_min, @enabled)
  `).run(rule);
  return info.lastInsertRowid;
}

/** Helper: insert a user_rollup row with ts_utc = 'now' - offsetMinutes */
function insertUserRollup(db, { user = 'alice', total_gpu_mem_mb = 20000, gpu_count = 4, offsetMinutes = 0, server = 'server1' } = {}) {
  db.prepare(`
    INSERT INTO user_rollups (ts_utc, server, hostname, user, process_count, gpu_count, total_gpu_mem_mb, avg_cpu_pct, max_cpu_pct)
    VALUES (datetime('now', ? || ' minutes'), ?, 'host1', ?, 2, ?, ?, 50.0, 80.0)
  `).run(`-${offsetMinutes}`, server, user, gpu_count, total_gpu_mem_mb);
}

/** Helper: insert a gpu_device row */
function insertGpuDevice(db, { gpu_util_pct = 5, temp_c = 80, offsetMinutes = 0, server = 'server1', gpu_index = 0 } = {}) {
  db.prepare(`
    INSERT INTO gpu_devices (ts_utc, server, hostname, gpu_index, gpu_name, gpu_util_pct, mem_util_pct, mem_used_mb, mem_total_mb, temp_c)
    VALUES (datetime('now', ? || ' minutes'), ?, 'host1', ?, 'A100', ?, 50.0, 40960.0, 81920.0, ?)
  `).run(`-${offsetMinutes}`, server, gpu_index, gpu_util_pct, temp_c);
}

/** Helper: insert a host_summary row */
function insertHostSummary(db, { load_1 = 10.0, offsetMinutes = 0, server = 'server1' } = {}) {
  db.prepare(`
    INSERT INTO host_summaries (ts_utc, server, hostname, load_1, load_5, load_15, cpu_user_pct, cpu_system_pct, cpu_idle_pct, mem_total_mb, mem_used_mb, mem_free_mb, swap_total_mb, swap_used_mb, task_total, task_running, task_sleeping)
    VALUES (datetime('now', ? || ' minutes'), ?, 'host1', ?, 8.0, 6.0, 30.0, 10.0, 60.0, 131072.0, 65536.0, 65536.0, 16384.0, 1024.0, 200, 5, 195)
  `).run(`-${offsetMinutes}`, server, load_1);
}

/** Helper: insert a collector_run row */
function insertCollectorRun(db, { status = 'error', server = 'server1', offsetMinutes = 0 } = {}) {
  db.prepare(`
    INSERT INTO collector_runs (ts_utc, server, status, duration_ms)
    VALUES (datetime('now', ? || ' minutes'), ?, ?, 1000)
  `).run(`-${offsetMinutes}`, server, status);
}

// ============================================================
// user_gpu_mem_exceeds
// ============================================================

describe('evaluateAlerts — user_gpu_mem_exceeds', () => {
  it('fires alert when threshold exceeded for full duration', () => {
    insertRule(db, { condition_type: 'user_gpu_mem_exceeds', target: 'alice', threshold: 10000, duration_min: 5 });
    insertUserRollup(db, { user: 'alice', total_gpu_mem_mb: 20000, offsetMinutes: 0 });
    insertUserRollup(db, { user: 'alice', total_gpu_mem_mb: 15000, offsetMinutes: 2 });
    insertUserRollup(db, { user: 'alice', total_gpu_mem_mb: 12000, offsetMinutes: 4 });

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].user).toBe('alice');
    expect(alerts[0].message).toContain('alice');
  });

  it('does not fire when threshold not sustained for all rows', () => {
    insertRule(db, { condition_type: 'user_gpu_mem_exceeds', target: 'alice', threshold: 10000, duration_min: 5 });
    insertUserRollup(db, { user: 'alice', total_gpu_mem_mb: 20000, offsetMinutes: 0 });
    insertUserRollup(db, { user: 'alice', total_gpu_mem_mb: 5000, offsetMinutes: 3 }); // below threshold

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(0);
  });

  it('does not fire when no data in time window', () => {
    insertRule(db, { condition_type: 'user_gpu_mem_exceeds', target: 'alice', threshold: 10000, duration_min: 5 });
    // Insert data outside the window
    insertUserRollup(db, { user: 'alice', total_gpu_mem_mb: 20000, offsetMinutes: 60 });

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(0);
  });

  it('does not fire duplicate (dedup)', () => {
    const ruleId = insertRule(db, { condition_type: 'user_gpu_mem_exceeds', target: 'alice', threshold: 10000, duration_min: 5 });
    insertUserRollup(db, { user: 'alice', total_gpu_mem_mb: 20000, offsetMinutes: 0 });

    const alerts1 = evaluateAlerts(db);
    expect(alerts1).toHaveLength(1);

    // Second evaluation — should NOT fire again (unacknowledged alert exists)
    const alerts2 = evaluateAlerts(db);
    expect(alerts2).toHaveLength(0);

    // Total alerts in db should still be 1
    const total = db.prepare('SELECT COUNT(*) as cnt FROM alerts WHERE rule_id = ?').get(ruleId);
    expect(total.cnt).toBe(1);
  });

  it('fires again after alert is acknowledged', () => {
    const ruleId = insertRule(db, { condition_type: 'user_gpu_mem_exceeds', target: 'alice', threshold: 10000, duration_min: 5 });
    insertUserRollup(db, { user: 'alice', total_gpu_mem_mb: 20000, offsetMinutes: 0 });

    evaluateAlerts(db);
    // Acknowledge the alert
    db.prepare('UPDATE alerts SET acknowledged = 1 WHERE rule_id = ?').run(ruleId);

    // Should fire again now
    const alerts2 = evaluateAlerts(db);
    expect(alerts2).toHaveLength(1);
  });
});

// ============================================================
// user_gpu_count_exceeds
// ============================================================

describe('evaluateAlerts — user_gpu_count_exceeds', () => {
  it('fires when gpu_count exceeds threshold for full duration', () => {
    insertRule(db, { condition_type: 'user_gpu_count_exceeds', target: 'bob', threshold: 3, duration_min: 5 });
    insertUserRollup(db, { user: 'bob', gpu_count: 5, offsetMinutes: 0 });
    insertUserRollup(db, { user: 'bob', gpu_count: 4, offsetMinutes: 3 });

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].user).toBe('bob');
  });

  it('does not fire when gpu_count drops below threshold', () => {
    insertRule(db, { condition_type: 'user_gpu_count_exceeds', target: 'bob', threshold: 3, duration_min: 5 });
    insertUserRollup(db, { user: 'bob', gpu_count: 5, offsetMinutes: 0 });
    insertUserRollup(db, { user: 'bob', gpu_count: 2, offsetMinutes: 3 }); // below threshold

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(0);
  });
});

// ============================================================
// gpu_idle
// ============================================================

describe('evaluateAlerts — gpu_idle', () => {
  it('fires when GPU utilization stays below threshold', () => {
    insertRule(db, { condition_type: 'gpu_idle', target: 'server1:0', threshold: 10, duration_min: 5 });
    insertGpuDevice(db, { gpu_util_pct: 5, offsetMinutes: 0 });
    insertGpuDevice(db, { gpu_util_pct: 3, offsetMinutes: 3 });

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].server).toBe('server1');
  });

  it('does not fire when GPU is active', () => {
    insertRule(db, { condition_type: 'gpu_idle', target: 'server1:0', threshold: 10, duration_min: 5 });
    insertGpuDevice(db, { gpu_util_pct: 50, offsetMinutes: 0 });

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(0);
  });

  it('does not fire when one row exceeds threshold', () => {
    insertRule(db, { condition_type: 'gpu_idle', target: 'server1:0', threshold: 10, duration_min: 5 });
    insertGpuDevice(db, { gpu_util_pct: 5, offsetMinutes: 0 });
    insertGpuDevice(db, { gpu_util_pct: 50, offsetMinutes: 3 }); // active

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(0);
  });
});

// ============================================================
// server_load_exceeds
// ============================================================

describe('evaluateAlerts — server_load_exceeds', () => {
  it('fires when server load stays above threshold', () => {
    insertRule(db, { condition_type: 'server_load_exceeds', target: 'server1', threshold: 8.0, duration_min: 5 });
    insertHostSummary(db, { load_1: 12.0, offsetMinutes: 0 });
    insertHostSummary(db, { load_1: 10.0, offsetMinutes: 3 });

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].server).toBe('server1');
  });

  it('does not fire when load drops below threshold', () => {
    insertRule(db, { condition_type: 'server_load_exceeds', target: 'server1', threshold: 8.0, duration_min: 5 });
    insertHostSummary(db, { load_1: 12.0, offsetMinutes: 0 });
    insertHostSummary(db, { load_1: 2.0, offsetMinutes: 3 }); // below threshold

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(0);
  });
});

// ============================================================
// server_unreachable
// ============================================================

describe('evaluateAlerts — server_unreachable', () => {
  it('fires when consecutive failures reach threshold', () => {
    insertRule(db, { condition_type: 'server_unreachable', target: 'server1', threshold: 3, duration_min: 0 });
    insertCollectorRun(db, { status: 'error', offsetMinutes: 1 });
    insertCollectorRun(db, { status: 'error', offsetMinutes: 2 });
    insertCollectorRun(db, { status: 'error', offsetMinutes: 3 });

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].server).toBe('server1');
  });

  it('does not fire when fewer failures than threshold', () => {
    insertRule(db, { condition_type: 'server_unreachable', target: 'server1', threshold: 3, duration_min: 0 });
    insertCollectorRun(db, { status: 'error', offsetMinutes: 1 });
    insertCollectorRun(db, { status: 'error', offsetMinutes: 2 });

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(0);
  });

  it('does not fire when recent run was ok', () => {
    insertRule(db, { condition_type: 'server_unreachable', target: 'server1', threshold: 3, duration_min: 0 });
    insertCollectorRun(db, { status: 'ok', offsetMinutes: 0 });
    insertCollectorRun(db, { status: 'error', offsetMinutes: 1 });
    insertCollectorRun(db, { status: 'error', offsetMinutes: 2 });

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(0);
  });
});

// ============================================================
// gpu_temp_exceeds
// ============================================================

describe('evaluateAlerts — gpu_temp_exceeds', () => {
  it('fires when GPU temperature exceeds threshold for full duration', () => {
    insertRule(db, { condition_type: 'gpu_temp_exceeds', target: 'server1:0', threshold: 75, duration_min: 5 });
    insertGpuDevice(db, { temp_c: 85, offsetMinutes: 0 });
    insertGpuDevice(db, { temp_c: 80, offsetMinutes: 3 });

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].server).toBe('server1');
    expect(alerts[0].message).toContain('85');
  });

  it('does not fire when temperature drops below threshold', () => {
    insertRule(db, { condition_type: 'gpu_temp_exceeds', target: 'server1:0', threshold: 75, duration_min: 5 });
    insertGpuDevice(db, { temp_c: 85, offsetMinutes: 0 });
    insertGpuDevice(db, { temp_c: 65, offsetMinutes: 3 }); // below threshold

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(0);
  });

  it('does not fire when no data in time window', () => {
    insertRule(db, { condition_type: 'gpu_temp_exceeds', target: 'server1:0', threshold: 75, duration_min: 5 });
    insertGpuDevice(db, { temp_c: 85, offsetMinutes: 60 }); // too old

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(0);
  });

  it('does not fire duplicate (dedup)', () => {
    const ruleId = insertRule(db, { condition_type: 'gpu_temp_exceeds', target: 'server1:0', threshold: 75, duration_min: 5 });
    insertGpuDevice(db, { temp_c: 85, offsetMinutes: 0 });

    const alerts1 = evaluateAlerts(db);
    expect(alerts1).toHaveLength(1);
    const alerts2 = evaluateAlerts(db);
    expect(alerts2).toHaveLength(0);
  });
});

// ============================================================
// Disabled rules
// ============================================================

describe('evaluateAlerts — disabled rules', () => {
  it('skips disabled rules', () => {
    insertRule(db, {
      condition_type: 'user_gpu_mem_exceeds',
      target: 'alice',
      threshold: 10000,
      duration_min: 5,
      enabled: 0,
    });
    insertUserRollup(db, { user: 'alice', total_gpu_mem_mb: 20000, offsetMinutes: 0 });

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(0);
  });

  it('evaluates enabled rules but skips disabled', () => {
    insertRule(db, {
      name: 'Disabled Rule',
      condition_type: 'user_gpu_mem_exceeds',
      target: 'alice',
      threshold: 10000,
      duration_min: 5,
      enabled: 0,
    });
    insertRule(db, {
      name: 'Enabled Rule',
      condition_type: 'server_load_exceeds',
      target: 'server1',
      threshold: 5.0,
      duration_min: 5,
      enabled: 1,
    });
    insertUserRollup(db, { user: 'alice', total_gpu_mem_mb: 20000, offsetMinutes: 0 });
    insertHostSummary(db, { load_1: 10.0, offsetMinutes: 0 });

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].server).toBe('server1');
  });
});

// ============================================================
// Multiple rules
// ============================================================

describe('evaluateAlerts — multiple rules', () => {
  it('returns alerts for all triggered rules', () => {
    insertRule(db, { condition_type: 'user_gpu_mem_exceeds', target: 'alice', threshold: 10000, duration_min: 5 });
    insertRule(db, { condition_type: 'server_load_exceeds', target: 'server1', threshold: 5.0, duration_min: 5 });

    insertUserRollup(db, { user: 'alice', total_gpu_mem_mb: 20000, offsetMinutes: 0 });
    insertHostSummary(db, { load_1: 10.0, offsetMinutes: 0 });

    const alerts = evaluateAlerts(db);
    expect(alerts).toHaveLength(2);
  });

  it('returns empty array when no rules exist', () => {
    const alerts = evaluateAlerts(db);
    expect(alerts).toEqual([]);
  });
});
