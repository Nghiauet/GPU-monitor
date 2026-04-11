import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDb, closeDb } from '../src/db.js';
import { logsRouter } from '../src/routes/logs.js';
import { randomBytes } from 'crypto';
import { unlinkSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

function tmpDbPath() {
  return `/tmp/test-logs-${randomBytes(8).toString('hex')}.db`;
}

let db;
let dbPath;
let tmpDir;

beforeEach(() => {
  dbPath = tmpDbPath();
  db = createDb(dbPath);
  tmpDir = `/tmp/test-logs-dir-${randomBytes(8).toString('hex')}`;
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  closeDb(db);
  db = null;
  if (existsSync(dbPath)) unlinkSync(dbPath);
  for (const ext of ['-wal', '-shm']) {
    if (existsSync(dbPath + ext)) unlinkSync(dbPath + ext);
  }
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

function createApp(collectorLogPath) {
  const app = express();
  app.use(express.json());
  app.use('/api/logs', logsRouter(db, collectorLogPath));
  return app;
}

// ============================================================
// GET /api/logs
// ============================================================

describe('GET /api/logs', () => {
  it('returns all entries by default', async () => {
    const logPath = join(tmpDir, 'collector.log');
    const lines = [
      JSON.stringify({ ts_utc: '2026-04-11T14:29:41Z', server: 'collector', step: 'start', msg: 'collect.sh starting' }),
      JSON.stringify({ ts_utc: '2026-04-11T14:29:42Z', server: 'server1', step: 'ssh_connect', msg: 'connected' }),
      JSON.stringify({ ts_utc: '2026-04-11T14:29:43Z', server: 'server1', step: 'done', msg: 'finished' }),
    ];
    writeFileSync(logPath, lines.join('\n') + '\n');

    const app = createApp(logPath);
    const res = await request(app).get('/api/logs');

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(3);
    expect(res.body.total).toBe(3);
    expect(res.body.entries[0].server).toBe('collector');
  });

  it('filters to errors with level=error', async () => {
    const logPath = join(tmpDir, 'collector.log');
    const lines = [
      JSON.stringify({ ts_utc: '2026-04-11T14:29:41Z', server: 'collector', step: 'start', level: 'info', msg: 'starting' }),
      JSON.stringify({ ts_utc: '2026-04-11T14:29:42Z', server: 'server1', step: 'ssh_connect', level: 'error', error: 'SSH failed' }),
      JSON.stringify({ ts_utc: '2026-04-11T14:29:43Z', server: 'server2', step: 'done', level: 'info', msg: 'done' }),
    ];
    writeFileSync(logPath, lines.join('\n') + '\n');

    const app = createApp(logPath);
    const res = await request(app).get('/api/logs?level=error');

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].server).toBe('server1');
    expect(res.body.entries[0].error).toBe('SSH failed');
  });

  it('respects limit param', async () => {
    const logPath = join(tmpDir, 'collector.log');
    const lines = [];
    for (let i = 0; i < 10; i++) {
      lines.push(JSON.stringify({ ts_utc: `2026-04-11T14:29:${String(i).padStart(2, '0')}Z`, server: 'server1', step: 'step', msg: `msg ${i}` }));
    }
    writeFileSync(logPath, lines.join('\n') + '\n');

    const app = createApp(logPath);
    const res = await request(app).get('/api/logs?limit=3');

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(3);
    expect(res.body.total).toBe(10);
  });

  it('returns empty array when file does not exist', async () => {
    const logPath = join(tmpDir, 'nonexistent.log');

    const app = createApp(logPath);
    const res = await request(app).get('/api/logs');

    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
    expect(res.body.total).toBe(0);
  });
});

// ============================================================
// GET /api/logs/runs
// ============================================================

describe('GET /api/logs/runs', () => {
  it('returns collector runs newest-first', async () => {
    const logPath = join(tmpDir, 'collector.log');
    writeFileSync(logPath, '');

    // Insert rows into collector_runs
    const insert = db.prepare(
      'INSERT INTO collector_runs (ts_utc, server, status, duration_ms, error) VALUES (?, ?, ?, ?, ?)'
    );
    insert.run('2026-04-11T14:00:00Z', 'server1', 'ok', 1200, null);
    insert.run('2026-04-11T14:01:00Z', 'server2', 'error', 500, 'SSH timeout');
    insert.run('2026-04-11T14:02:00Z', 'server1', 'ok', 800, null);

    const app = createApp(logPath);
    const res = await request(app).get('/api/logs/runs');

    expect(res.status).toBe(200);
    expect(res.body.runs).toHaveLength(3);
    // Newest first
    expect(res.body.runs[0].ts_utc).toBe('2026-04-11T14:02:00Z');
    expect(res.body.runs[0].server).toBe('server1');
    expect(res.body.runs[1].ts_utc).toBe('2026-04-11T14:01:00Z');
    expect(res.body.runs[1].error).toBe('SSH timeout');
    expect(res.body.runs[2].ts_utc).toBe('2026-04-11T14:00:00Z');
  });

  it('respects limit param for runs', async () => {
    const logPath = join(tmpDir, 'collector.log');
    writeFileSync(logPath, '');

    const insert = db.prepare(
      'INSERT INTO collector_runs (ts_utc, server, status, duration_ms, error) VALUES (?, ?, ?, ?, ?)'
    );
    for (let i = 0; i < 10; i++) {
      insert.run(`2026-04-11T14:${String(i).padStart(2, '0')}:00Z`, 'server1', 'ok', 1000, null);
    }

    const app = createApp(logPath);
    const res = await request(app).get('/api/logs/runs?limit=5');

    expect(res.status).toBe(200);
    expect(res.body.runs).toHaveLength(5);
  });
});
