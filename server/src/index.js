import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { readFileSync, existsSync } from 'fs';

import { createDb, closeDb } from './db.js';
import { CollectorManager } from './collector.js';
import { ingestDirectory } from './ingestion.js';
import { evaluateAlerts } from './alerts.js';
import { usersRouter } from './routes/users.js';
import { gpusRouter } from './routes/gpus.js';
import { serversRouter } from './routes/servers.js';
import { alertsRouter } from './routes/alerts.js';
import { collectorRouter } from './routes/collector.js';
import { statsRouter } from './routes/stats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const ROOT_DIR = resolve(__dirname, '..', '..');
const CONFIG_PATH = join(ROOT_DIR, 'config.json');
const DB_PATH = process.env.DB_PATH || join(ROOT_DIR, 'gpu_monitor.db');
const COLLECT_SCRIPT = join(ROOT_DIR, 'collect.sh');

export const db = createDb(DB_PATH);

function onRunComplete({ lastRunAt, lastDurationMs } = {}) {
  const ts = lastRunAt || new Date().toISOString();
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    const today = ts.slice(0, 10); // YYYY-MM-DD

    const servers = config.servers || [];
    for (const server of servers) {
      if (!server.enabled) continue;
      const logDir = join(ROOT_DIR, 'logs', today, server.name);
      if (existsSync(logDir)) {
        ingestDirectory(db, logDir);
      }
      // Record successful run for each enabled server
      db.prepare('INSERT INTO collector_runs (ts_utc, server, status, duration_ms, error) VALUES (?, ?, ?, ?, ?)')
        .run(ts, server.name, 'ok', lastDurationMs || 0, null);
    }

    evaluateAlerts(db);
  } catch (err) {
    console.error('[onRunComplete] Error:', err);
  }
}

export const collector = new CollectorManager(CONFIG_PATH, COLLECT_SCRIPT, onRunComplete);

export const app = express();

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/users', usersRouter(db));
app.use('/api/gpus', gpusRouter(db));
app.use('/api/servers', serversRouter(db, CONFIG_PATH));
app.use('/api/alerts', alertsRouter(db));
app.use('/api/collector', collectorRouter(collector));
app.use('/api/stats', statsRouter(db, CONFIG_PATH));

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
