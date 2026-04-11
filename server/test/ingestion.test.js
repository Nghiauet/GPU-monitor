import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, closeDb } from '../src/db.js';
import { ingestDirectory } from '../src/ingestion.js';
import { randomBytes } from 'crypto';
import { mkdirSync, writeFileSync, unlinkSync, rmdirSync, existsSync } from 'fs';

function tmpDbPath() {
  return `/tmp/test-ingestion-${randomBytes(8).toString('hex')}.db`;
}

function tmpDir() {
  const dir = `/tmp/test-ingestion-dir-${randomBytes(8).toString('hex')}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJsonl(dir, filename, rows) {
  const content = rows.map((r) => JSON.stringify(r)).join('\n');
  writeFileSync(`${dir}/${filename}`, content);
}

function cleanDir(dir) {
  if (!existsSync(dir)) return;
  for (const file of ['gpu_device.jsonl', 'gpu_process.jsonl', 'user_rollup.jsonl', 'host_summary.jsonl']) {
    const fp = `${dir}/${file}`;
    if (existsSync(fp)) unlinkSync(fp);
  }
  try { rmdirSync(dir); } catch {}
}

let db;
let dbPath;
let testDir;

beforeEach(() => {
  dbPath = tmpDbPath();
  db = createDb(dbPath);
  testDir = tmpDir();
});

afterEach(() => {
  closeDb(db);
  db = null;
  if (existsSync(dbPath)) unlinkSync(dbPath);
  for (const ext of ['-wal', '-shm']) {
    if (existsSync(dbPath + ext)) unlinkSync(dbPath + ext);
  }
  cleanDir(testDir);
});

// Sample data rows
const gpuDeviceRow = {
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

const gpuProcessRow = {
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

const userRollupRow = {
  ts_utc: '2026-01-01T00:00:00Z',
  server: 'server1',
  hostname: 'host1',
  user: 'alice',
  process_count: 2,
  gpu_count: 1,
  total_gpu_mem_mb: 4096.0,
  avg_cpu_pct: 12.5,
  max_cpu_pct: 20.0,
};

const hostSummaryRow = {
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

describe('ingestDirectory — gpu_device.jsonl → gpu_devices', () => {
  it('ingests gpu_device.jsonl into gpu_devices table', async () => {
    writeJsonl(testDir, 'gpu_device.jsonl', [gpuDeviceRow]);
    const counts = await ingestDirectory(db, testDir);
    expect(counts.gpu_devices).toBe(1);
    const rows = db.prepare('SELECT * FROM gpu_devices').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].gpu_name).toBe('NVIDIA A100');
    expect(rows[0].temp_c).toBe(72.0);
  });
});

describe('ingestDirectory — gpu_process.jsonl → gpu_processes', () => {
  it('ingests gpu_process.jsonl into gpu_processes table', async () => {
    writeJsonl(testDir, 'gpu_process.jsonl', [gpuProcessRow]);
    const counts = await ingestDirectory(db, testDir);
    expect(counts.gpu_processes).toBe(1);
    const rows = db.prepare('SELECT * FROM gpu_processes').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].user).toBe('alice');
    expect(rows[0].gpu_mem_mb).toBe(4096.0);
  });
});

describe('ingestDirectory — user_rollup.jsonl → user_rollups', () => {
  it('ingests user_rollup.jsonl into user_rollups table', async () => {
    writeJsonl(testDir, 'user_rollup.jsonl', [userRollupRow]);
    const counts = await ingestDirectory(db, testDir);
    expect(counts.user_rollups).toBe(1);
    const rows = db.prepare('SELECT * FROM user_rollups').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].user).toBe('alice');
    expect(rows[0].total_gpu_mem_mb).toBe(4096.0);
  });
});

describe('ingestDirectory — host_summary.jsonl → host_summaries', () => {
  it('ingests host_summary.jsonl into host_summaries table', async () => {
    writeJsonl(testDir, 'host_summary.jsonl', [hostSummaryRow]);
    const counts = await ingestDirectory(db, testDir);
    expect(counts.host_summaries).toBe(1);
    const rows = db.prepare('SELECT * FROM host_summaries').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].load_1).toBe(1.5);
    expect(rows[0].task_running).toBe(5);
  });
});

describe('ingestDirectory — all 4 files at once', () => {
  it('ingests all 4 JSONL files and returns correct counts', async () => {
    writeJsonl(testDir, 'gpu_device.jsonl', [gpuDeviceRow]);
    writeJsonl(testDir, 'gpu_process.jsonl', [gpuProcessRow]);
    writeJsonl(testDir, 'user_rollup.jsonl', [userRollupRow]);
    writeJsonl(testDir, 'host_summary.jsonl', [hostSummaryRow]);

    const counts = await ingestDirectory(db, testDir);
    expect(counts.gpu_devices).toBe(1);
    expect(counts.gpu_processes).toBe(1);
    expect(counts.user_rollups).toBe(1);
    expect(counts.host_summaries).toBe(1);
  });
});

describe('ingestDirectory — skips missing files without error', () => {
  it('does not throw when no files exist', async () => {
    // testDir is empty
    await expect(ingestDirectory(db, testDir)).resolves.toEqual({
      gpu_devices: 0,
      gpu_processes: 0,
      user_rollups: 0,
      host_summaries: 0,
    });
  });

  it('skips missing files but ingests present ones', async () => {
    writeJsonl(testDir, 'gpu_device.jsonl', [gpuDeviceRow]);
    // other files are missing
    const counts = await ingestDirectory(db, testDir);
    expect(counts.gpu_devices).toBe(1);
    expect(counts.gpu_processes).toBe(0);
    expect(counts.user_rollups).toBe(0);
    expect(counts.host_summaries).toBe(0);
  });
});

describe('ingestDirectory — deduplication', () => {
  it('does not insert duplicate rows with same ts_utc + server', async () => {
    writeJsonl(testDir, 'gpu_device.jsonl', [gpuDeviceRow]);

    // First ingest
    const counts1 = await ingestDirectory(db, testDir);
    expect(counts1.gpu_devices).toBe(1);

    // Second ingest (same file, same data)
    const counts2 = await ingestDirectory(db, testDir);
    expect(counts2.gpu_devices).toBe(0); // no new rows inserted

    // Only 1 row total in db
    const rows = db.prepare('SELECT * FROM gpu_devices').all();
    expect(rows).toHaveLength(1);
  });

  it('does insert rows with different ts_utc', async () => {
    const row2 = { ...gpuDeviceRow, ts_utc: '2026-01-01T01:00:00Z' };
    writeJsonl(testDir, 'gpu_device.jsonl', [gpuDeviceRow, row2]);

    const counts = await ingestDirectory(db, testDir);
    expect(counts.gpu_devices).toBe(2);
    const rows = db.prepare('SELECT * FROM gpu_devices').all();
    expect(rows).toHaveLength(2);
  });

  it('does insert rows with different server', async () => {
    const row2 = { ...gpuDeviceRow, server: 'server2' };
    writeJsonl(testDir, 'gpu_device.jsonl', [gpuDeviceRow, row2]);

    const counts = await ingestDirectory(db, testDir);
    expect(counts.gpu_devices).toBe(2);
    const rows = db.prepare('SELECT * FROM gpu_devices').all();
    expect(rows).toHaveLength(2);
  });

  it('dedup works for gpu_processes', async () => {
    writeJsonl(testDir, 'gpu_process.jsonl', [gpuProcessRow]);
    await ingestDirectory(db, testDir);
    const counts2 = await ingestDirectory(db, testDir);
    expect(counts2.gpu_processes).toBe(0);
    expect(db.prepare('SELECT * FROM gpu_processes').all()).toHaveLength(1);
  });

  it('dedup works for user_rollups', async () => {
    writeJsonl(testDir, 'user_rollup.jsonl', [userRollupRow]);
    await ingestDirectory(db, testDir);
    const counts2 = await ingestDirectory(db, testDir);
    expect(counts2.user_rollups).toBe(0);
    expect(db.prepare('SELECT * FROM user_rollups').all()).toHaveLength(1);
  });

  it('dedup works for host_summaries', async () => {
    writeJsonl(testDir, 'host_summary.jsonl', [hostSummaryRow]);
    await ingestDirectory(db, testDir);
    const counts2 = await ingestDirectory(db, testDir);
    expect(counts2.host_summaries).toBe(0);
    expect(db.prepare('SELECT * FROM host_summaries').all()).toHaveLength(1);
  });
});
