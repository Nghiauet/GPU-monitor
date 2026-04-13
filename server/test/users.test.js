import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'crypto';
import { existsSync, unlinkSync } from 'fs';
import { createDb, closeDb } from '../src/db.js';
import { USER_JOBS_SQL, annotateJobActivity } from '../src/routes/users.js';

function tmpDbPath() {
  return `/tmp/test-users-${randomBytes(8).toString('hex')}.db`;
}

function insertGpuProcess(row) {
  db.prepare(`
    INSERT INTO gpu_processes (
      ts_utc, server, hostname, gpu_index, gpu_uuid, pid, user, process_name, cmd,
      gpu_mem_mb, cpu_pct, mem_pct, elapsed_sec, state
    ) VALUES (
      @ts_utc, @server, @hostname, @gpu_index, @gpu_uuid, @pid, @user, @process_name, @cmd,
      @gpu_mem_mb, @cpu_pct, @mem_pct, @elapsed_sec, @state
    )
  `).run(row);
}

let db;
let dbPath;

beforeEach(() => {
  dbPath = tmpDbPath();
  db = createDb(dbPath);
});

afterEach(() => {
  if (db) {
    closeDb(db);
    db = null;
  }
  if (dbPath && existsSync(dbPath)) unlinkSync(dbPath);
  for (const ext of ['-wal', '-shm']) {
    if (dbPath && existsSync(dbPath + ext)) unlinkSync(dbPath + ext);
  }
  dbPath = null;
});

describe('USER_JOBS_SQL', () => {
  it('reports full runtime for jobs that started before the selected range', () => {
    insertGpuProcess({
      ts_utc: '2026-04-13T04:00:00Z',
      server: 'server1',
      hostname: 'host1',
      gpu_index: 2,
      gpu_uuid: 'GPU-1',
      pid: 1829401,
      user: 'alice',
      process_name: 'VLLM::Worker_TP',
      cmd: 'VLLM::Worker_TP',
      gpu_mem_mb: 12185,
      cpu_pct: 1.4,
      mem_pct: 0.5,
      elapsed_sec: 266400,
      state: 'R',
    });
    insertGpuProcess({
      ts_utc: '2026-04-13T04:44:37Z',
      server: 'server1',
      hostname: 'host1',
      gpu_index: 2,
      gpu_uuid: 'GPU-1',
      pid: 1829401,
      user: 'alice',
      process_name: 'VLLM::Worker_TP',
      cmd: 'VLLM::Worker_TP',
      gpu_mem_mb: 12185,
      cpu_pct: 1.4,
      mem_pct: 0.5,
      elapsed_sec: 268051,
      state: 'R',
    });

    const rows = db.prepare(USER_JOBS_SQL).all(
      'alice',
      '2026-04-12T05:07:17.953Z',
      '2026-04-13T05:07:17.953Z'
    );
    const jobs = annotateJobActivity(rows, Date.parse('2026-04-13T05:07:17.953Z'));

    expect(jobs).toHaveLength(1);
    expect(jobs[0].first_seen).toBe('2026-04-10T02:17:06Z');
    expect(jobs[0].last_seen).toBe('2026-04-13T04:44:37Z');
    expect(jobs[0].duration_sec).toBe(268051);
    expect(jobs[0].snapshot_count).toBe(2);
    expect(jobs[0].active).toBe(false);
  });
});
