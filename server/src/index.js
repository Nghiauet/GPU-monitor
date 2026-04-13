import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { readFileSync, existsSync } from 'fs';

import { createDb, closeDb } from './db.js';
import { CollectorManager } from './collector.js';
import { ingestDirectory } from './ingestion.js';
import { evaluateAlerts } from './alerts.js';
import { login, logout, requireAuth } from './auth.js';
import { usersRouter } from './routes/users.js';
import { gpusRouter } from './routes/gpus.js';
import { serversRouter } from './routes/servers.js';
import { alertsRouter } from './routes/alerts.js';
import { collectorRouter } from './routes/collector.js';
import { statsRouter } from './routes/stats.js';
import { logsRouter } from './routes/logs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const ROOT_DIR = resolve(__dirname, '..', '..');
const CONFIG_PATH = join(ROOT_DIR, 'config.json');
const DB_PATH = process.env.DB_PATH || join(ROOT_DIR, 'gpu_monitor.db');
const COLLECT_SCRIPT = join(ROOT_DIR, 'collect.sh');

export const db = createDb(DB_PATH);

async function onRunComplete({ code, lastRunAt, lastDurationMs, lastError } = {}) {
  const ts = lastRunAt || new Date().toISOString();
  const runStatus = (code != null && code !== 0) ? 'error' : 'ok';
  const runError = lastError || null;

  // Read config separately so a parse failure doesn't silently kill ingestion
  let config;
  try {
    config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    console.error('[onRunComplete] Failed to read config:', err);
    return;
  }

  const today = ts.slice(0, 10); // YYYY-MM-DD
  const servers = config.servers || [];

  for (const server of servers) {
    if (!server.enabled) continue;

    // Record run status per server (using actual exit code, not always 'ok')
    try {
      db.prepare('INSERT INTO collector_runs (ts_utc, server, status, duration_ms, error) VALUES (?, ?, ?, ?, ?)')
        .run(ts, server.name, runStatus, lastDurationMs || 0, runError);
    } catch (err) {
      console.error(`[onRunComplete] Failed to record run for ${server.name}:`, err);
    }

    // Ingest collected data, awaiting each to ensure completion before alerts
    const logDir = join(ROOT_DIR, 'logs', today, server.name);
    if (existsSync(logDir)) {
      try {
        await ingestDirectory(db, logDir);
      } catch (err) {
        console.error(`[onRunComplete] Ingestion failed for ${server.name}:`, err);
      }
    }
  }

  // Evaluate alerts only after all ingestion is complete
  try {
    evaluateAlerts(db);
  } catch (err) {
    console.error('[onRunComplete] Alert evaluation failed:', err);
  }
}

export const collector = new CollectorManager(CONFIG_PATH, COLLECT_SCRIPT, onRunComplete);

export const app = express();

app.use(cors());
app.use(express.json());

// Auth endpoints (before requireAuth middleware)
app.post('/api/auth/login', (req, res) => {
  const result = login(req.body?.password);
  if (!result) return res.status(401).json({ error: 'Invalid password' });
  res.json(result);
});

app.post('/api/auth/logout', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) logout(token);
  res.json({ ok: true });
});

// All /api routes below require authentication
app.use('/api', requireAuth);

// API routes
app.use('/api/users', usersRouter(db));
app.use('/api/gpus', gpusRouter(db));
app.use('/api/servers', serversRouter(db, CONFIG_PATH));
app.use('/api/alerts', alertsRouter(db));
app.use('/api/collector', collectorRouter(collector));
app.use('/api/stats', statsRouter(db, CONFIG_PATH));
app.use('/api/logs', logsRouter(db, join(ROOT_DIR, 'collector.log')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React static build if it exists
const clientDist = join(ROOT_DIR, 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// SPA fallback: non-/api paths serve index.html
app.get(/^(?!\/api\/).*$/, (req, res) => {
  const indexHtml = join(clientDist, 'index.html');
  if (existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`GPU Monitor server listening on port ${PORT}`);
    console.log(`ROOT_DIR: ${ROOT_DIR}`);
    collector.start();
  });
}

// Graceful shutdown
function shutdown() {
  console.log('Shutting down...');
  collector.stop();
  closeDb(db);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
