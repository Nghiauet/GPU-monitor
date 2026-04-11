import { Router } from 'express';
import { readFileSync, statSync } from 'fs';
import { cleanupDb, cleanupLogDirs } from '../cleanup.js';

/**
 * Factory function that returns an Express Router for stats and maintenance routes.
 * @param {import('better-sqlite3').Database} db
 * @param {string} configPath - Path to the config.json file
 * @returns {Router}
 */
export function statsRouter(db, configPath) {
  const router = Router();

  /**
   * GET /api/stats
   * Returns row counts for all tables, oldest/newest records, and db file size.
   */
  router.get('/', (req, res) => {
    try {
      const tables = ['gpu_processes', 'user_rollups', 'gpu_devices', 'host_summaries', 'collector_runs', 'alert_rules', 'alerts'];
      const stats = {};

      for (const table of tables) {
        const countRow = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
        stats[table] = { count: countRow.count };
      }

      // Get oldest and newest records for time-series tables
      const timeTables = ['gpu_processes', 'user_rollups', 'gpu_devices', 'host_summaries', 'collector_runs'];
      for (const table of timeTables) {
        const rangeRow = db.prepare(`
          SELECT MIN(ts_utc) AS oldest, MAX(ts_utc) AS newest FROM ${table}
        `).get();
        stats[table].oldest = rangeRow.oldest || null;
        stats[table].newest = rangeRow.newest || null;
      }

      // DB file size — read from config to find db path
      let dbSizeBytes = null;
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf8'));
        if (config.db_path) {
          dbSizeBytes = statSync(config.db_path).size;
        }
      } catch {
        // best-effort: if db_path not in config or file not accessible, skip
      }

      res.json({ tables: stats, db_size_bytes: dbSizeBytes });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/stats/cleanup
   * Runs DB and log directory cleanup using retention_days from config.
   */
  router.post('/cleanup', (req, res) => {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      const retentionDays = config.retention_days ?? 30;
      const logDir = config.log_dir || null;

      const dbCounts = cleanupDb(db, retentionDays);

      let logDirsRemoved = 0;
      if (logDir) {
        logDirsRemoved = cleanupLogDirs(logDir, retentionDays);
      }

      res.json({
        retention_days: retentionDays,
        db_rows_deleted: dbCounts,
        log_dirs_removed: logDirsRemoved,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
