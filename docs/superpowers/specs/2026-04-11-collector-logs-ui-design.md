# Collector Logs UI

## Goal

Add a Logs page to the GPU Monitor UI so users can check if the collector is working and see error logs — accessible on Docker port 8267.

## Architecture

Polling-based REST approach, matching the existing frontend pattern (useEffect + setInterval). No new infrastructure (no WebSocket/SSE). The collector runs every ~60s, so 5s polling is sufficient.

## Backend

### New route: `server/src/routes/logs.js`

Factory function `logsRouter(db, collectorLogPath)` returning Express Router.

**`GET /api/logs`**
- Query params: `limit` (default 200, max 1000), `level` ("all" | "error", default "all")
- Reads `collector.log` from disk, parses each line as JSON
- Returns newest `limit` entries, filtered by level if specified
- Response: `{ entries: [{ ts_utc, server, step, msg?, error? }], total: number }`
- If file doesn't exist or is empty, returns `{ entries: [], total: 0 }`

**`GET /api/logs/runs`**
- Query params: `limit` (default 50, max 200)
- Queries `collector_runs` table: `SELECT * FROM collector_runs ORDER BY ts_utc DESC LIMIT ?`
- Response: `{ runs: [{ ts_utc, server, status, duration_ms, error }] }`

### Mount in `server/src/index.js`

```js
import { logsRouter } from './routes/logs.js';
app.use('/api/logs', logsRouter(db, collectorLogPath));
```

The `collectorLogPath` is derived from the same base directory as the collector — `path.join(process.cwd(), 'collector.log')`.

## Frontend

### New API functions in `client/src/api.js`

```js
export async function getLogs(limit = 200, level = 'all') { ... }
export async function getLogRuns(limit = 50) { ... }
```

### New page: `client/src/pages/LogsPage.jsx`

**Layout:**
- Top summary bar: collector status (running/stopped badge), last run timestamp, error count in current view
- Filter controls: "All" / "Errors Only" toggle buttons
- Log entries list: scrollable container showing log lines newest-at-bottom
- Each entry shows: timestamp (formatted), server name (color-coded badge), step, message or error text
- Error entries: red left border + red text for the error field
- Success entries ("done" step): green left border
- Info entries: default styling

**Behavior:**
- Polls `GET /api/logs` every 5 seconds
- Auto-scrolls to bottom when new entries arrive, unless user has scrolled up
- Filter toggle switches the `level` query param
- Uses the standard `useEffect` + `setInterval` + `cancelled` cleanup pattern

**Styling:** Inline styles matching existing dark theme:
- Background: `#1a1a2e`
- Card: `#16213e`
- Log container: `#0d1117` (slightly darker for terminal feel)
- Error text: `#e94560`
- Success text: `#4ecca3`
- Timestamp: `#888`
- Monospace font for log entries

### Navigation update: `client/src/App.jsx`

Add "Logs" link in sidebar between "Alerts" and "Settings", with a log/terminal icon. Route: `/logs` -> `<LogsPage />`.

## Data Flow

```
collect.sh writes collector.log (JSONL on disk)
  -> GET /api/logs reads + parses file, returns JSON
    -> LogsPage polls every 5s, renders entries

collector onRunComplete inserts into collector_runs table
  -> GET /api/logs/runs queries SQLite, returns JSON
    -> LogsPage summary bar shows last run info
```

## Error Handling

- If `collector.log` doesn't exist: return empty array, no error
- If a JSONL line fails to parse: skip it, don't crash the endpoint
- If the file is very large: read only the last `limit * 2` lines (generous buffer), parse, then slice to `limit` — avoids reading entire file into memory

## Files to Create/Modify

| File | Action |
|------|--------|
| `server/src/routes/logs.js` | Create — new route factory |
| `server/src/index.js` | Modify — import and mount logs router |
| `client/src/api.js` | Modify — add getLogs, getLogRuns functions |
| `client/src/pages/LogsPage.jsx` | Create — new page component |
| `client/src/App.jsx` | Modify — add route and sidebar link |
