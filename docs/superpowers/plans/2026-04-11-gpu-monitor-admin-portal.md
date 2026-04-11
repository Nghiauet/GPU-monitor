# GPU Monitor Admin Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a central GPU monitoring system with a bash collector, Node/Express backend, SQLite storage, and React admin portal for user-attribution tracking across GPU servers.

**Architecture:** Single Node/Express process spawns a bash collector script on interval, ingests JSONL into SQLite, serves REST API + React static build. Alert engine evaluates rules after each ingestion cycle.

**Tech Stack:** Bash (collector), Node.js + Express (backend), better-sqlite3 (database), React + Vite (frontend), React Router (navigation), Recharts (charts), Vitest (testing)

**Spec:** `docs/superpowers/specs/2026-04-11-gpu-monitor-admin-portal-design.md`

**Security note:** The collector manager uses `child_process.spawn` (not `exec`) to invoke the bash collector script. `spawn` does not pass arguments through a shell, avoiding command injection. The script path and config path are controlled by the server, not user input.

---

## File Map

### Root
- `config.json` — Server list, collector interval, retention settings
- `collect.sh` — Bash collector script (SSH + nvidia-smi + ps + top)
- `.gitignore` — Ignore logs/, node_modules/, *.db, build output

### Server (`server/`)
- `server/package.json` — Backend dependencies
- `server/src/index.js` — Express app entry point, starts collector + serves static
- `server/src/db.js` — SQLite connection, schema initialization, query helpers
- `server/src/ingestion.js` — Reads JSONL files, inserts into SQLite
- `server/src/collector.js` — Spawns/stops collect.sh, tracks state
- `server/src/alerts.js` — Rule evaluator, runs after ingestion
- `server/src/cleanup.js` — Retention cleanup for DB rows + old log dirs
- `server/src/routes/users.js` — GET /api/users, /api/users/:username, /api/users/:username/history
- `server/src/routes/gpus.js` — GET /api/gpus, /api/gpus/:server/:gpuIndex, history
- `server/src/routes/servers.js` — GET/POST/PUT/DELETE /api/servers
- `server/src/routes/alerts.js` — CRUD for alert-rules + alert list/acknowledge
- `server/src/routes/collector.js` — GET status, POST start/stop, PUT config
- `server/src/routes/stats.js` — GET /api/stats, POST /api/cleanup
- `server/test/db.test.js` — DB schema + query tests
- `server/test/ingestion.test.js` — JSONL parsing + insertion tests
- `server/test/alerts.test.js` — Alert rule evaluation tests

### Client (`client/`)
- `client/package.json` — Frontend dependencies (Vite + React)
- `client/vite.config.js` — Vite config with API proxy
- `client/index.html` — Vite HTML entry
- `client/src/main.jsx` — React entry point
- `client/src/App.jsx` — Router + Layout
- `client/src/api.js` — Fetch wrapper for all API calls
- `client/src/components/Layout.jsx` — Sidebar + main content shell
- `client/src/components/Sidebar.jsx` — Navigation + collector status
- `client/src/components/UserCard.jsx` — User summary card
- `client/src/components/GpuCard.jsx` — GPU device card
- `client/src/components/ServerCard.jsx` — Server summary card
- `client/src/components/AlertBadge.jsx` — Unacknowledged alert count
- `client/src/components/TimeRangePicker.jsx` — Time range filter
- `client/src/components/UsageChart.jsx` — Recharts time-series chart
- `client/src/components/StatusIndicator.jsx` — Green/red/yellow dot
- `client/src/pages/UsersPage.jsx` — User list with filters
- `client/src/pages/UserDetailPage.jsx` — User processes + history chart
- `client/src/pages/GpusPage.jsx` — GPU device grid
- `client/src/pages/ServersPage.jsx` — Server cards with health
- `client/src/pages/AlertsPage.jsx` — Alert list + rule management
- `client/src/pages/SettingsPage.jsx` — Collector control + server mgmt + retention

---

## Phase 1: Foundation

### Task 1: Project Scaffolding

**Files:**
- Create: `.gitignore`, `config.json`, `server/package.json`, `server/src/index.js`

- [ ] **Step 1: Initialize git repo**

```bash
cd /home/vagrant/GPU-monitor
git init
```

- [ ] **Step 2: Create .gitignore**

Create `.gitignore`:
```
node_modules/
logs/
*.db
collector.log
client/dist/
.superpowers/
```

- [ ] **Step 3: Create default config.json**

Create `config.json`:
```json
{
  "servers": [
    {
      "name": "server1",
      "hostname": "server1",
      "ssh_user": "vagrant",
      "ssh_key_path": "~/.ssh/id_rsa",
      "enabled": true
    },
    {
      "name": "server2",
      "hostname": "server2",
      "ssh_user": "vagrant",
      "ssh_key_path": "~/.ssh/id_rsa",
      "enabled": true
    }
  ],
  "interval_seconds": 60,
  "log_dir": "./logs",
  "retention_days": 30
}
```

- [ ] **Step 4: Create server/package.json and install dependencies**

Create `server/package.json`:
```json
{
  "name": "gpu-monitor-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "cors": "^2.8.5",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  }
}
```

Run: `cd /home/vagrant/GPU-monitor/server && npm install`

- [ ] **Step 5: Create minimal Express entry point**

Create `server/src/index.js`:
```js
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..', '..');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`GPU Monitor server listening on port ${PORT}`);
});

export { app, ROOT_DIR };
```

- [ ] **Step 6: Verify server starts**

Run: `cd /home/vagrant/GPU-monitor/server && node src/index.js &`
Run: `curl http://localhost:3001/api/health`
Expected: `{"status":"ok","ts":"..."}`
Kill the server.

- [ ] **Step 7: Commit**

```bash
cd /home/vagrant/GPU-monitor
git add .gitignore config.json server/package.json server/package-lock.json server/src/index.js
git commit -m "feat: project scaffolding with Express server"
```

---

### Task 2: SQLite Database Layer

**Files:**
- Create: `server/src/db.js`, `server/test/db.test.js`

- [ ] **Step 1: Write failing test for DB initialization**

Create `server/test/db.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, closeDb } from '../src/db.js';
import { unlinkSync } from 'fs';

const TEST_DB = '/tmp/gpu_monitor_test.db';

describe('db', () => {
  let db;

  beforeEach(() => {
    try { unlinkSync(TEST_DB); } catch {}
    db = createDb(TEST_DB);
  });

  afterEach(() => {
    closeDb(db);
    try { unlinkSync(TEST_DB); } catch {}
  });

  it('creates all core tables', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);

    expect(tables).toContain('gpu_processes');
    expect(tables).toContain('user_rollups');
    expect(tables).toContain('gpu_devices');
    expect(tables).toContain('host_summaries');
    expect(tables).toContain('servers');
    expect(tables).toContain('alert_rules');
    expect(tables).toContain('alerts');
    expect(tables).toContain('collector_runs');
  });

  it('inserts and queries gpu_processes', () => {
    db.prepare(`INSERT INTO gpu_processes
      (ts_utc, server, hostname, gpu_index, gpu_uuid, pid, user, process_name, cmd, gpu_mem_mb, cpu_pct, mem_pct, elapsed_sec, state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('2026-04-11T12:00:00Z', 'server1', 'gpu-server-1', 0, 'GPU-uuid-0', 1234, 'alice', 'python', 'python train.py', 8192, 95.0, 12.5, 3600, 'R');

    const rows = db.prepare('SELECT * FROM gpu_processes WHERE user = ?').all('alice');
    expect(rows).toHaveLength(1);
    expect(rows[0].gpu_mem_mb).toBe(8192);
    expect(rows[0].pid).toBe(1234);
  });

  it('inserts and queries user_rollups', () => {
    db.prepare(`INSERT INTO user_rollups
      (ts_utc, server, hostname, user, process_count, gpu_count, total_gpu_mem_mb, avg_cpu_pct, max_cpu_pct)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('2026-04-11T12:00:00Z', 'server1', 'gpu-server-1', 'alice', 3, 2, 16384, 85.0, 99.0);

    const rows = db.prepare('SELECT * FROM user_rollups WHERE user = ?').all('alice');
    expect(rows).toHaveLength(1);
    expect(rows[0].gpu_count).toBe(2);
  });

  it('inserts and queries gpu_devices', () => {
    db.prepare(`INSERT INTO gpu_devices
      (ts_utc, server, hostname, gpu_index, gpu_name, gpu_util_pct, mem_util_pct, mem_used_mb, mem_total_mb, temp_c)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('2026-04-11T12:00:00Z', 'server1', 'gpu-server-1', 0, 'NVIDIA A100', 73.0, 65.0, 26624, 40960, 62.0);

    const rows = db.prepare('SELECT * FROM gpu_devices WHERE gpu_name = ?').all('NVIDIA A100');
    expect(rows).toHaveLength(1);
    expect(rows[0].temp_c).toBe(62.0);
  });

  it('inserts and queries host_summaries', () => {
    db.prepare(`INSERT INTO host_summaries
      (ts_utc, server, hostname, load_1, load_5, load_15, cpu_user_pct, cpu_system_pct, cpu_idle_pct, mem_total_mb, mem_used_mb, mem_free_mb, swap_total_mb, swap_used_mb, task_total, task_running, task_sleeping)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('2026-04-11T12:00:00Z', 'server1', 'gpu-server-1', 4.2, 3.8, 3.5, 45.0, 5.0, 50.0, 65536, 32768, 32768, 8192, 1024, 250, 3, 247);

    const rows = db.prepare('SELECT * FROM host_summaries WHERE server = ?').all('server1');
    expect(rows).toHaveLength(1);
    expect(rows[0].load_1).toBe(4.2);
  });

  it('creates indexes', () => {
    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
    ).all().map(r => r.name);

    expect(indexes).toContain('idx_gpu_processes_ts_user');
    expect(indexes).toContain('idx_gpu_processes_ts_server');
    expect(indexes).toContain('idx_user_rollups_ts_user');
    expect(indexes).toContain('idx_user_rollups_user_ts');
    expect(indexes).toContain('idx_gpu_devices_ts_server_gpu');
    expect(indexes).toContain('idx_host_summaries_ts_server');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/vagrant/GPU-monitor/server && npx vitest run test/db.test.js`
Expected: FAIL — module `../src/db.js` does not exist

- [ ] **Step 3: Implement db.js**

Create `server/src/db.js`:
```js
import Database from 'better-sqlite3';

export function createDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

export function closeDb(db) {
  if (db && db.open) db.close();
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gpu_processes (
      ts_utc TEXT NOT NULL,
      server TEXT NOT NULL,
      hostname TEXT NOT NULL,
      gpu_index INTEGER NOT NULL,
      gpu_uuid TEXT NOT NULL,
      pid INTEGER NOT NULL,
      user TEXT NOT NULL,
      process_name TEXT NOT NULL,
      cmd TEXT NOT NULL,
      gpu_mem_mb REAL NOT NULL,
      cpu_pct REAL NOT NULL,
      mem_pct REAL NOT NULL,
      elapsed_sec INTEGER NOT NULL,
      state TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_rollups (
      ts_utc TEXT NOT NULL,
      server TEXT NOT NULL,
      hostname TEXT NOT NULL,
      user TEXT NOT NULL,
      process_count INTEGER NOT NULL,
      gpu_count INTEGER NOT NULL,
      total_gpu_mem_mb REAL NOT NULL,
      avg_cpu_pct REAL NOT NULL,
      max_cpu_pct REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gpu_devices (
      ts_utc TEXT NOT NULL,
      server TEXT NOT NULL,
      hostname TEXT NOT NULL,
      gpu_index INTEGER NOT NULL,
      gpu_name TEXT NOT NULL,
      gpu_util_pct REAL NOT NULL,
      mem_util_pct REAL NOT NULL,
      mem_used_mb REAL NOT NULL,
      mem_total_mb REAL NOT NULL,
      temp_c REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS host_summaries (
      ts_utc TEXT NOT NULL,
      server TEXT NOT NULL,
      hostname TEXT NOT NULL,
      load_1 REAL NOT NULL,
      load_5 REAL NOT NULL,
      load_15 REAL NOT NULL,
      cpu_user_pct REAL NOT NULL,
      cpu_system_pct REAL NOT NULL,
      cpu_idle_pct REAL NOT NULL,
      mem_total_mb REAL NOT NULL,
      mem_used_mb REAL NOT NULL,
      mem_free_mb REAL NOT NULL,
      swap_total_mb REAL NOT NULL,
      swap_used_mb REAL NOT NULL,
      task_total INTEGER NOT NULL,
      task_running INTEGER NOT NULL,
      task_sleeping INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      hostname TEXT NOT NULL,
      ssh_user TEXT NOT NULL,
      ssh_key_path TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alert_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      condition_type TEXT NOT NULL,
      target TEXT NOT NULL,
      threshold REAL NOT NULL,
      duration_min INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER NOT NULL REFERENCES alert_rules(id),
      ts_utc TEXT NOT NULL,
      server TEXT,
      user TEXT,
      message TEXT NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS collector_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts_utc TEXT NOT NULL,
      server TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_gpu_processes_ts_user ON gpu_processes(ts_utc, user);
    CREATE INDEX IF NOT EXISTS idx_gpu_processes_ts_server ON gpu_processes(ts_utc, server);
    CREATE INDEX IF NOT EXISTS idx_user_rollups_ts_user ON user_rollups(ts_utc, user);
    CREATE INDEX IF NOT EXISTS idx_user_rollups_user_ts ON user_rollups(user, ts_utc);
    CREATE INDEX IF NOT EXISTS idx_gpu_devices_ts_server_gpu ON gpu_devices(ts_utc, server, gpu_index);
    CREATE INDEX IF NOT EXISTS idx_host_summaries_ts_server ON host_summaries(ts_utc, server);
  `);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/vagrant/GPU-monitor/server && npx vitest run test/db.test.js`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /home/vagrant/GPU-monitor
git add server/src/db.js server/test/db.test.js
git commit -m "feat: SQLite database layer with schema and indexes"
```

---

### Task 3: Collector Bash Script

**Files:**
- Create: `collect.sh`

- [ ] **Step 1: Create collect.sh**

Create `collect.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

# GPU Monitor Collector
# Usage: ./collect.sh /path/to/config.json
# Reads server list from config, SSHes into each, gathers GPU/host data,
# writes JSONL files to logs/YYYY-MM-DD/<server>/

CONFIG_FILE="${1:?Usage: collect.sh /path/to/config.json}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Config file not found: $CONFIG_FILE" >&2
  exit 1
fi

# Parse config with awk (no jq dependency)
LOG_DIR=$(awk -F'"' '/"log_dir"/{print $4}' "$CONFIG_FILE")
LOG_DIR="${LOG_DIR:-.\/logs}"

# Resolve relative to config file directory
CONFIG_DIR=$(cd "$(dirname "$CONFIG_FILE")" && pwd)
case "$LOG_DIR" in
  ./*) LOG_DIR="$CONFIG_DIR/${LOG_DIR#./}" ;;
  /*) ;;
  *) LOG_DIR="$CONFIG_DIR/$LOG_DIR" ;;
esac

COLLECTOR_LOG="$CONFIG_DIR/collector.log"
TODAY=$(date -u +%Y-%m-%d)
TS_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)

log_error() {
  local server="$1" step="$2" msg="$3"
  echo "{\"ts_utc\":\"$TS_UTC\",\"server\":\"$server\",\"step\":\"$step\",\"error\":\"$msg\"}" >> "$COLLECTOR_LOG"
}

log_info() {
  local server="$1" msg="$2"
  echo "{\"ts_utc\":\"$TS_UTC\",\"server\":\"$server\",\"step\":\"info\",\"message\":\"$msg\"}" >> "$COLLECTOR_LOG"
}

# Extract server list from config (awk-based JSON parsing)
# Produces lines: name|hostname|ssh_user|ssh_key_path|enabled
parse_servers() {
  awk '
    /"servers"/ { in_servers=1 }
    in_servers && /{/ { in_obj=1; name=""; host=""; user=""; key=""; enabled="" }
    in_obj && /"name"/ { gsub(/.*"name"[[:space:]]*:[[:space:]]*"/, ""); gsub(/".*/, ""); name=$0 }
    in_obj && /"hostname"/ { gsub(/.*"hostname"[[:space:]]*:[[:space:]]*"/, ""); gsub(/".*/, ""); host=$0 }
    in_obj && /"ssh_user"/ { gsub(/.*"ssh_user"[[:space:]]*:[[:space:]]*"/, ""); gsub(/".*/, ""); user=$0 }
    in_obj && /"ssh_key_path"/ { gsub(/.*"ssh_key_path"[[:space:]]*:[[:space:]]*"/, ""); gsub(/".*/, ""); key=$0 }
    in_obj && /"enabled"/ { gsub(/.*"enabled"[[:space:]]*:[[:space:]]*/, ""); gsub(/[,[:space:]].*/, ""); enabled=$0 }
    in_obj && /}/ { if (name != "" && enabled == "true") print name"|"host"|"user"|"key; in_obj=0 }
    /]/ && in_servers { in_servers=0 }
  ' "$CONFIG_FILE"
}

# SSH wrapper with timeout
run_ssh() {
  local user="$1" host="$2" key="$3" cmd="$4"
  ssh -o ConnectTimeout=10 \
      -o StrictHostKeyChecking=no \
      -o BatchMode=yes \
      -i "$key" \
      "${user}@${host}" "$cmd" 2>/dev/null
}

collect_server() {
  local name="$1" host="$2" user="$3" key="$4"
  local out_dir="$LOG_DIR/$TODAY/$name"
  mkdir -p "$out_dir"

  # Expand ~ in key path
  key="${key/#\~/$HOME}"

  local remote_hostname
  remote_hostname=$(run_ssh "$user" "$host" "$key" "hostname") || {
    log_error "$name" "ssh" "Failed to connect to $host"
    echo "ssh_fail"
    return
  }

  # 1. GPU device inventory
  local gpu_csv
  gpu_csv=$(run_ssh "$user" "$host" "$key" \
    "nvidia-smi --query-gpu=index,name,utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,gpu_uuid --format=csv,noheader,nounits 2>/dev/null") || {
    log_error "$name" "nvidia-smi-gpu" "Failed to query GPU devices"
    echo "nvidia_fail"
    return
  }

  # Write gpu_device.jsonl
  echo "$gpu_csv" | while IFS=', ' read -r idx gname gutil mutil mused mtotal temp uuid; do
    idx=$(echo "$idx" | xargs)
    gname=$(echo "$gname" | xargs)
    gutil=$(echo "$gutil" | xargs)
    mutil=$(echo "$mutil" | xargs)
    mused=$(echo "$mused" | xargs)
    mtotal=$(echo "$mtotal" | xargs)
    temp=$(echo "$temp" | xargs)
    uuid=$(echo "$uuid" | xargs)
    echo "{\"ts_utc\":\"$TS_UTC\",\"server\":\"$name\",\"hostname\":\"$remote_hostname\",\"gpu_index\":$idx,\"gpu_name\":\"$gname\",\"gpu_util_pct\":$gutil,\"mem_util_pct\":$mutil,\"mem_used_mb\":$mused,\"mem_total_mb\":$mtotal,\"temp_c\":$temp}"
  done >> "$out_dir/gpu_device.jsonl"

  # 2. GPU compute processes
  local proc_csv
  proc_csv=$(run_ssh "$user" "$host" "$key" \
    "nvidia-smi --query-compute-apps=pid,used_gpu_memory,gpu_uuid --format=csv,noheader,nounits 2>/dev/null") || {
    log_error "$name" "nvidia-smi-apps" "Failed to query GPU processes"
    proc_csv=""
  }

  if [[ -z "$proc_csv" || "$proc_csv" == *"no running"* ]]; then
    log_info "$name" "No active GPU processes"
  else
    # Build PID list for ps lookup
    local pids
    pids=$(echo "$proc_csv" | awk -F', ' '{print $1}' | xargs | tr ' ' ',')

    # 3. Process details via ps
    local ps_output
    ps_output=$(run_ssh "$user" "$host" "$key" \
      "ps -p $pids -o pid=,user=,%cpu=,%mem=,etimes=,stat=,args= 2>/dev/null") || {
      log_error "$name" "ps" "Failed to query process details for PIDs: $pids"
      ps_output=""
    }

    # Write gpu_process.jsonl
    echo "$proc_csv" | while IFS=', ' read -r ppid gmem guuid; do
      ppid=$(echo "$ppid" | xargs)
      gmem=$(echo "$gmem" | xargs)
      guuid=$(echo "$guuid" | xargs)

      # Find gpu_index for this uuid
      local gidx
      gidx=$(echo "$gpu_csv" | awk -F', ' -v uuid="$guuid" '{
        u=$8; gsub(/^[[:space:]]+|[[:space:]]+$/, "", u);
        if (u == uuid) { i=$1; gsub(/^[[:space:]]+|[[:space:]]+$/, "", i); print i; exit }
      }')
      gidx="${gidx:-0}"

      # Find ps info for this PID
      local ps_line
      ps_line=$(echo "$ps_output" | awk -v pid="$ppid" '{
        gsub(/^[[:space:]]+/, "");
        if ($1 == pid) { print; exit }
      }')

      if [[ -n "$ps_line" ]]; then
        local puser pcpu pmem pelapsed pstate pcmd pname
        puser=$(echo "$ps_line" | awk '{print $2}')
        pcpu=$(echo "$ps_line" | awk '{print $3}')
        pmem=$(echo "$ps_line" | awk '{print $4}')
        pelapsed=$(echo "$ps_line" | awk '{print $5}')
        pstate=$(echo "$ps_line" | awk '{print $6}')
        pcmd=$(echo "$ps_line" | awk '{for(i=7;i<=NF;i++) printf "%s ", $i; print ""}' | sed 's/ *$//' | sed 's/"/\\"/g')
        pname=$(echo "$pcmd" | awk '{print $1}' | xargs basename 2>/dev/null || echo "$pcmd")
      else
        puser="unknown"; pcpu="0"; pmem="0"; pelapsed="0"; pstate="?"; pcmd="unknown"; pname="unknown"
      fi

      echo "{\"ts_utc\":\"$TS_UTC\",\"server\":\"$name\",\"hostname\":\"$remote_hostname\",\"gpu_index\":$gidx,\"gpu_uuid\":\"$guuid\",\"pid\":$ppid,\"user\":\"$puser\",\"process_name\":\"$pname\",\"cmd\":\"$pcmd\",\"gpu_mem_mb\":$gmem,\"cpu_pct\":$pcpu,\"mem_pct\":$pmem,\"elapsed_sec\":$pelapsed,\"state\":\"$pstate\"}"
    done >> "$out_dir/gpu_process.jsonl"

    # 4. Compute user_rollup
    echo "$proc_csv" | awk -F', ' -v ts="$TS_UTC" -v srv="$name" -v hn="$remote_hostname" -v ps_out="$ps_output" '
    BEGIN {
      n = split(ps_out, lines, "\n")
      for (i = 1; i <= n; i++) {
        gsub(/^[[:space:]]+/, "", lines[i])
        split(lines[i], f, /[[:space:]]+/)
        ps_cpu[f[1]] = f[3]
        ps_user[f[1]] = f[2]
      }
    }
    {
      pid = $1; gsub(/^[[:space:]]+|[[:space:]]+$/, "", pid)
      gmem = $2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", gmem)
      uuid = $3; gsub(/^[[:space:]]+|[[:space:]]+$/, "", uuid)

      u = ps_user[pid]
      if (u == "") u = "unknown"
      cpu = ps_cpu[pid] + 0

      user_procs[u]++
      user_gpumem[u] += gmem
      user_cpusum[u] += cpu
      user_cpumax[u] = (cpu > user_cpumax[u]) ? cpu : user_cpumax[u]
      user_gpus[u][uuid] = 1
    }
    END {
      for (u in user_procs) {
        gc = 0
        for (uid in user_gpus[u]) gc++
        avg = (user_procs[u] > 0) ? user_cpusum[u] / user_procs[u] : 0
        printf "{\"ts_utc\":\"%s\",\"server\":\"%s\",\"hostname\":\"%s\",\"user\":\"%s\",\"process_count\":%d,\"gpu_count\":%d,\"total_gpu_mem_mb\":%.0f,\"avg_cpu_pct\":%.1f,\"max_cpu_pct\":%.1f}\n", ts, srv, hn, u, user_procs[u], gc, user_gpumem[u], avg, user_cpumax[u]
      }
    }' >> "$out_dir/user_rollup.jsonl"
  fi

  # 5. Host summary via top
  local top_output
  top_output=$(run_ssh "$user" "$host" "$key" "top -bn1 | head -20") || {
    log_error "$name" "top" "Failed to get host summary"
    echo "partial"
    return
  }

  # Parse top output
  local load_1 load_5 load_15 cpu_user cpu_sys cpu_idle
  local mem_total mem_used mem_free swap_total swap_used
  local task_total task_running task_sleeping

  load_1=$(echo "$top_output" | awk '/load average/{gsub(/.*load average:[[:space:]]*/, ""); split($0, a, ","); gsub(/[[:space:]]/, "", a[1]); print a[1]}')
  load_5=$(echo "$top_output" | awk '/load average/{gsub(/.*load average:[[:space:]]*/, ""); split($0, a, ","); gsub(/[[:space:]]/, "", a[2]); print a[2]}')
  load_15=$(echo "$top_output" | awk '/load average/{gsub(/.*load average:[[:space:]]*/, ""); split($0, a, ","); gsub(/[[:space:]]/, "", a[3]); print a[3]}')

  cpu_user=$(echo "$top_output" | awk '/%Cpu/{gsub(/.*:[[:space:]]*/, ""); split($0, a, ","); gsub(/[[:space:]]*us.*/, "", a[1]); print a[1]}')
  cpu_sys=$(echo "$top_output" | awk '/%Cpu/{gsub(/.*:[[:space:]]*/, ""); split($0, a, ","); gsub(/[[:space:]]*sy.*/, "", a[2]); print a[2]+0}')
  cpu_idle=$(echo "$top_output" | awk '/%Cpu/{gsub(/.*:[[:space:]]*/, ""); split($0, a, ","); gsub(/[[:space:]]*id.*/, "", a[4]); print a[4]+0}')

  local mem_line
  mem_line=$(echo "$top_output" | grep -i "mem :")
  local mem_unit="MiB"
  echo "$mem_line" | grep -qi "kib" && mem_unit="KiB"

  mem_total=$(echo "$mem_line" | awk '{for(i=1;i<=NF;i++) if($(i+1)=="total,") print $i}')
  mem_free=$(echo "$mem_line" | awk '{for(i=1;i<=NF;i++) if($(i+1)=="free,") print $i}')
  mem_used=$(echo "$mem_line" | awk '{for(i=1;i<=NF;i++) if($(i+1)=="used,") print $i}')

  if [[ "$mem_unit" == "KiB" ]]; then
    mem_total=$(awk "BEGIN{printf \"%.0f\", ${mem_total:-0}/1024}")
    mem_free=$(awk "BEGIN{printf \"%.0f\", ${mem_free:-0}/1024}")
    mem_used=$(awk "BEGIN{printf \"%.0f\", ${mem_used:-0}/1024}")
  fi

  local swap_line
  swap_line=$(echo "$top_output" | grep -i "swap:")
  swap_total=$(echo "$swap_line" | awk '{for(i=1;i<=NF;i++) if($(i+1)=="total,") print $i}')
  swap_used=$(echo "$swap_line" | awk '{for(i=1;i<=NF;i++) if($(i+1)=="used.") print $i}')
  if [[ "$mem_unit" == "KiB" ]]; then
    swap_total=$(awk "BEGIN{printf \"%.0f\", ${swap_total:-0}/1024}")
    swap_used=$(awk "BEGIN{printf \"%.0f\", ${swap_used:-0}/1024}")
  fi

  task_total=$(echo "$top_output" | awk '/Tasks:/{gsub(/.*Tasks:[[:space:]]*/, ""); split($0, a, ","); print a[1]+0}')
  task_running=$(echo "$top_output" | awk '/Tasks:/{gsub(/.*Tasks:[[:space:]]*/, ""); split($0, a, ","); gsub(/[^0-9]/, "", a[2]); print a[2]+0}')
  task_sleeping=$(echo "$top_output" | awk '/Tasks:/{gsub(/.*Tasks:[[:space:]]*/, ""); split($0, a, ","); gsub(/[^0-9]/, "", a[3]); print a[3]+0}')

  echo "{\"ts_utc\":\"$TS_UTC\",\"server\":\"$name\",\"hostname\":\"$remote_hostname\",\"load_1\":${load_1:-0},\"load_5\":${load_5:-0},\"load_15\":${load_15:-0},\"cpu_user_pct\":${cpu_user:-0},\"cpu_system_pct\":${cpu_sys:-0},\"cpu_idle_pct\":${cpu_idle:-0},\"mem_total_mb\":${mem_total:-0},\"mem_used_mb\":${mem_used:-0},\"mem_free_mb\":${mem_free:-0},\"swap_total_mb\":${swap_total:-0},\"swap_used_mb\":${swap_used:-0},\"task_total\":${task_total:-0},\"task_running\":${task_running:-0},\"task_sleeping\":${task_sleeping:-0}}" >> "$out_dir/host_summary.jsonl"

  log_info "$name" "Collection complete"
  echo "ok"
}

# Main loop over servers
parse_servers | while IFS='|' read -r name host user key; do
  echo "Collecting from $name ($host)..." >&2
  result=$(collect_server "$name" "$host" "$user" "$key")
  if [[ "$result" == "ssh_fail" || "$result" == "nvidia_fail" ]]; then
    echo "FAILED: $name ($result)" >&2
  else
    echo "OK: $name" >&2
  fi
done

exit 0
```

- [ ] **Step 2: Make executable**

Run: `chmod +x /home/vagrant/GPU-monitor/collect.sh`

- [ ] **Step 3: Verify script parses config correctly**

Run: `cd /home/vagrant/GPU-monitor && bash -n collect.sh` (syntax check)
Expected: No output (no syntax errors)

Run: `cd /home/vagrant/GPU-monitor && bash collect.sh config.json 2>&1 | head -5`
Expected: Either "Collecting from server1..." or SSH connection errors (expected since servers may not be reachable). The script should not crash.

- [ ] **Step 4: Commit**

```bash
cd /home/vagrant/GPU-monitor
git add collect.sh
git commit -m "feat: bash collector script for GPU/host data gathering"
```

---

## Phase 2: Backend Core

### Task 4: JSONL Ingestion Worker

**Files:**
- Create: `server/src/ingestion.js`, `server/test/ingestion.test.js`

- [ ] **Step 1: Write failing test**

Create `server/test/ingestion.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, closeDb } from '../src/db.js';
import { ingestDirectory } from '../src/ingestion.js';
import { mkdirSync, writeFileSync, rmSync, unlinkSync } from 'fs';
import { join } from 'path';

const TEST_DB = '/tmp/gpu_monitor_ingest_test.db';
const TEST_LOG_DIR = '/tmp/gpu_monitor_test_logs';

describe('ingestion', () => {
  let db;

  beforeEach(() => {
    try { unlinkSync(TEST_DB); } catch {}
    try { rmSync(TEST_LOG_DIR, { recursive: true }); } catch {}
    db = createDb(TEST_DB);

    const serverDir = join(TEST_LOG_DIR, '2026-04-11', 'server1');
    mkdirSync(serverDir, { recursive: true });

    writeFileSync(join(serverDir, 'gpu_device.jsonl'),
      '{"ts_utc":"2026-04-11T12:00:00Z","server":"server1","hostname":"gpu-srv-1","gpu_index":0,"gpu_name":"NVIDIA A100","gpu_util_pct":73,"mem_util_pct":65,"mem_used_mb":26624,"mem_total_mb":40960,"temp_c":62}\n' +
      '{"ts_utc":"2026-04-11T12:00:00Z","server":"server1","hostname":"gpu-srv-1","gpu_index":1,"gpu_name":"NVIDIA A100","gpu_util_pct":45,"mem_util_pct":30,"mem_used_mb":12288,"mem_total_mb":40960,"temp_c":55}\n'
    );

    writeFileSync(join(serverDir, 'gpu_process.jsonl'),
      '{"ts_utc":"2026-04-11T12:00:00Z","server":"server1","hostname":"gpu-srv-1","gpu_index":0,"gpu_uuid":"GPU-abc","pid":1234,"user":"alice","process_name":"python","cmd":"python train.py","gpu_mem_mb":8192,"cpu_pct":95,"mem_pct":12.5,"elapsed_sec":3600,"state":"R"}\n'
    );

    writeFileSync(join(serverDir, 'user_rollup.jsonl'),
      '{"ts_utc":"2026-04-11T12:00:00Z","server":"server1","hostname":"gpu-srv-1","user":"alice","process_count":1,"gpu_count":1,"total_gpu_mem_mb":8192,"avg_cpu_pct":95,"max_cpu_pct":95}\n'
    );

    writeFileSync(join(serverDir, 'host_summary.jsonl'),
      '{"ts_utc":"2026-04-11T12:00:00Z","server":"server1","hostname":"gpu-srv-1","load_1":4.2,"load_5":3.8,"load_15":3.5,"cpu_user_pct":45,"cpu_system_pct":5,"cpu_idle_pct":50,"mem_total_mb":65536,"mem_used_mb":32768,"mem_free_mb":32768,"swap_total_mb":8192,"swap_used_mb":1024,"task_total":250,"task_running":3,"task_sleeping":247}\n'
    );
  });

  afterEach(() => {
    closeDb(db);
    try { unlinkSync(TEST_DB); } catch {}
    try { rmSync(TEST_LOG_DIR, { recursive: true }); } catch {}
  });

  it('ingests gpu_device.jsonl into gpu_devices table', () => {
    const result = ingestDirectory(db, join(TEST_LOG_DIR, '2026-04-11', 'server1'));
    expect(result.gpu_devices).toBe(2);

    const rows = db.prepare('SELECT * FROM gpu_devices ORDER BY gpu_index').all();
    expect(rows).toHaveLength(2);
    expect(rows[0].gpu_name).toBe('NVIDIA A100');
    expect(rows[0].gpu_util_pct).toBe(73);
    expect(rows[1].gpu_index).toBe(1);
  });

  it('ingests gpu_process.jsonl into gpu_processes table', () => {
    const result = ingestDirectory(db, join(TEST_LOG_DIR, '2026-04-11', 'server1'));
    expect(result.gpu_processes).toBe(1);

    const rows = db.prepare('SELECT * FROM gpu_processes').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].user).toBe('alice');
    expect(rows[0].pid).toBe(1234);
  });

  it('ingests user_rollup.jsonl into user_rollups table', () => {
    const result = ingestDirectory(db, join(TEST_LOG_DIR, '2026-04-11', 'server1'));
    expect(result.user_rollups).toBe(1);

    const rows = db.prepare('SELECT * FROM user_rollups').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].user).toBe('alice');
    expect(rows[0].total_gpu_mem_mb).toBe(8192);
  });

  it('ingests host_summary.jsonl into host_summaries table', () => {
    const result = ingestDirectory(db, join(TEST_LOG_DIR, '2026-04-11', 'server1'));
    expect(result.host_summaries).toBe(1);

    const rows = db.prepare('SELECT * FROM host_summaries').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].load_1).toBe(4.2);
    expect(rows[0].mem_total_mb).toBe(65536);
  });

  it('skips missing JSONL files without error', () => {
    const emptyDir = join(TEST_LOG_DIR, '2026-04-11', 'empty-server');
    mkdirSync(emptyDir, { recursive: true });
    const result = ingestDirectory(db, emptyDir);
    expect(result.gpu_devices).toBe(0);
    expect(result.gpu_processes).toBe(0);
  });

  it('does not duplicate rows on re-ingest of same timestamp', () => {
    ingestDirectory(db, join(TEST_LOG_DIR, '2026-04-11', 'server1'));
    ingestDirectory(db, join(TEST_LOG_DIR, '2026-04-11', 'server1'));

    const rows = db.prepare('SELECT * FROM gpu_devices').all();
    expect(rows).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/vagrant/GPU-monitor/server && npx vitest run test/ingestion.test.js`
Expected: FAIL — cannot resolve `../src/ingestion.js`

- [ ] **Step 3: Implement ingestion.js**

Create `server/src/ingestion.js`:
```js
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const FILE_TABLE_MAP = {
  'gpu_device.jsonl': 'gpu_devices',
  'gpu_process.jsonl': 'gpu_processes',
  'user_rollup.jsonl': 'user_rollups',
  'host_summary.jsonl': 'host_summaries',
};

const TABLE_COLUMNS = {
  gpu_devices: ['ts_utc', 'server', 'hostname', 'gpu_index', 'gpu_name', 'gpu_util_pct', 'mem_util_pct', 'mem_used_mb', 'mem_total_mb', 'temp_c'],
  gpu_processes: ['ts_utc', 'server', 'hostname', 'gpu_index', 'gpu_uuid', 'pid', 'user', 'process_name', 'cmd', 'gpu_mem_mb', 'cpu_pct', 'mem_pct', 'elapsed_sec', 'state'],
  user_rollups: ['ts_utc', 'server', 'hostname', 'user', 'process_count', 'gpu_count', 'total_gpu_mem_mb', 'avg_cpu_pct', 'max_cpu_pct'],
  host_summaries: ['ts_utc', 'server', 'hostname', 'load_1', 'load_5', 'load_15', 'cpu_user_pct', 'cpu_system_pct', 'cpu_idle_pct', 'mem_total_mb', 'mem_used_mb', 'mem_free_mb', 'swap_total_mb', 'swap_used_mb', 'task_total', 'task_running', 'task_sleeping'],
};

export function ingestDirectory(db, dirPath) {
  const counts = { gpu_devices: 0, gpu_processes: 0, user_rollups: 0, host_summaries: 0 };

  for (const [filename, table] of Object.entries(FILE_TABLE_MAP)) {
    const filePath = join(dirPath, filename);
    if (!existsSync(filePath)) continue;

    const lines = readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean);
    if (lines.length === 0) continue;

    const columns = TABLE_COLUMNS[table];
    const placeholders = columns.map(() => '?').join(', ');

    // Dedup: check if we already have data for this timestamp+server combo
    const firstRow = JSON.parse(lines[0]);
    const existing = db.prepare(
      `SELECT COUNT(*) as cnt FROM ${table} WHERE ts_utc = ? AND server = ?`
    ).get(firstRow.ts_utc, firstRow.server);

    if (existing.cnt > 0) continue;

    const insert = db.prepare(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
    );

    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        insert.run(...columns.map(col => row[col] ?? null));
      }
    });

    const parsed = lines.map(line => JSON.parse(line));
    insertMany(parsed);
    counts[table] = parsed.length;
  }

  return counts;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/vagrant/GPU-monitor/server && npx vitest run test/ingestion.test.js`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /home/vagrant/GPU-monitor
git add server/src/ingestion.js server/test/ingestion.test.js
git commit -m "feat: JSONL ingestion worker with dedup"
```

---

### Task 5: Collector Manager

**Files:**
- Create: `server/src/collector.js`, `server/test/collector.test.js`

- [ ] **Step 1: Write failing test**

Create `server/test/collector.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CollectorManager } from '../src/collector.js';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';

const TEST_CONFIG = '/tmp/gpu_monitor_test_config.json';

describe('CollectorManager', () => {
  let manager;

  beforeEach(() => {
    writeFileSync(TEST_CONFIG, JSON.stringify({
      servers: [{ name: 'test1', hostname: 'localhost', ssh_user: 'test', ssh_key_path: '~/.ssh/id_rsa', enabled: true }],
      interval_seconds: 60,
      log_dir: '/tmp/gpu_monitor_test_logs',
      retention_days: 30
    }));
    manager = new CollectorManager(TEST_CONFIG, '/tmp/fake_collect.sh');
  });

  afterEach(() => {
    manager.stop();
    try { unlinkSync(TEST_CONFIG); } catch {}
  });

  it('starts in stopped state', () => {
    const status = manager.getStatus();
    expect(status.running).toBe(false);
    expect(status.lastRunAt).toBeNull();
    expect(status.lastError).toBeNull();
  });

  it('reads interval from config', () => {
    const status = manager.getStatus();
    expect(status.intervalSeconds).toBe(60);
  });

  it('updates interval', () => {
    manager.updateInterval(120);
    const config = JSON.parse(readFileSync(TEST_CONFIG, 'utf-8'));
    expect(config.interval_seconds).toBe(120);
    expect(manager.getStatus().intervalSeconds).toBe(120);
  });

  it('tracks running state after start', () => {
    manager.start();
    expect(manager.getStatus().running).toBe(true);
  });

  it('tracks stopped state after stop', () => {
    manager.start();
    manager.stop();
    expect(manager.getStatus().running).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/vagrant/GPU-monitor/server && npx vitest run test/collector.test.js`
Expected: FAIL — cannot resolve `../src/collector.js`

- [ ] **Step 3: Implement collector.js**

Create `server/src/collector.js`:

Uses `child_process.spawn` (not `exec`) — arguments are passed as an array, not interpolated through a shell.

```js
import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

export class CollectorManager {
  constructor(configPath, scriptPath, onRunComplete) {
    this.configPath = configPath;
    this.scriptPath = scriptPath;
    this.onRunComplete = onRunComplete || (() => {});
    this.running = false;
    this.intervalId = null;
    this.childProcess = null;
    this.lastRunAt = null;
    this.lastError = null;
    this.lastDurationMs = null;
    this.collecting = false;

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    this.intervalSeconds = config.interval_seconds || 60;
  }

  getStatus() {
    return {
      running: this.running,
      collecting: this.collecting,
      intervalSeconds: this.intervalSeconds,
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
      lastDurationMs: this.lastDurationMs,
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.runOnce();
    this.intervalId = setInterval(() => this.runOnce(), this.intervalSeconds * 1000);
  }

  stop() {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.childProcess) {
      this.childProcess.kill();
      this.childProcess = null;
    }
  }

  updateInterval(seconds) {
    this.intervalSeconds = seconds;
    const config = JSON.parse(readFileSync(this.configPath, 'utf-8'));
    config.interval_seconds = seconds;
    writeFileSync(this.configPath, JSON.stringify(config, null, 2));

    if (this.running) {
      this.stop();
      this.start();
    }
  }

  runOnce() {
    if (this.collecting) return;
    this.collecting = true;
    const startTime = Date.now();

    this.childProcess = spawn('bash', [this.scriptPath, this.configPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    this.childProcess.stderr.on('data', (data) => { stderr += data.toString(); });

    this.childProcess.on('close', (code) => {
      this.collecting = false;
      this.childProcess = null;
      this.lastRunAt = new Date().toISOString();
      this.lastDurationMs = Date.now() - startTime;

      if (code !== 0) {
        this.lastError = stderr.trim() || `Exit code ${code}`;
      } else {
        this.lastError = null;
      }

      this.onRunComplete();
    });

    this.childProcess.on('error', (err) => {
      this.collecting = false;
      this.childProcess = null;
      this.lastRunAt = new Date().toISOString();
      this.lastDurationMs = Date.now() - startTime;
      this.lastError = err.message;
      this.onRunComplete();
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/vagrant/GPU-monitor/server && npx vitest run test/collector.test.js`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /home/vagrant/GPU-monitor
git add server/src/collector.js server/test/collector.test.js
git commit -m "feat: collector manager to spawn/stop collect.sh"
```

---

### Task 6: Alert Engine

**Files:**
- Create: `server/src/alerts.js`, `server/test/alerts.test.js`

- [ ] **Step 1: Write failing test**

Create `server/test/alerts.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, closeDb } from '../src/db.js';
import { evaluateAlerts } from '../src/alerts.js';
import { unlinkSync } from 'fs';

const TEST_DB = '/tmp/gpu_monitor_alerts_test.db';

describe('alerts', () => {
  let db;

  beforeEach(() => {
    try { unlinkSync(TEST_DB); } catch {}
    db = createDb(TEST_DB);
  });

  afterEach(() => {
    closeDb(db);
    try { unlinkSync(TEST_DB); } catch {}
  });

  function insertUserRollup(ts, user, totalGpuMem, gpuCount) {
    db.prepare(`INSERT INTO user_rollups (ts_utc, server, hostname, user, process_count, gpu_count, total_gpu_mem_mb, avg_cpu_pct, max_cpu_pct)
      VALUES (?, 'server1', 'host1', ?, 1, ?, ?, 50, 80)`)
      .run(ts, user, gpuCount, totalGpuMem);
  }

  function insertGpuDevice(ts, server, gpuIndex, utilPct, tempC) {
    db.prepare(`INSERT INTO gpu_devices (ts_utc, server, hostname, gpu_index, gpu_name, gpu_util_pct, mem_util_pct, mem_used_mb, mem_total_mb, temp_c)
      VALUES (?, ?, 'host1', ?, 'A100', ?, 50, 20000, 40000, ?)`)
      .run(ts, server, gpuIndex, utilPct, tempC);
  }

  function insertHostSummary(ts, server, load1) {
    db.prepare(`INSERT INTO host_summaries (ts_utc, server, hostname, load_1, load_5, load_15, cpu_user_pct, cpu_system_pct, cpu_idle_pct, mem_total_mb, mem_used_mb, mem_free_mb, swap_total_mb, swap_used_mb, task_total, task_running, task_sleeping)
      VALUES (?, ?, 'host1', ?, 3, 2, 40, 5, 55, 65536, 32768, 32768, 8192, 0, 200, 2, 198)`)
      .run(ts, server, load1);
  }

  function createRule(name, conditionType, target, threshold, durationMin) {
    db.prepare(`INSERT INTO alert_rules (name, condition_type, target, threshold, duration_min, enabled)
      VALUES (?, ?, ?, ?, ?, 1)`)
      .run(name, conditionType, target, threshold, durationMin);
  }

  it('fires user_gpu_mem_exceeds alert when threshold exceeded for duration', () => {
    createRule('alice mem hog', 'user_gpu_mem_exceeds', 'alice', 20000, 5);

    for (let i = 0; i < 6; i++) {
      const ts = `2026-04-11T12:0${i}:00Z`;
      insertUserRollup(ts, 'alice', 25000, 2);
    }

    const fired = evaluateAlerts(db);
    expect(fired).toHaveLength(1);
    expect(fired[0].message).toContain('alice');
    expect(fired[0].message).toContain('20000');
  });

  it('does not fire when threshold not exceeded for full duration', () => {
    createRule('alice mem hog', 'user_gpu_mem_exceeds', 'alice', 20000, 5);

    for (let i = 0; i < 3; i++) {
      insertUserRollup(`2026-04-11T12:0${i}:00Z`, 'alice', 25000, 2);
    }
    for (let i = 3; i < 6; i++) {
      insertUserRollup(`2026-04-11T12:0${i}:00Z`, 'alice', 10000, 1);
    }

    const fired = evaluateAlerts(db);
    expect(fired).toHaveLength(0);
  });

  it('does not fire duplicate alert for same rule+target', () => {
    createRule('alice mem hog', 'user_gpu_mem_exceeds', 'alice', 20000, 5);

    for (let i = 0; i < 6; i++) {
      insertUserRollup(`2026-04-11T12:0${i}:00Z`, 'alice', 25000, 2);
    }

    evaluateAlerts(db);
    const second = evaluateAlerts(db);
    expect(second).toHaveLength(0);

    const allAlerts = db.prepare('SELECT * FROM alerts').all();
    expect(allAlerts).toHaveLength(1);
  });

  it('fires gpu_temp_exceeds alert', () => {
    createRule('gpu hot', 'gpu_temp_exceeds', 'server1:0', 80, 5);

    for (let i = 0; i < 6; i++) {
      insertGpuDevice(`2026-04-11T12:0${i}:00Z`, 'server1', 0, 70, 88);
    }

    const fired = evaluateAlerts(db);
    expect(fired).toHaveLength(1);
    expect(fired[0].message).toContain('temperature');
  });

  it('fires server_load_exceeds alert', () => {
    createRule('high load', 'server_load_exceeds', 'server1', 50, 5);

    for (let i = 0; i < 6; i++) {
      insertHostSummary(`2026-04-11T12:0${i}:00Z`, 'server1', 55);
    }

    const fired = evaluateAlerts(db);
    expect(fired).toHaveLength(1);
    expect(fired[0].message).toContain('load');
  });

  it('skips disabled rules', () => {
    db.prepare(`INSERT INTO alert_rules (name, condition_type, target, threshold, duration_min, enabled)
      VALUES ('disabled rule', 'user_gpu_mem_exceeds', 'alice', 20000, 5, 0)`)
      .run();

    for (let i = 0; i < 6; i++) {
      insertUserRollup(`2026-04-11T12:0${i}:00Z`, 'alice', 25000, 2);
    }

    const fired = evaluateAlerts(db);
    expect(fired).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/vagrant/GPU-monitor/server && npx vitest run test/alerts.test.js`
Expected: FAIL — cannot resolve `../src/alerts.js`

- [ ] **Step 3: Implement alerts.js**

Create `server/src/alerts.js`:
```js
const EVALUATORS = {
  user_gpu_mem_exceeds: (db, rule) => {
    const rows = db.prepare(`
      SELECT ts_utc, total_gpu_mem_mb as value FROM user_rollups
      WHERE user = ? AND ts_utc >= datetime('now', ? || ' minutes')
      ORDER BY ts_utc
    `).all(rule.target, -rule.duration_min);
    return checkSustained(rows, rule.threshold, 'above');
  },

  user_gpu_count_exceeds: (db, rule) => {
    const rows = db.prepare(`
      SELECT ts_utc, gpu_count as value FROM user_rollups
      WHERE user = ? AND ts_utc >= datetime('now', ? || ' minutes')
      ORDER BY ts_utc
    `).all(rule.target, -rule.duration_min);
    return checkSustained(rows, rule.threshold, 'above');
  },

  gpu_idle: (db, rule) => {
    const [server, gpuIndex] = rule.target.split(':');
    const rows = db.prepare(`
      SELECT ts_utc, gpu_util_pct as value FROM gpu_devices
      WHERE server = ? AND gpu_index = ? AND ts_utc >= datetime('now', ? || ' minutes')
      ORDER BY ts_utc
    `).all(server, parseInt(gpuIndex), -rule.duration_min);
    return checkSustained(rows, rule.threshold, 'below');
  },

  server_load_exceeds: (db, rule) => {
    const rows = db.prepare(`
      SELECT ts_utc, load_1 as value FROM host_summaries
      WHERE server = ? AND ts_utc >= datetime('now', ? || ' minutes')
      ORDER BY ts_utc
    `).all(rule.target, -rule.duration_min);
    return checkSustained(rows, rule.threshold, 'above');
  },

  server_unreachable: (db, rule) => {
    const consecutiveFailures = rule.threshold;
    const rows = db.prepare(`
      SELECT status FROM collector_runs
      WHERE server = ?
      ORDER BY ts_utc DESC
      LIMIT ?
    `).all(rule.target, consecutiveFailures);
    if (rows.length < consecutiveFailures) return false;
    return rows.every(r => r.status === 'error');
  },

  gpu_temp_exceeds: (db, rule) => {
    const [server, gpuIndex] = rule.target.split(':');
    const rows = db.prepare(`
      SELECT ts_utc, temp_c as value FROM gpu_devices
      WHERE server = ? AND gpu_index = ? AND ts_utc >= datetime('now', ? || ' minutes')
      ORDER BY ts_utc
    `).all(server, parseInt(gpuIndex), -rule.duration_min);
    return checkSustained(rows, rule.threshold, 'above');
  },
};

function checkSustained(rows, threshold, direction) {
  if (rows.length === 0) return false;
  if (direction === 'above') return rows.every(r => r.value > threshold);
  return rows.every(r => r.value < threshold);
}

function buildMessage(rule) {
  const msgs = {
    user_gpu_mem_exceeds: `User ${rule.target} GPU memory exceeded ${rule.threshold} MB for ${rule.duration_min} min`,
    user_gpu_count_exceeds: `User ${rule.target} GPU count exceeded ${rule.threshold} for ${rule.duration_min} min`,
    gpu_idle: `GPU ${rule.target} utilization below ${rule.threshold}% for ${rule.duration_min} min`,
    server_load_exceeds: `Server ${rule.target} load exceeded ${rule.threshold} for ${rule.duration_min} min`,
    server_unreachable: `Server ${rule.target} unreachable for ${rule.threshold} consecutive runs`,
    gpu_temp_exceeds: `GPU ${rule.target} temperature exceeded ${rule.threshold} C for ${rule.duration_min} min`,
  };
  return msgs[rule.condition_type] || `Alert: ${rule.name}`;
}

export function evaluateAlerts(db) {
  const rules = db.prepare('SELECT * FROM alert_rules WHERE enabled = 1').all();
  const fired = [];

  for (const rule of rules) {
    const evaluator = EVALUATORS[rule.condition_type];
    if (!evaluator) continue;

    const triggered = evaluator(db, rule);
    if (!triggered) continue;

    // Dedup: check if this rule already has an unacknowledged alert
    const existing = db.prepare(
      'SELECT id FROM alerts WHERE rule_id = ? AND acknowledged = 0'
    ).get(rule.id);
    if (existing) continue;

    const message = buildMessage(rule);
    const ts = new Date().toISOString();

    let server = null;
    let user = null;
    if (rule.condition_type.startsWith('user_')) {
      user = rule.target;
    } else if (rule.condition_type.startsWith('server_')) {
      server = rule.target;
    } else {
      server = rule.target.split(':')[0];
    }

    db.prepare(`INSERT INTO alerts (rule_id, ts_utc, server, user, message, acknowledged)
      VALUES (?, ?, ?, ?, ?, 0)`)
      .run(rule.id, ts, server, user, message);

    fired.push({ rule_id: rule.id, ts_utc: ts, server, user, message });
  }

  return fired;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/vagrant/GPU-monitor/server && npx vitest run test/alerts.test.js`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /home/vagrant/GPU-monitor
git add server/src/alerts.js server/test/alerts.test.js
git commit -m "feat: alert engine with 6 condition types and dedup"
```

---

### Task 7: Cleanup Module

**Files:**
- Create: `server/src/cleanup.js`

- [ ] **Step 1: Implement cleanup.js**

Create `server/src/cleanup.js`:
```js
import { readdirSync, rmSync, statSync } from 'fs';
import { join } from 'path';

export function cleanupDb(db, retentionDays) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffStr = cutoff.toISOString();

  const tables = ['gpu_processes', 'user_rollups', 'gpu_devices', 'host_summaries'];
  const counts = {};

  for (const table of tables) {
    const result = db.prepare(`DELETE FROM ${table} WHERE ts_utc < ?`).run(cutoffStr);
    counts[table] = result.changes;
  }

  const runResult = db.prepare('DELETE FROM collector_runs WHERE ts_utc < ?').run(cutoffStr);
  counts.collector_runs = runResult.changes;

  return counts;
}

export function cleanupLogDirs(logDir, retentionDays) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  let removed = 0;

  let entries;
  try {
    entries = readdirSync(logDir);
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const fullPath = join(logDir, entry);
    try {
      const stat = statSync(fullPath);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(entry) && entry < cutoffDate) {
      rmSync(fullPath, { recursive: true });
      removed++;
    }
  }

  return removed;
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/vagrant/GPU-monitor
git add server/src/cleanup.js
git commit -m "feat: retention cleanup for DB rows and old log directories"
```

---

### Task 8: API Routes — Users

**Files:**
- Create: `server/src/routes/users.js`

- [ ] **Step 1: Implement users routes**

Create `server/src/routes/users.js`:
```js
import { Router } from 'express';

export function usersRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const { from, to, server } = req.query;
    const now = new Date().toISOString();
    const defaultFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const f = from || defaultFrom;
    const t = to || now;

    let query = `
      SELECT user,
        SUM(process_count) as process_count,
        SUM(gpu_count) as gpu_count,
        SUM(total_gpu_mem_mb) as total_gpu_mem_mb,
        AVG(avg_cpu_pct) as avg_cpu_pct,
        MAX(max_cpu_pct) as max_cpu_pct,
        GROUP_CONCAT(DISTINCT server) as servers
      FROM user_rollups
      WHERE ts_utc = (SELECT MAX(ts_utc) FROM user_rollups WHERE ts_utc BETWEEN ? AND ?)
    `;
    const params = [f, t];

    if (server) {
      query += ' AND server = ?';
      params.push(server);
    }

    query += ' GROUP BY user ORDER BY total_gpu_mem_mb DESC';
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  });

  router.get('/:username', (req, res) => {
    const { username } = req.params;

    const processes = db.prepare(`
      SELECT * FROM gpu_processes
      WHERE user = ? AND ts_utc = (SELECT MAX(ts_utc) FROM gpu_processes WHERE user = ?)
      ORDER BY gpu_mem_mb DESC
    `).all(username, username);

    const rollups = db.prepare(`
      SELECT * FROM user_rollups
      WHERE user = ? AND ts_utc = (SELECT MAX(ts_utc) FROM user_rollups WHERE user = ?)
    `).all(username, username);

    res.json({ user: username, processes, rollups });
  });

  router.get('/:username/history', (req, res) => {
    const { username } = req.params;
    const { from, to } = req.query;
    const now = new Date().toISOString();
    const defaultFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const rows = db.prepare(`
      SELECT ts_utc, server, process_count, gpu_count, total_gpu_mem_mb, avg_cpu_pct, max_cpu_pct
      FROM user_rollups WHERE user = ? AND ts_utc BETWEEN ? AND ? ORDER BY ts_utc
    `).all(username, from || defaultFrom, to || now);

    res.json(rows);
  });

  return router;
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/vagrant/GPU-monitor
git add server/src/routes/users.js
git commit -m "feat: user API routes (list, detail, history)"
```

---

### Task 9: API Routes — GPUs

**Files:**
- Create: `server/src/routes/gpus.js`

- [ ] **Step 1: Implement GPU routes**

Create `server/src/routes/gpus.js`:
```js
import { Router } from 'express';

export function gpusRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const { server } = req.query;
    let query = `SELECT * FROM gpu_devices WHERE ts_utc = (SELECT MAX(ts_utc) FROM gpu_devices)`;
    const params = [];
    if (server) { query += ' AND server = ?'; params.push(server); }
    query += ' ORDER BY server, gpu_index';
    res.json(db.prepare(query).all(...params));
  });

  router.get('/:server/:gpuIndex', (req, res) => {
    const { server, gpuIndex } = req.params;
    const idx = parseInt(gpuIndex);

    const device = db.prepare(`
      SELECT * FROM gpu_devices
      WHERE server = ? AND gpu_index = ? AND ts_utc = (SELECT MAX(ts_utc) FROM gpu_devices WHERE server = ? AND gpu_index = ?)
    `).get(server, idx, server, idx);

    const processes = db.prepare(`
      SELECT * FROM gpu_processes
      WHERE server = ? AND gpu_index = ? AND ts_utc = (SELECT MAX(ts_utc) FROM gpu_processes WHERE server = ? AND gpu_index = ?)
      ORDER BY gpu_mem_mb DESC
    `).all(server, idx, server, idx);

    res.json({ device, processes });
  });

  router.get('/:server/:gpuIndex/history', (req, res) => {
    const { server, gpuIndex } = req.params;
    const { from, to } = req.query;
    const now = new Date().toISOString();
    const defaultFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const rows = db.prepare(`
      SELECT ts_utc, gpu_util_pct, mem_util_pct, mem_used_mb, mem_total_mb, temp_c
      FROM gpu_devices WHERE server = ? AND gpu_index = ? AND ts_utc BETWEEN ? AND ? ORDER BY ts_utc
    `).all(server, parseInt(gpuIndex), from || defaultFrom, to || now);

    res.json(rows);
  });

  return router;
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/vagrant/GPU-monitor
git add server/src/routes/gpus.js
git commit -m "feat: GPU API routes (list, detail, history)"
```

---

### Task 10: API Routes — Servers

**Files:**
- Create: `server/src/routes/servers.js`

- [ ] **Step 1: Implement server routes**

Create `server/src/routes/servers.js`:
```js
import { Router } from 'express';
import { readFileSync, writeFileSync } from 'fs';

export function serversRouter(db, configPath) {
  const router = Router();

  router.get('/', (req, res) => {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const servers = config.servers.map(s => {
      const summary = db.prepare('SELECT * FROM host_summaries WHERE server = ? ORDER BY ts_utc DESC LIMIT 1').get(s.name);
      const lastRun = db.prepare('SELECT * FROM collector_runs WHERE server = ? ORDER BY ts_utc DESC LIMIT 1').get(s.name);
      return { ...s, host_summary: summary || null, last_run: lastRun || null, healthy: lastRun ? lastRun.status === 'ok' : null };
    });
    res.json(servers);
  });

  router.get('/:name', (req, res) => {
    const { name } = req.params;
    const summary = db.prepare('SELECT * FROM host_summaries WHERE server = ? ORDER BY ts_utc DESC LIMIT 1').get(name);
    const gpus = db.prepare('SELECT * FROM gpu_devices WHERE server = ? AND ts_utc = (SELECT MAX(ts_utc) FROM gpu_devices WHERE server = ?) ORDER BY gpu_index').all(name, name);
    const processes = db.prepare('SELECT * FROM gpu_processes WHERE server = ? AND ts_utc = (SELECT MAX(ts_utc) FROM gpu_processes WHERE server = ?) ORDER BY gpu_mem_mb DESC').all(name, name);
    res.json({ name, host_summary: summary, gpus, processes });
  });

  router.get('/:name/history', (req, res) => {
    const { name } = req.params;
    const { from, to } = req.query;
    const now = new Date().toISOString();
    const defaultFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const rows = db.prepare('SELECT * FROM host_summaries WHERE server = ? AND ts_utc BETWEEN ? AND ? ORDER BY ts_utc').all(name, from || defaultFrom, to || now);
    res.json(rows);
  });

  router.post('/', (req, res) => {
    const { name, hostname, ssh_user, ssh_key_path, enabled } = req.body;
    if (!name || !hostname || !ssh_user || !ssh_key_path) {
      return res.status(400).json({ error: 'name, hostname, ssh_user, ssh_key_path required' });
    }
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (config.servers.some(s => s.name === name)) {
      return res.status(409).json({ error: `Server "${name}" already exists` });
    }
    const server = { name, hostname, ssh_user, ssh_key_path, enabled: enabled !== false };
    config.servers.push(server);
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    res.status(201).json(server);
  });

  router.put('/:name', (req, res) => {
    const { name } = req.params;
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const idx = config.servers.findIndex(s => s.name === name);
    if (idx === -1) return res.status(404).json({ error: `Server "${name}" not found` });
    config.servers[idx] = { ...config.servers[idx], ...req.body, name };
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    res.json(config.servers[idx]);
  });

  router.delete('/:name', (req, res) => {
    const { name } = req.params;
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const idx = config.servers.findIndex(s => s.name === name);
    if (idx === -1) return res.status(404).json({ error: `Server "${name}" not found` });
    config.servers.splice(idx, 1);
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    res.status(204).end();
  });

  return router;
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/vagrant/GPU-monitor
git add server/src/routes/servers.js
git commit -m "feat: server API routes (list, detail, history, CRUD)"
```

---

### Task 11: API Routes — Alerts

**Files:**
- Create: `server/src/routes/alerts.js`

- [ ] **Step 1: Implement alert routes**

Create `server/src/routes/alerts.js`:
```js
import { Router } from 'express';

export function alertsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const { acknowledged } = req.query;
    let query = 'SELECT a.*, r.name as rule_name FROM alerts a LEFT JOIN alert_rules r ON a.rule_id = r.id';
    if (acknowledged === 'false') query += ' WHERE a.acknowledged = 0';
    else if (acknowledged === 'true') query += ' WHERE a.acknowledged = 1';
    query += ' ORDER BY a.ts_utc DESC';
    res.json(db.prepare(query).all());
  });

  router.post('/:id/acknowledge', (req, res) => {
    const result = db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Alert not found' });
    res.json({ id: parseInt(req.params.id), acknowledged: true });
  });

  router.get('/rules', (req, res) => {
    res.json(db.prepare('SELECT * FROM alert_rules ORDER BY created_at DESC').all());
  });

  router.post('/rules', (req, res) => {
    const { name, condition_type, target, threshold, duration_min, enabled } = req.body;
    if (!name || !condition_type || !target || threshold == null || duration_min == null) {
      return res.status(400).json({ error: 'name, condition_type, target, threshold, duration_min required' });
    }
    const result = db.prepare('INSERT INTO alert_rules (name, condition_type, target, threshold, duration_min, enabled) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, condition_type, target, threshold, duration_min, enabled !== false ? 1 : 0);
    res.status(201).json(db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(result.lastInsertRowid));
  });

  router.put('/rules/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Rule not found' });
    const { name, condition_type, target, threshold, duration_min, enabled } = req.body;
    db.prepare('UPDATE alert_rules SET name = ?, condition_type = ?, target = ?, threshold = ?, duration_min = ?, enabled = ? WHERE id = ?')
      .run(name ?? existing.name, condition_type ?? existing.condition_type, target ?? existing.target, threshold ?? existing.threshold, duration_min ?? existing.duration_min, enabled != null ? (enabled ? 1 : 0) : existing.enabled, req.params.id);
    res.json(db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(req.params.id));
  });

  router.delete('/rules/:id', (req, res) => {
    const result = db.prepare('DELETE FROM alert_rules WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Rule not found' });
    res.status(204).end();
  });

  return router;
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/vagrant/GPU-monitor
git add server/src/routes/alerts.js
git commit -m "feat: alert API routes (list, acknowledge, CRUD rules)"
```

---

### Task 12: API Routes — Collector Control & Stats

**Files:**
- Create: `server/src/routes/collector.js`, `server/src/routes/stats.js`

- [ ] **Step 1: Implement collector control routes**

Create `server/src/routes/collector.js`:
```js
import { Router } from 'express';

export function collectorRouter(collectorManager) {
  const router = Router();

  router.get('/status', (req, res) => { res.json(collectorManager.getStatus()); });
  router.post('/start', (req, res) => { collectorManager.start(); res.json(collectorManager.getStatus()); });
  router.post('/stop', (req, res) => { collectorManager.stop(); res.json(collectorManager.getStatus()); });

  router.put('/config', (req, res) => {
    const { interval_seconds } = req.body;
    if (!interval_seconds || interval_seconds < 10 || interval_seconds > 3600) {
      return res.status(400).json({ error: 'interval_seconds must be between 10 and 3600' });
    }
    collectorManager.updateInterval(interval_seconds);
    res.json(collectorManager.getStatus());
  });

  return router;
}
```

- [ ] **Step 2: Implement stats routes**

Create `server/src/routes/stats.js`:
```js
import { Router } from 'express';
import { statSync, readFileSync } from 'fs';
import { cleanupDb, cleanupLogDirs } from '../cleanup.js';

export function statsRouter(db, configPath) {
  const router = Router();

  router.get('/', (req, res) => {
    const tables = ['gpu_processes', 'user_rollups', 'gpu_devices', 'host_summaries', 'alerts', 'collector_runs'];
    const counts = {};
    for (const table of tables) {
      counts[table] = db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get().cnt;
    }
    const oldest = db.prepare('SELECT MIN(ts_utc) as ts FROM gpu_devices').get();
    const newest = db.prepare('SELECT MAX(ts_utc) as ts FROM gpu_devices').get();

    let dbSizeBytes = 0;
    try { dbSizeBytes = statSync(configPath.replace('config.json', 'gpu_monitor.db')).size; } catch {}

    res.json({ row_counts: counts, oldest_record: oldest?.ts || null, newest_record: newest?.ts || null, db_size_bytes: dbSizeBytes });
  });

  router.post('/cleanup', (req, res) => {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const retentionDays = config.retention_days || 30;
    const dbCounts = cleanupDb(db, retentionDays);
    const dirsRemoved = cleanupLogDirs(config.log_dir, retentionDays);
    res.json({ db_rows_deleted: dbCounts, log_dirs_removed: dirsRemoved });
  });

  return router;
}
```

- [ ] **Step 3: Commit**

```bash
cd /home/vagrant/GPU-monitor
git add server/src/routes/collector.js server/src/routes/stats.js
git commit -m "feat: collector control and stats API routes"
```

---

### Task 13: Wire Up Express Server

**Files:**
- Modify: `server/src/index.js`

- [ ] **Step 1: Update index.js to wire all components together**

Replace `server/src/index.js` with:
```js
import express from 'express';
import cors from 'cors';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createDb } from './db.js';
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
const ROOT_DIR = join(__dirname, '..', '..');

const CONFIG_PATH = join(ROOT_DIR, 'config.json');
const DB_PATH = join(ROOT_DIR, 'gpu_monitor.db');
const COLLECT_SCRIPT = join(ROOT_DIR, 'collect.sh');

const db = createDb(DB_PATH);

function onRunComplete() {
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    const today = new Date().toISOString().slice(0, 10);

    for (const server of config.servers) {
      if (!server.enabled) continue;
      const dir = join(ROOT_DIR, config.log_dir, today, server.name);
      if (existsSync(dir)) {
        try { ingestDirectory(db, dir); }
        catch (err) { console.error(`Ingestion error for ${server.name}:`, err.message); }
      }
    }

    evaluateAlerts(db);
  } catch (err) {
    console.error('Post-collection error:', err.message);
  }
}

const collector = new CollectorManager(CONFIG_PATH, COLLECT_SCRIPT, onRunComplete);

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/users', usersRouter(db));
app.use('/api/gpus', gpusRouter(db));
app.use('/api/servers', serversRouter(db, CONFIG_PATH));
app.use('/api/alerts', alertsRouter(db));
app.use('/api/collector', collectorRouter(collector));
app.use('/api/stats', statsRouter(db, CONFIG_PATH));
app.get('/api/health', (req, res) => { res.json({ status: 'ok', ts: new Date().toISOString() }); });

const clientBuild = join(ROOT_DIR, 'client', 'dist');
if (existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(join(clientBuild, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => { console.log(`GPU Monitor server listening on port ${PORT}`); });

process.on('SIGTERM', () => { collector.stop(); db.close(); process.exit(0); });
process.on('SIGINT', () => { collector.stop(); db.close(); process.exit(0); });

export { app, db, collector, ROOT_DIR };
```

- [ ] **Step 2: Verify server starts with all routes**

Run: `cd /home/vagrant/GPU-monitor/server && timeout 5 node src/index.js 2>&1 || true`
Expected: "GPU Monitor server listening on port 3001" (then timeout kills it)

- [ ] **Step 3: Commit**

```bash
cd /home/vagrant/GPU-monitor
git add server/src/index.js
git commit -m "feat: wire up Express with all routes, collector, ingestion, and alerts"
```

---

## Phase 3: Frontend

### Task 14: React Scaffolding with Vite

**Files:**
- Create: `client/package.json`, `client/vite.config.js`, `client/index.html`, `client/src/main.jsx`, `client/src/App.jsx`, `client/src/api.js`

- [ ] **Step 1: Create client/package.json**

Create `client/package.json`:
```json
{
  "name": "gpu-monitor-client",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0",
    "recharts": "^2.12.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0"
  }
}
```

Run: `cd /home/vagrant/GPU-monitor/client && npm install`

- [ ] **Step 2: Create vite.config.js**

Create `client/vite.config.js`:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: { '/api': 'http://localhost:3001' },
  },
});
```

- [ ] **Step 3: Create index.html**

Create `client/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GPU Monitor</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #e0e0e0; min-height: 100vh; }
    #root { min-height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

- [ ] **Step 4: Create main.jsx and App.jsx**

Create `client/src/main.jsx`:
```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter><App /></BrowserRouter>
);
```

Create `client/src/App.jsx`:
```jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import UsersPage from './pages/UsersPage';
import UserDetailPage from './pages/UserDetailPage';
import GpusPage from './pages/GpusPage';
import ServersPage from './pages/ServersPage';
import AlertsPage from './pages/AlertsPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/users" replace />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/users/:username" element={<UserDetailPage />} />
        <Route path="/gpus" element={<GpusPage />} />
        <Route path="/servers" element={<ServersPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}
```

- [ ] **Step 5: Create api.js**

Create `client/src/api.js`:
```js
const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getUsers: (params) => request(`/users?${new URLSearchParams(params)}`),
  getUser: (username) => request(`/users/${username}`),
  getUserHistory: (username, params) => request(`/users/${username}/history?${new URLSearchParams(params)}`),
  getGpus: (params) => request(`/gpus?${new URLSearchParams(params)}`),
  getGpu: (server, idx) => request(`/gpus/${server}/${idx}`),
  getGpuHistory: (server, idx, params) => request(`/gpus/${server}/${idx}/history?${new URLSearchParams(params)}`),
  getServers: () => request('/servers'),
  getServer: (name) => request(`/servers/${name}`),
  getServerHistory: (name, params) => request(`/servers/${name}/history?${new URLSearchParams(params)}`),
  addServer: (data) => request('/servers', { method: 'POST', body: JSON.stringify(data) }),
  updateServer: (name, data) => request(`/servers/${name}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteServer: (name) => request(`/servers/${name}`, { method: 'DELETE' }),
  getAlerts: (params) => request(`/alerts?${new URLSearchParams(params)}`),
  acknowledgeAlert: (id) => request(`/alerts/${id}/acknowledge`, { method: 'POST' }),
  getAlertRules: () => request('/alerts/rules'),
  createAlertRule: (data) => request('/alerts/rules', { method: 'POST', body: JSON.stringify(data) }),
  updateAlertRule: (id, data) => request(`/alerts/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAlertRule: (id) => request(`/alerts/rules/${id}`, { method: 'DELETE' }),
  getCollectorStatus: () => request('/collector/status'),
  startCollector: () => request('/collector/start', { method: 'POST' }),
  stopCollector: () => request('/collector/stop', { method: 'POST' }),
  updateCollectorConfig: (data) => request('/collector/config', { method: 'PUT', body: JSON.stringify(data) }),
  getStats: () => request('/stats'),
  triggerCleanup: () => request('/stats/cleanup', { method: 'POST' }),
};
```

- [ ] **Step 6: Commit**

```bash
cd /home/vagrant/GPU-monitor
git add client/package.json client/package-lock.json client/vite.config.js client/index.html client/src/main.jsx client/src/App.jsx client/src/api.js
git commit -m "feat: React scaffolding with Vite, routing, and API client"
```

---

### Task 15: Layout, Sidebar, and Shared Components

**Files:**
- Create: all components in `client/src/components/`

This task creates all shared components at once since they are small and independent. See the File Map for the full list. Each component is specified in the spec design doc. The complete code for each component is provided in the brainstorming session and should be implemented as described there:

- `Layout.jsx` — flex container with Sidebar + main content area
- `Sidebar.jsx` — nav links (Users, GPUs, Servers, Alerts, Settings), collector status at bottom, polls `/api/collector/status` every 10s
- `StatusIndicator.jsx` — colored dot (green/yellow/red/gray)
- `AlertBadge.jsx` — polls `/api/alerts?acknowledged=false`, shows count if > 0
- `TimeRangePicker.jsx` — button group: 1h, 6h, 24h, 7d, 30d
- `UsageChart.jsx` — Recharts LineChart wrapper, takes `data`, `lines` (array of {key, label}), renders responsive chart with dark theme
- `UserCard.jsx` — clickable card showing user, GPU count, memory, servers. Navigates to `/users/:username`
- `GpuCard.jsx` — shows GPU name, utilization (color-coded), VRAM, temperature
- `ServerCard.jsx` — shows server name, health indicator, load/CPU/memory summary

See the spec and brainstorming session for exact component code.

- [ ] **Step 1: Create all component files**

Create each file with the code shown in the brainstorming session (Tasks 15-16 of the design presentation).

- [ ] **Step 2: Commit**

```bash
cd /home/vagrant/GPU-monitor
git add client/src/components/
git commit -m "feat: shared UI components (layout, sidebar, cards, charts)"
```

---

### Task 16: All Page Components

**Files:**
- Create: all files in `client/src/pages/`

This task creates all 6 pages. Each page is specified in detail in the brainstorming session:

- `UsersPage.jsx` — fetches users with filters (time range, server), renders UserCard list, auto-refreshes 10s
- `UserDetailPage.jsx` — fetches user detail + history, shows summary cards, UsageChart, process table
- `GpusPage.jsx` — fetches GPU devices, renders grid of GpuCard, click to show utilization chart
- `ServersPage.jsx` — fetches servers, renders ServerCard list, click to show load/CPU chart
- `AlertsPage.jsx` — shows triggered alerts (acknowledge button), alert rules list (create/toggle/delete)
- `SettingsPage.jsx` — collector start/stop + interval, server add/remove/toggle, data stats + cleanup

See the spec and brainstorming session for exact page code.

- [ ] **Step 1: Create all page files**

Create each file with the code shown in the brainstorming session (Tasks 17-22 of this plan).

- [ ] **Step 2: Verify dev server starts**

Run: `cd /home/vagrant/GPU-monitor/client && npx vite --host 0.0.0.0 &`
Expected: Vite dev server starts on port 3000

- [ ] **Step 3: Commit**

```bash
cd /home/vagrant/GPU-monitor
git add client/src/pages/
git commit -m "feat: all page components (users, GPUs, servers, alerts, settings)"
```

---

## Phase 4: Integration

### Task 17: Build & Final Integration

- [ ] **Step 1: Build React client**

Run: `cd /home/vagrant/GPU-monitor/client && npm run build`
Expected: Vite builds to `client/dist/`

- [ ] **Step 2: Start full server and verify**

Run: `cd /home/vagrant/GPU-monitor/server && PORT=3001 node src/index.js &`
Run: `curl -s http://localhost:3001/api/health`
Expected: `{"status":"ok","ts":"..."}`

Run: `curl -s http://localhost:3001/ | head -3`
Expected: HTML content (React app)

Kill the server.

- [ ] **Step 3: Run all backend tests**

Run: `cd /home/vagrant/GPU-monitor/server && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Final commit**

```bash
cd /home/vagrant/GPU-monitor
git add -A
git commit -m "feat: complete GPU Monitor admin portal v1"
```
