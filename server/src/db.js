import Database from 'better-sqlite3';

/**
 * Creates or opens a SQLite database at the given path.
 * Enables WAL mode and foreign key enforcement, then initializes the schema.
 * @param {string} dbPath - Filesystem path for the SQLite database file.
 * @returns {import('better-sqlite3').Database} The opened database instance.
 */
export function createDb(dbPath) {
  const db = new Database(dbPath);

  // Performance and integrity pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initSchema(db);

  return db;
}

/**
 * Closes the database if it is open. Safe to call on an already-closed db.
 * @param {import('better-sqlite3').Database} db
 */
export function closeDb(db) {
  if (db && db.open) {
    db.close();
  }
}

/**
 * Creates all tables and indexes using CREATE TABLE/INDEX IF NOT EXISTS.
 * @param {import('better-sqlite3').Database} db
 */
function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gpu_processes (
      ts_utc        TEXT    NOT NULL,
      server        TEXT    NOT NULL,
      hostname      TEXT    NOT NULL,
      gpu_index     INTEGER NOT NULL,
      gpu_uuid      TEXT    NOT NULL,
      pid           INTEGER NOT NULL,
      user          TEXT    NOT NULL,
      process_name  TEXT    NOT NULL,
      cmd           TEXT    NOT NULL,
      gpu_mem_mb    REAL    NOT NULL,
      cpu_pct       REAL    NOT NULL,
      mem_pct       REAL    NOT NULL,
      elapsed_sec   INTEGER NOT NULL,
      state         TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_rollups (
      ts_utc            TEXT    NOT NULL,
      server            TEXT    NOT NULL,
      hostname          TEXT    NOT NULL,
      user              TEXT    NOT NULL,
      process_count     INTEGER NOT NULL,
      gpu_count         INTEGER NOT NULL,
      total_gpu_mem_mb  REAL    NOT NULL,
      avg_cpu_pct       REAL    NOT NULL,
      max_cpu_pct       REAL    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gpu_devices (
      ts_utc        TEXT    NOT NULL,
      server        TEXT    NOT NULL,
      hostname      TEXT    NOT NULL,
      gpu_index     INTEGER NOT NULL,
      gpu_name      TEXT    NOT NULL,
      gpu_util_pct  REAL    NOT NULL,
      mem_util_pct  REAL    NOT NULL,
      mem_used_mb   REAL    NOT NULL,
      mem_total_mb  REAL    NOT NULL,
      temp_c        REAL    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS host_summaries (
      ts_utc          TEXT    NOT NULL,
      server          TEXT    NOT NULL,
      hostname        TEXT    NOT NULL,
      load_1          REAL    NOT NULL,
      load_5          REAL    NOT NULL,
      load_15         REAL    NOT NULL,
      cpu_user_pct    REAL    NOT NULL,
      cpu_system_pct  REAL    NOT NULL,
      cpu_idle_pct    REAL    NOT NULL,
      mem_total_mb    REAL    NOT NULL,
      mem_used_mb     REAL    NOT NULL,
      mem_free_mb     REAL    NOT NULL,
      swap_total_mb   REAL    NOT NULL,
      swap_used_mb    REAL    NOT NULL,
      task_total      INTEGER NOT NULL,
      task_running    INTEGER NOT NULL,
      task_sleeping   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_rules (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT    NOT NULL,
      condition_type TEXT    NOT NULL,
      target         TEXT    NOT NULL,
      threshold      REAL    NOT NULL,
      duration_min   INTEGER NOT NULL,
      enabled        INTEGER NOT NULL DEFAULT 1,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id      INTEGER NOT NULL REFERENCES alert_rules(id),
      ts_utc       TEXT    NOT NULL,
      server       TEXT,
      user         TEXT,
      message      TEXT    NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS collector_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts_utc      TEXT    NOT NULL,
      server      TEXT    NOT NULL,
      status      TEXT    NOT NULL,
      duration_ms INTEGER NOT NULL,
      error       TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_gpu_processes_ts_user
      ON gpu_processes(ts_utc, user);

    CREATE INDEX IF NOT EXISTS idx_gpu_processes_ts_server
      ON gpu_processes(ts_utc, server);

    CREATE INDEX IF NOT EXISTS idx_user_rollups_ts_user
      ON user_rollups(ts_utc, user);

    CREATE INDEX IF NOT EXISTS idx_user_rollups_user_ts
      ON user_rollups(user, ts_utc);

    CREATE INDEX IF NOT EXISTS idx_gpu_devices_ts_server_gpu
      ON gpu_devices(ts_utc, server, gpu_index);

    CREATE INDEX IF NOT EXISTS idx_host_summaries_ts_server
      ON host_summaries(ts_utc, server);
  `);
}
