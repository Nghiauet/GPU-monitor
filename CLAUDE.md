# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
# Start everything (production: builds frontend, serves on :3001)
./start.sh

# Start everything (development: backend :3001 with auto-restart, Vite :3000 with HMR)
./start.sh dev

# Server only
cd server && npm start          # production
cd server && node --watch src/index.js  # dev with auto-restart

# Client only
cd client && npm run dev        # Vite dev server on :3000, proxies /api to :3001
cd client && npm run build      # production build to client/dist/

# Tests (vitest, server only)
cd server && npx vitest run              # all tests
cd server && npx vitest run test/db.test.js  # single file
cd server && npx vitest                  # watch mode

# Manual collector run
bash collect.sh config.json
```

## Architecture

Single-process Node/Express server that manages everything: spawns a bash collector on interval, ingests JSONL into SQLite, evaluates alert rules, serves REST API + React static build.

```
collect.sh (bash/SSH) → JSONL files → ingestion.js → SQLite ← REST API ← React frontend
                                                        ↑
                                                   alerts.js (post-ingestion)
```

**Data flow per collection cycle:**
1. `CollectorManager` spawns `collect.sh` with `config.json` path
2. `collect.sh` SSHes into each server, runs nvidia-smi/ps/top, writes 4 JSONL files to `logs/YYYY-MM-DD/<server>/`
3. `onRunComplete` callback triggers `ingestDirectory()` per server (JSONL → SQLite with ts_utc+server dedup)
4. `evaluateAlerts()` runs all enabled rules against recent data

**Key modules (`server/src/`):**
- `db.js` — schema init (8 tables, 6 indexes), WAL mode, foreign keys
- `collector.js` — `CollectorManager` class: spawn/stop/interval via child_process.spawn
- `ingestion.js` — reads JSONL, dedup check, transactional batch insert
- `alerts.js` — 6 condition types, duration-based evaluation, dedup by unacknowledged
- `cleanup.js` — retention: delete old DB rows + remove old log directories
- `routes/*.js` — factory functions returning Express Router, pattern: `export function xRouter(db, configPath?)`

## Key Patterns

- **ES modules everywhere** — both server and client use `"type": "module"`. Use `import`/`export`, file extensions in imports.
- **Route factory DI** — each route file exports a function that takes `db` (and `configPath` for server/stats routes) and returns a Router. No global state.
- **Per-server latest queries** — time-series tables have different MAX(ts_utc) per server. Always use `WHERE ts_utc = (SELECT MAX(ts_utc) FROM table WHERE server = outer.server)` not a global MAX.
- **Config as source of truth for servers** — server CRUD reads/writes `config.json` directly (not the `servers` SQLite table). The bash collector also parses this file with awk.
- **SQLite prepared statements** — all queries use `.prepare()` with parameterized values. Batch inserts use `db.transaction()`.
- **Frontend polling** — pages use `useEffect` + `setInterval(load, 10000)` with a `cancelled` flag for cleanup. No websockets.
- **Inline styles** — React components use style objects, no CSS files. Dark theme palette: bg `#1a1a2e`, cards `#16213e`, borders `#2a3a5c`, text `#e0e0e0`, accent red `#e94560`, green `#4ecca3`.

## Config Format

`config.json` at project root — read by both the Node server and the bash collector:

```json
{
  "servers": [{ "name": "server1", "hostname": "server1", "ssh_user": "...", "ssh_key_path": "~/.ssh/...", "enabled": true }],
  "interval_seconds": 60,
  "log_dir": "./logs",
  "retention_days": 30
}
```

SSH connectivity depends on `~/.ssh/config` for Host aliases (port, HostName resolution). The `hostname` field matches the SSH config `Host` entry.

## Testing

Tests are in `server/test/`. Each test creates an isolated temp SQLite database and cleans up after (including WAL sidecar files). Test helpers create temp dirs for JSONL fixtures. Alert tests insert synthetic time-series data to verify threshold/duration logic.
