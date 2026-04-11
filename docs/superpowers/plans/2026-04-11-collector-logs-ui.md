# Collector Logs UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Logs page to the GPU Monitor UI that shows collector activity and highlights errors, polled every 5 seconds.

**Architecture:** New REST endpoint reads `collector.log` JSONL file from disk, returns parsed entries. New React page polls this endpoint, renders entries in a terminal-style scrollable log viewer with error highlighting and filtering.

**Tech Stack:** Express route (ES modules), React with inline styles, existing polling pattern (useEffect + setInterval)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `server/src/routes/logs.js` | Create | Express route factory: `GET /` reads collector.log, `GET /runs` queries collector_runs table |
| `server/src/index.js` | Modify (lines 16, 65) | Import and mount logsRouter at `/api/logs` |
| `client/src/api.js` | Modify (append) | Add `getLogs()` and `getLogRuns()` functions |
| `client/src/pages/LogsPage.jsx` | Create | Log viewer page component |
| `client/src/App.jsx` | Modify (lines 8, 20) | Import LogsPage, add `/logs` route |
| `client/src/components/Sidebar.jsx` | Modify (line 12) | Add Logs nav item between Alerts and Settings |
| `server/test/logs.test.js` | Create | Tests for the logs route |

---

### Task 1: Backend — Logs Route

**Files:**
- Create: `server/src/routes/logs.js`
- Create: `server/test/logs.test.js`

- [ ] **Step 1: Write failing test for GET /api/logs**

Create `server/test/logs.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import express from 'express';
import request from 'supertest';
import { logsRouter } from '../src/routes/logs.js';

function tmpDb() {
  const Database = (await import('better-sqlite3')).default;
  const dbPath = join(tmpdir(), `logs-test-${Date.now()}.db`);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS collector_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts_utc TEXT NOT NULL,
    server TEXT NOT NULL,
    status TEXT NOT NULL,
    duration_ms INTEGER,
    error TEXT
  )`);
  return { db, dbPath };
}

describe('GET /api/logs', () => {
  let app, logPath, tmpDir;

  beforeAll(async () => {
    tmpDir = join(tmpdir(), `logs-route-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    logPath = join(tmpDir, 'collector.log');

    const lines = [
      JSON.stringify({ ts_utc: '2026-04-11T10:00:00Z', server: 'collector', step: 'start', msg: 'starting' }),
      JSON.stringify({ ts_utc: '2026-04-11T10:00:01Z', server: 'server1', step: 'ssh_connect', error: 'SSH failed' }),
      JSON.stringify({ ts_utc: '2026-04-11T10:00:02Z', server: 'collector', step: 'done', msg: 'completed' }),
    ];
    writeFileSync(logPath, lines.join('\n') + '\n');

    const { db } = await tmpDb();
    app = express();
    app.use('/api/logs', logsRouter(db, logPath));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns all log entries by default', async () => {
    const res = await request(app).get('/api/logs');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(3);
    expect(res.body.entries[0].step).toBe('start');
  });

  it('filters to errors only with level=error', async () => {
    const res = await request(app).get('/api/logs?level=error');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].error).toBe('SSH failed');
  });

  it('respects limit param', async () => {
    const res = await request(app).get('/api/logs?limit=1');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
  });

  it('returns empty array when file does not exist', async () => {
    const app2 = express();
    const { db } = await tmpDb();
    app2.use('/api/logs', logsRouter(db, '/nonexistent/collector.log'));
    const res = await request(app2).get('/api/logs');
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run test/logs.test.js`
Expected: FAIL — `logsRouter` not found

- [ ] **Step 3: Implement logsRouter**

Create `server/src/routes/logs.js`:

```js
import { Router } from 'express';
import { readFileSync, existsSync } from 'fs';

export function logsRouter(db, collectorLogPath) {
  const router = Router();

  router.get('/', (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 200, 1), 1000);
      const level = req.query.level || 'all';

      if (!existsSync(collectorLogPath)) {
        return res.json({ entries: [], total: 0 });
      }

      const raw = readFileSync(collectorLogPath, 'utf8');
      const lines = raw.trim().split('\n').filter(Boolean);

      let entries = [];
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line));
        } catch {
          // skip malformed lines
        }
      }

      if (level === 'error') {
        entries = entries.filter(e => e.error);
      }

      const total = entries.length;
      entries = entries.slice(-limit);

      res.json({ entries, total });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/runs', (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
      const runs = db.prepare(
        'SELECT ts_utc, server, status, duration_ms, error FROM collector_runs ORDER BY ts_utc DESC LIMIT ?'
      ).all(limit);
      res.json({ runs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run test/logs.test.js`
Expected: PASS — all 4 tests green

- [ ] **Step 5: Add test for GET /api/logs/runs**

Append to `server/test/logs.test.js`:

```js
describe('GET /api/logs/runs', () => {
  it('returns collector runs from the database', async () => {
    const { db, dbPath } = await tmpDb();
    db.prepare('INSERT INTO collector_runs (ts_utc, server, status, duration_ms, error) VALUES (?, ?, ?, ?, ?)')
      .run('2026-04-11T10:00:00Z', 'server1', 'ok', 1500, null);
    db.prepare('INSERT INTO collector_runs (ts_utc, server, status, duration_ms, error) VALUES (?, ?, ?, ?, ?)')
      .run('2026-04-11T10:01:00Z', 'server1', 'error', 500, 'SSH timeout');

    const app2 = express();
    app2.use('/api/logs', logsRouter(db, '/nonexistent'));
    const res = await request(app2).get('/api/logs/runs');

    expect(res.status).toBe(200);
    expect(res.body.runs).toHaveLength(2);
    expect(res.body.runs[0].ts_utc).toBe('2026-04-11T10:01:00Z');
    expect(res.body.runs[1].status).toBe('ok');

    db.close();
    rmSync(dbPath, { force: true });
    rmSync(dbPath + '-wal', { force: true });
    rmSync(dbPath + '-shm', { force: true });
  });
});
```

- [ ] **Step 6: Run all logs tests**

Run: `cd server && npx vitest run test/logs.test.js`
Expected: PASS — all 5 tests green

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/logs.js server/test/logs.test.js
git commit -m "feat: add /api/logs route for collector log entries and runs"
```

---

### Task 2: Mount Logs Route in Server

**Files:**
- Modify: `server/src/index.js` (lines 16, 65)

- [ ] **Step 1: Import logsRouter**

In `server/src/index.js`, add after line 16 (`import { statsRouter } from './routes/stats.js';`):

```js
import { logsRouter } from './routes/logs.js';
```

- [ ] **Step 2: Derive collector log path and mount route**

In `server/src/index.js`, add after line 24 (`const COLLECT_SCRIPT = ...`):

```js
const COLLECTOR_LOG = join(ROOT_DIR, 'collector.log');
```

Add after line 65 (`app.use('/api/stats', statsRouter(db, CONFIG_PATH));`):

```js
app.use('/api/logs', logsRouter(db, COLLECTOR_LOG));
```

- [ ] **Step 3: Verify server starts**

Run: `cd server && node --check src/index.js`
Expected: No output (syntax valid)

- [ ] **Step 4: Commit**

```bash
git add server/src/index.js
git commit -m "feat: mount /api/logs route in server"
```

---

### Task 3: Frontend API Functions

**Files:**
- Modify: `client/src/api.js` (append after line 75)

- [ ] **Step 1: Add getLogs and getLogRuns API functions**

Append to `client/src/api.js` after the `// Stats / Cleanup` section:

```js

// Logs
export const getLogs = (params) => fetchJSON('/logs' + toQuery(params))
export const getLogRuns = (params) => fetchJSON('/logs/runs' + toQuery(params))
```

- [ ] **Step 2: Commit**

```bash
git add client/src/api.js
git commit -m "feat: add getLogs and getLogRuns API functions"
```

---

### Task 4: LogsPage Component

**Files:**
- Create: `client/src/pages/LogsPage.jsx`

- [ ] **Step 1: Create LogsPage.jsx**

Create `client/src/pages/LogsPage.jsx`:

```jsx
import { useState, useEffect, useRef } from 'react'
import RefreshButton from '../components/RefreshButton.jsx'
import { useRefreshKey } from '../hooks/useRefreshKey.js'
import { getLogs, getCollectorStatus } from '../api.js'

function formatTs(ts) {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
  } catch {
    return ts
  }
}

function formatDate(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ts
  }
}

export default function LogsPage() {
  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [level, setLevel] = useState('all')
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState(null)
  const [refreshKey, refresh] = useRefreshKey()
  const logEndRef = useRef(null)
  const containerRef = useRef(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [logData, statusData] = await Promise.all([
          getLogs({ limit: 200, level }),
          getCollectorStatus(),
        ])
        if (!cancelled) {
          setEntries(logData.entries || [])
          setTotal(logData.total || 0)
          setStatus(statusData)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const id = setInterval(load, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [refreshKey, level])

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [entries, autoScroll])

  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }

  const errorCount = entries.filter(e => e.error).length
  const isRunning = status?.running === true
  const lastRun = status?.lastRunAt || status?.lastRun || null

  if (loading) {
    return <div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>Loading...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#e0e0e0', margin: 0 }}>Collector Logs</h1>
        <RefreshButton onRefresh={refresh} />
      </div>

      {/* Summary bar */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '12px',
        padding: '10px 14px',
        background: '#16213e',
        borderRadius: '8px',
        border: '1px solid #2a3a5c',
        fontSize: '13px',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <span style={{ color: isRunning ? '#4ecca3' : '#888', fontWeight: 600 }}>
          {isRunning ? '● Running' : '○ Stopped'}
        </span>
        {lastRun && <span style={{ color: '#888' }}>Last run: {formatDate(lastRun)}</span>}
        <span style={{ color: '#888' }}>Showing {entries.length} of {total} entries</span>
        {errorCount > 0 && <span style={{ color: '#e94560', fontWeight: 600 }}>{errorCount} errors</span>}

        {/* Filter */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
          {['all', 'error'].map(l => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              style={{
                background: level === l ? '#e94560' : '#1a1a2e',
                color: level === l ? '#fff' : '#888',
                border: '1px solid #2a3a5c',
                borderRadius: '4px',
                padding: '4px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {l === 'all' ? 'All' : 'Errors Only'}
            </button>
          ))}
        </div>
      </div>

      {/* Log container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          background: '#0d1117',
          borderRadius: '8px',
          border: '1px solid #2a3a5c',
          padding: '12px',
          overflowY: 'auto',
          fontFamily: '"Fira Code", "Cascadia Code", "Consolas", monospace',
          fontSize: '12px',
          lineHeight: '1.6',
          minHeight: '300px',
        }}
      >
        {entries.length === 0 ? (
          <div style={{ color: '#888', textAlign: 'center', padding: '40px' }}>
            {level === 'error' ? 'No errors found' : 'No log entries yet'}
          </div>
        ) : (
          entries.map((entry, i) => {
            const isError = !!entry.error
            const isSuccess = entry.step === 'done' && !entry.error
            return (
              <div
                key={i}
                style={{
                  padding: '2px 8px',
                  borderLeft: `3px solid ${isError ? '#e94560' : isSuccess ? '#4ecca3' : 'transparent'}`,
                  marginBottom: '1px',
                  background: isError ? 'rgba(233, 69, 96, 0.08)' : 'transparent',
                }}
              >
                <span style={{ color: '#555' }}>{formatTs(entry.ts_utc)}</span>
                {' '}
                <span style={{ color: '#6e7681' }}>[{entry.server}]</span>
                {' '}
                <span style={{
                  color: entry.step === 'start' ? '#58a6ff'
                    : entry.step === 'done' ? '#4ecca3'
                    : entry.step === 'skip' ? '#6e7681'
                    : '#c9d1d9',
                  fontWeight: 500,
                }}>{entry.step}</span>
                {' '}
                <span style={{ color: isError ? '#e94560' : '#8b949e' }}>
                  {entry.error || entry.msg || ''}
                </span>
              </div>
            )
          })
        )}
        <div ref={logEndRef} />
      </div>

      {/* Auto-scroll indicator */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true)
            logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
          }}
          style={{
            position: 'sticky',
            bottom: '8px',
            alignSelf: 'center',
            background: '#2a3a5c',
            color: '#e0e0e0',
            border: '1px solid #3a4a6c',
            borderRadius: '16px',
            padding: '4px 16px',
            fontSize: '12px',
            cursor: 'pointer',
            marginTop: '8px',
          }}
        >
          ↓ Scroll to latest
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/LogsPage.jsx
git commit -m "feat: add LogsPage component with log viewer and error filtering"
```

---

### Task 5: Wire Up Route and Navigation

**Files:**
- Modify: `client/src/App.jsx` (lines 8, 20)
- Modify: `client/src/components/Sidebar.jsx` (line 12)

- [ ] **Step 1: Add LogsPage route to App.jsx**

In `client/src/App.jsx`, add after line 8 (`import SettingsPage from './pages/SettingsPage.jsx'`):

```js
import LogsPage from './pages/LogsPage.jsx'
```

Add after line 20 (`<Route path="alerts" element={<AlertsPage />} />`):

```jsx
        <Route path="logs" element={<LogsPage />} />
```

- [ ] **Step 2: Add Logs nav item to Sidebar.jsx**

In `client/src/components/Sidebar.jsx`, change the `navItems` array. Insert Logs between Alerts and Settings. Replace the array (lines 7-13):

```js
const navItems = [
  { to: '/users', label: 'Users', icon: '👤' },
  { to: '/gpus', label: 'GPUs', icon: '⚡' },
  { to: '/servers', label: 'Servers', icon: '🖥' },
  { to: '/alerts', label: 'Alerts', icon: '🔔', badge: true },
  { to: '/logs', label: 'Logs', icon: '📋' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]
```

- [ ] **Step 3: Build frontend to verify no compile errors**

Run: `cd client && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add client/src/App.jsx client/src/components/Sidebar.jsx
git commit -m "feat: add Logs page to navigation and routing"
```

---

### Task 6: Manual Integration Test

- [ ] **Step 1: Start the dev server**

Run: `./start.sh dev`

- [ ] **Step 2: Open browser and verify**

Navigate to `http://localhost:3000/logs` (dev) or `http://localhost:8267/logs` (Docker).

Verify:
- Logs page loads and shows entries from collector.log
- Error entries have red left border and red text
- "Errors Only" filter works
- Summary bar shows collector status, last run time, error count
- New entries appear within 5 seconds of a collector run
- Auto-scroll works: scrolls to bottom on new entries, stops when you scroll up, "Scroll to latest" button appears

- [ ] **Step 3: Final commit if any fixes needed**
