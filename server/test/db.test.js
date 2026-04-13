import { describe, it, expect, afterEach } from 'vitest';
import { createDb, closeDb } from '../src/db.js';
import { randomBytes } from 'crypto';
import { unlinkSync, existsSync } from 'fs';

let dbPath;
let db;

function tmpDbPath() {
  return `/tmp/test-gpu-monitor-${randomBytes(8).toString('hex')}.db`;
}

afterEach(() => {
  if (db) {
    closeDb(db);
    db = null;
  }
  if (dbPath && existsSync(dbPath)) {
    unlinkSync(dbPath);
  }
  // Also remove WAL/SHM sidecar files
  if (dbPath) {
    for (const ext of ['-wal', '-shm']) {
      const sidecar = dbPath + ext;
      if (existsSync(sidecar)) unlinkSync(sidecar);
    }
  }
  dbPath = null;
});

// Helper: get list of table names from the db
function tableNames(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map(r => r.name);
}

// Helper: get list of index names from the db
function indexNames(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
    .all()
    .map(r => r.name);
}

describe('createDb / closeDb', () => {
  it('returns a db instance and creates the database file', () => {
    dbPath = tmpDbPath();
    db = createDb(dbPath);
    expect(db).toBeTruthy();
    expect(existsSync(dbPath)).toBe(true);
  });

  it('closeDb does not throw if db is open', () => {
    dbPath = tmpDbPath();
    db = createDb(dbPath);
    expect(() => closeDb(db)).not.toThrow();
    db = null; // already closed; don't close again in afterEach
  });

  it('closeDb does not throw if db is already closed', () => {
    dbPath = tmpDbPath();
    db = createDb(dbPath);
    closeDb(db);
    expect(() => closeDb(db)).not.toThrow();
    db = null;
  });
});

describe('All 7 tables are created', () => {
  it('creates all required tables', () => {
    dbPath = tmpDbPath();
    db = createDb(dbPath);
    const tables = tableNames(db);
    const expected = [
      'alert_rules',
      'alerts',
      'collector_runs',
      'gpu_devices',
      'gpu_processes',
      'host_summaries',
      'user_rollups',
    ];
    for (const t of expected) {
      expect(tables, `table "${t}" should exist`).toContain(t);
    }
  });
});

describe('All 6 indexes are created', () => {
  it('creates all required indexes', () => {
    dbPath = tmpDbPath();
    db = createDb(dbPath);
    const indexes = indexNames(db);
    const expected = [
      'idx_gpu_processes_ts_user',
      'idx_gpu_processes_ts_server',
      'idx_user_rollups_ts_user',
      'idx_user_rollups_user_ts',
      'idx_gpu_devices_ts_server_gpu',
      'idx_host_summaries_ts_server',
    ];
    for (const idx of expected) {
      expect(indexes, `index "${idx}" should exist`).toContain(idx);
    }
  });
});

describe('gpu_processes table', () => {
  it('can insert and query rows', () => {
    dbPath = tmpDbPath();
    db = createDb(dbPath);
    const row = {
      ts_utc: '2026-01-01T00:00:00Z',
      server: 'server1',
      hostname: 'host1',
      gpu_index: 0,
      gpu_uuid: 'GPU-abc123',
      pid: 1234,
      user: 'alice',
      process_name: 'python',
      cmd: 'python train.py',
      gpu_mem_mb: 4096.0,
      cpu_pct: 12.5,
      mem_pct: 3.2,
      elapsed_sec: 300,
      state: 'running',
    };
    db.prepare(`
      INSERT INTO gpu_processes
        (ts_utc, server, hostname, gpu_index, gpu_uuid, pid, user, process_name, cmd,
         gpu_mem_mb, cpu_pct, mem_pct, elapsed_sec, state)
      VALUES
        (@ts_utc, @server, @hostname, @gpu_index, @gpu_uuid, @pid, @user, @process_name,
         @cmd, @gpu_mem_mb, @cpu_pct, @mem_pct, @elapsed_sec, @state)
    `).run(row);
    const result = db.prepare('SELECT * FROM gpu_processes').all();
    expect(result).toHaveLength(1);
    expect(result[0].user).toBe('alice');
    expect(result[0].gpu_mem_mb).toBe(4096.0);
    expect(result[0].pid).toBe(1234);
  });
});

describe('user_rollups table', () => {
  it('can insert and query rows', () => {
    dbPath = tmpDbPath();
    db = createDb(dbPath);
    const row = {
      ts_utc: '2026-01-01T00:00:00Z',
      server: 'server1',
      hostname: 'host1',
      user: 'bob',
      process_count: 3,
      gpu_count: 2,
      total_gpu_mem_mb: 8192.0,
      avg_cpu_pct: 25.0,
      max_cpu_pct: 50.0,
    };
    db.prepare(`
      INSERT INTO user_rollups
        (ts_utc, server, hostname, user, process_count, gpu_count,
         total_gpu_mem_mb, avg_cpu_pct, max_cpu_pct)
      VALUES
        (@ts_utc, @server, @hostname, @user, @process_count, @gpu_count,
         @total_gpu_mem_mb, @avg_cpu_pct, @max_cpu_pct)
    `).run(row);
    const result = db.prepare('SELECT * FROM user_rollups').all();
    expect(result).toHaveLength(1);
    expect(result[0].user).toBe('bob');
    expect(result[0].total_gpu_mem_mb).toBe(8192.0);
    expect(result[0].process_count).toBe(3);
  });
});

describe('gpu_devices table', () => {
  it('can insert and query rows', () => {
    dbPath = tmpDbPath();
    db = createDb(dbPath);
    const row = {
      ts_utc: '2026-01-01T00:00:00Z',
      server: 'server1',
      hostname: 'host1',
      gpu_index: 0,
      gpu_name: 'NVIDIA A100',
      gpu_util_pct: 85.0,
      mem_util_pct: 70.0,
      mem_used_mb: 40960.0,
      mem_total_mb: 81920.0,
      temp_c: 72.0,
    };
    db.prepare(`
      INSERT INTO gpu_devices
        (ts_utc, server, hostname, gpu_index, gpu_name, gpu_util_pct,
         mem_util_pct, mem_used_mb, mem_total_mb, temp_c)
      VALUES
        (@ts_utc, @server, @hostname, @gpu_index, @gpu_name, @gpu_util_pct,
         @mem_util_pct, @mem_used_mb, @mem_total_mb, @temp_c)
    `).run(row);
    const result = db.prepare('SELECT * FROM gpu_devices').all();
    expect(result).toHaveLength(1);
    expect(result[0].gpu_name).toBe('NVIDIA A100');
    expect(result[0].temp_c).toBe(72.0);
    expect(result[0].gpu_index).toBe(0);
  });
});

describe('host_summaries table', () => {
  it('can insert and query rows', () => {
    dbPath = tmpDbPath();
    db = createDb(dbPath);
    const row = {
      ts_utc: '2026-01-01T00:00:00Z',
      server: 'server1',
      hostname: 'host1',
      load_1: 1.5,
      load_5: 1.2,
      load_15: 1.0,
      cpu_user_pct: 30.0,
      cpu_system_pct: 10.0,
      cpu_idle_pct: 60.0,
      mem_total_mb: 131072.0,
      mem_used_mb: 65536.0,
      mem_free_mb: 65536.0,
      swap_total_mb: 16384.0,
      swap_used_mb: 1024.0,
      task_total: 200,
      task_running: 5,
      task_sleeping: 195,
    };
    db.prepare(`
      INSERT INTO host_summaries
        (ts_utc, server, hostname, load_1, load_5, load_15,
         cpu_user_pct, cpu_system_pct, cpu_idle_pct,
         mem_total_mb, mem_used_mb, mem_free_mb,
         swap_total_mb, swap_used_mb,
         task_total, task_running, task_sleeping)
      VALUES
        (@ts_utc, @server, @hostname, @load_1, @load_5, @load_15,
         @cpu_user_pct, @cpu_system_pct, @cpu_idle_pct,
         @mem_total_mb, @mem_used_mb, @mem_free_mb,
         @swap_total_mb, @swap_used_mb,
         @task_total, @task_running, @task_sleeping)
    `).run(row);
    const result = db.prepare('SELECT * FROM host_summaries').all();
    expect(result).toHaveLength(1);
    expect(result[0].hostname).toBe('host1');
    expect(result[0].load_1).toBe(1.5);
    expect(result[0].task_running).toBe(5);
  });
});

describe('portal tables exist (alert_rules, alerts, collector_runs)', () => {
  it('alert_rules table inserts correctly', () => {
    dbPath = tmpDbPath();
    db = createDb(dbPath);
    db.prepare(`
      INSERT INTO alert_rules (name, condition_type, target, threshold, duration_min)
      VALUES ('high-gpu-mem', 'gpu_mem_mb', 'alice', 20000, 5)
    `).run();
    const result = db.prepare('SELECT * FROM alert_rules').all();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('high-gpu-mem');
    expect(result[0].enabled).toBe(1);
  });

  it('alerts table enforces foreign key to alert_rules', () => {
    dbPath = tmpDbPath();
    db = createDb(dbPath);
    // Insert with a valid rule_id (no matching rule) should fail since FK is on
    expect(() =>
      db.prepare(`
        INSERT INTO alerts (rule_id, ts_utc, message)
        VALUES (999, '2026-01-01T00:00:00Z', 'test alert')
      `).run()
    ).toThrow();
  });

  it('alerts table inserts correctly with valid rule_id', () => {
    dbPath = tmpDbPath();
    db = createDb(dbPath);
    db.prepare(`
      INSERT INTO alert_rules (name, condition_type, target, threshold, duration_min)
      VALUES ('rule1', 'gpu_mem_mb', 'user1', 10000, 10)
    `).run();
    const rule = db.prepare('SELECT id FROM alert_rules').get();
    db.prepare(`
      INSERT INTO alerts (rule_id, ts_utc, message)
      VALUES (?, '2026-01-01T00:00:00Z', 'alert message')
    `).run(rule.id);
    const result = db.prepare('SELECT * FROM alerts').all();
    expect(result).toHaveLength(1);
    expect(result[0].acknowledged).toBe(0);
    expect(result[0].message).toBe('alert message');
  });

  it('collector_runs table inserts correctly', () => {
    dbPath = tmpDbPath();
    db = createDb(dbPath);
    db.prepare(`
      INSERT INTO collector_runs (ts_utc, server, status, duration_ms)
      VALUES ('2026-01-01T00:00:00Z', 'server1', 'ok', 1234)
    `).run();
    const result = db.prepare('SELECT * FROM collector_runs').all();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('ok');
    expect(result[0].error).toBeNull();
  });
});
