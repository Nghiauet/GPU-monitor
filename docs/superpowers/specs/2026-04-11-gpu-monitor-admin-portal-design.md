# GPU Monitor Admin Portal — Design Spec

## Overview

A central pull-based monitoring system that SSHes into GPU servers every minute, captures GPU and host/process usage, and provides a web-based admin portal for viewing data, managing the collector, and configuring alerts. The primary objective is user-attribution — tracking who is using which GPUs over time.

## Architecture

Single-process Node/Express server that:
- Spawns a bash collector script on a configurable interval
- Ingests JSONL output into SQLite
- Serves a REST API for the React frontend
- Evaluates alert rules after each ingestion cycle
- Serves the React build as static files

```
┌─────────────────────────────────────────────────────┐
│  Central Monitor Machine                            │
│                                                     │
│  collect.sh ──▶ JSONL files ──▶ Ingestion ──▶ SQLite│
│       ▲                                       │     │
│       │ spawn/stop                     query   │     │
│  Node/Express ◀──────────────────────────────┘     │
│       │                                             │
│       ├─ REST API (/api/*)                          │
│       ├─ Alert Engine                               │
│       └─ Static file server (React build)           │
│                                                     │
│  React Frontend ◀── http://localhost:3000           │
└────────────┬───────────────────┬────────────────────┘
             │ SSH               │ SSH
             ▼                   ▼
        server1 (GPUs)     server2 (GPUs)
```

## Decisions

- **Single admin, no auth** — sole user, no login system
- **React + Node/Express** — full JS stack
- **SQLite** — zero-setup, single-file database; sufficient for 2 servers at 1-min cadence over 30 days
- **In-portal alerts only** — no external notifications (email/slack) in v1
- **Full collector control from UI** — start/stop, change interval, add/remove servers
- **JSONL preserved as audit trail** — ingestion copies data into SQLite but original files remain on disk

## Frontend

### Layout

Labeled sidebar with text navigation + collector status indicator at the bottom. Each section is a dedicated page. Dark theme. Filters (time range, server) available in page headers.

### Pages

**1. Users (default/home)**
- List of active users as rich cards, sorted by GPU memory consumption
- Each card shows: username, GPU count, total GPU memory, servers in use, active duration, alert indicator
- Click to expand/navigate to user detail:
  - Current GPU processes (PID, GPU index, command, GPU mem, CPU%, elapsed)
  - Historical usage chart (GPU memory over time from user_rollup)
- Filters: time range picker, server selector

**2. GPUs**
- Grid/list of all GPU devices across both servers
- Each card: GPU name, utilization %, memory used/total, temperature
- Color-coded by utilization (green < 50%, yellow 50-80%, red > 80%)
- Click to see users/processes on that GPU

**3. Servers**
- One card per server: load averages, CPU breakdown, memory, swap
- Health indicator (green = reachable, red = SSH failure)
- Click to see all GPUs and processes on that server

**4. Alerts**
- List of triggered alerts: timestamp, rule name, target, message, acknowledged status
- Create/edit alert rules with: name, condition type, target, threshold, duration, enabled toggle

**5. Settings**
- Collector control: start/stop toggle, interval configuration, last run status and time
- Server management: add/remove servers (hostname, SSH user, SSH key path, enabled toggle)
- Data retention: configure retention days, trigger manual cleanup
- Log viewer: tail of collector.log

## Data Model

### Core tables (from JSONL ingestion)

**gpu_processes**
| Column | Type |
|--------|------|
| ts_utc | TEXT (ISO 8601) |
| server | TEXT |
| hostname | TEXT |
| gpu_index | INTEGER |
| gpu_uuid | TEXT |
| pid | INTEGER |
| user | TEXT |
| process_name | TEXT |
| cmd | TEXT |
| gpu_mem_mb | REAL |
| cpu_pct | REAL |
| mem_pct | REAL |
| elapsed_sec | INTEGER |
| state | TEXT |

**user_rollups**
| Column | Type |
|--------|------|
| ts_utc | TEXT |
| server | TEXT |
| hostname | TEXT |
| user | TEXT |
| process_count | INTEGER |
| gpu_count | INTEGER |
| total_gpu_mem_mb | REAL |
| avg_cpu_pct | REAL |
| max_cpu_pct | REAL |

**gpu_devices**
| Column | Type |
|--------|------|
| ts_utc | TEXT |
| server | TEXT |
| hostname | TEXT |
| gpu_index | INTEGER |
| gpu_name | TEXT |
| gpu_util_pct | REAL |
| mem_util_pct | REAL |
| mem_used_mb | REAL |
| mem_total_mb | REAL |
| temp_c | REAL |

**host_summaries**
| Column | Type |
|--------|------|
| ts_utc | TEXT |
| server | TEXT |
| hostname | TEXT |
| load_1 | REAL |
| load_5 | REAL |
| load_15 | REAL |
| cpu_user_pct | REAL |
| cpu_system_pct | REAL |
| cpu_idle_pct | REAL |
| mem_total_mb | REAL |
| mem_used_mb | REAL |
| mem_free_mb | REAL |
| swap_total_mb | REAL |
| swap_used_mb | REAL |
| task_total | INTEGER |
| task_running | INTEGER |
| task_sleeping | INTEGER |

### Portal tables

**servers**
| Column | Type |
|--------|------|
| id | INTEGER PRIMARY KEY |
| name | TEXT UNIQUE |
| hostname | TEXT |
| ssh_user | TEXT |
| ssh_key_path | TEXT |
| enabled | INTEGER (0/1) |
| created_at | TEXT |

**alert_rules**
| Column | Type |
|--------|------|
| id | INTEGER PRIMARY KEY |
| name | TEXT |
| condition_type | TEXT |
| target | TEXT |
| threshold | REAL |
| duration_min | INTEGER |
| enabled | INTEGER (0/1) |
| created_at | TEXT |

**alerts**
| Column | Type |
|--------|------|
| id | INTEGER PRIMARY KEY |
| rule_id | INTEGER REFERENCES alert_rules(id) |
| ts_utc | TEXT |
| server | TEXT |
| user | TEXT |
| message | TEXT |
| acknowledged | INTEGER (0/1) |

**collector_runs**
| Column | Type |
|--------|------|
| id | INTEGER PRIMARY KEY |
| ts_utc | TEXT |
| server | TEXT |
| status | TEXT |
| duration_ms | INTEGER |
| error | TEXT |

### Indexes

- `gpu_processes`: (ts_utc, user), (ts_utc, server)
- `user_rollups`: (ts_utc, user), (user, ts_utc)
- `gpu_devices`: (ts_utc, server, gpu_index)
- `host_summaries`: (ts_utc, server)

### Retention

Daily cleanup deletes rows older than 30 days from all core tables. JSONL daily directories older than 30 days are removed from disk.

## REST API

### User data
- `GET /api/users` — active users with latest rollup. `?from=&to=&server=`
- `GET /api/users/:username` — user detail: current processes + historical rollup
- `GET /api/users/:username/history` — user_rollup time-series. `?from=&to=`

### GPU data
- `GET /api/gpus` — latest GPU device snapshot. `?server=`
- `GET /api/gpus/:server/:gpuIndex` — GPU detail + current processes + history
- `GET /api/gpus/:server/:gpuIndex/history` — gpu_device time-series. `?from=&to=`

### Server data
- `GET /api/servers` — configured servers with latest host_summary and health
- `GET /api/servers/:name` — server detail: host summary + GPUs + processes
- `GET /api/servers/:name/history` — host_summary time-series. `?from=&to=`

### Alerts
- `GET /api/alerts` — triggered alerts, newest first. `?acknowledged=false`
- `POST /api/alerts/:id/acknowledge` — mark as acknowledged
- `GET /api/alert-rules` — list rules
- `POST /api/alert-rules` — create rule
- `PUT /api/alert-rules/:id` — update rule
- `DELETE /api/alert-rules/:id` — delete rule

### Collector control
- `GET /api/collector/status` — running state, interval, last run, errors
- `POST /api/collector/start` — start collector
- `POST /api/collector/stop` — stop collector
- `PUT /api/collector/config` — update interval

### Server management
- `POST /api/servers` — add server
- `PUT /api/servers/:name` — update server config
- `DELETE /api/servers/:name` — remove server

### Data management
- `GET /api/stats` — DB size, row counts, oldest/newest timestamps
- `POST /api/cleanup` — trigger manual retention cleanup

All endpoints return JSON. Time-series endpoints default to last 24 hours without explicit from/to. Frontend polls key endpoints every ~10 seconds for near-real-time updates.

## Collector

### Script: collect.sh

Single bash script spawned by the Node server. Dependency-free — uses only ssh, nvidia-smi, ps, top, awk, date.

**Per-server flow:**
1. Read config.json for server list and output directory
2. For each enabled server (partial failure tolerant):
   - SSH with ControlMaster multiplexing (single connection, multiple commands)
   - `nvidia-smi --query-gpu=index,name,utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,gpu_uuid --format=csv,noheader,nounits` → GPU device inventory
   - `nvidia-smi --query-compute-apps=pid,used_gpu_memory,gpu_uuid --format=csv,noheader,nounits` → GPU processes
   - `ps` against discovered PIDs → user, cpu_pct, mem_pct, elapsed_sec, state, command
   - `top -bn1` → host-level CPU, memory, load, task counts
   - Join process rows to device rows by gpu_uuid to resolve gpu_index
   - Compute user_rollup by aggregating per-user
   - Write four JSONL files to `logs/YYYY-MM-DD/<server>/`
3. Log success/failure per server to collector.log
4. Exit 0 even on partial failure

**Config file** (config.json at project root):
```json
{
  "servers": [
    {
      "name": "server1",
      "hostname": "server1.local",
      "ssh_user": "monitor",
      "ssh_key_path": "~/.ssh/id_rsa",
      "enabled": true
    }
  ],
  "interval_seconds": 60,
  "log_dir": "./logs",
  "retention_days": 30
}
```

### Node-side collector manager

- Spawns collect.sh via child_process on setInterval
- Tracks child PID for stop/status
- After each run, triggers ingestion worker
- Exposes state to /api/collector/status

## Alert Engine

Runs in-process after each ingestion cycle. Evaluates enabled rules against recent SQLite data.

### Condition types

| Type | Target | Description |
|------|--------|-------------|
| `user_gpu_mem_exceeds` | username | User total GPU memory > threshold for duration |
| `user_gpu_count_exceeds` | username | User GPU count > threshold for duration |
| `gpu_idle` | server:gpu_index | GPU utilization < threshold for duration |
| `server_load_exceeds` | server | load_1 > threshold for duration |
| `server_unreachable` | server | Failed collection for N consecutive runs (threshold = consecutive failure count, duration_min ignored) |
| `gpu_temp_exceeds` | server:gpu_index | GPU temperature > threshold for duration |

### Duration check

Looks back `duration_min` minutes. Alert fires only if every snapshot in the window exceeds the threshold. Prevents transient spikes from triggering.

### Dedup

Same rule+target won't fire again until the condition clears (drops below threshold for at least one snapshot) and then re-triggers.

## Project Structure

```
GPU-monitor/
├── config.json
├── collect.sh
├── logs/
│   └── YYYY-MM-DD/<server>/*.jsonl
├── collector.log
├── gpu_monitor.db
├── server/
│   ├── package.json
│   ├── src/
│   │   ├── index.js
│   │   ├── db.js
│   │   ├── collector.js
│   │   ├── ingestion.js
│   │   ├── alerts.js
│   │   ├── cleanup.js
│   │   └── routes/
│   │       ├── users.js
│   │       ├── gpus.js
│   │       ├── servers.js
│   │       ├── alerts.js
│   │       ├── collector.js
│   │       └── stats.js
│   └── test/
├── client/
│   ├── package.json
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── Layout.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   ├── UserCard.jsx
│   │   │   ├── GpuCard.jsx
│   │   │   ├── ServerCard.jsx
│   │   │   ├── AlertBadge.jsx
│   │   │   ├── TimeRangePicker.jsx
│   │   │   ├── UsageChart.jsx
│   │   │   └── StatusIndicator.jsx
│   │   └── pages/
│   │       ├── UsersPage.jsx
│   │       ├── UserDetailPage.jsx
│   │       ├── GpusPage.jsx
│   │       ├── ServersPage.jsx
│   │       ├── AlertsPage.jsx
│   │       └── SettingsPage.jsx
│   └── public/
└── docs/
```

## Test Plan

- Manual single-run test against both servers verifies all four JSONL outputs
- Confirm active GPU processes appear in gpu_process.jsonl with correct user and PID
- Confirm user_rollup.jsonl accumulates correctly over multiple minutes
- Verify gpu_device.jsonl matches direct nvidia-smi output
- Verify host_summary.jsonl captures expected load, CPU, and memory from top
- Simulate SSH failure: collector logs error and continues with other server
- Idle-server behavior: no gpu_process rows, but gpu_device and host_summary still written
- API endpoint tests: each route returns expected shape and filters work
- Frontend: verify each page renders with sample data, navigation works, filters apply
- Alert engine: create rule, verify it fires when threshold is exceeded across duration window
- Collector control: start/stop from UI, verify interval changes take effect
- Server management: add/remove server from UI, verify next collection run uses updated list
