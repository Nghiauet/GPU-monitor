import { Router } from 'express';
import { getDateRange } from '../dateRange.js';

/**
 * Factory function that returns an Express Router for user-related routes.
 * @param {import('better-sqlite3').Database} db
 * @returns {Router}
 */
export function usersRouter(db) {
  const router = Router();

  // Hoisted prepared statements
  const lastActiveStmt = db.prepare(
    'SELECT user, MAX(ts_utc) AS last_active FROM gpu_processes WHERE user IN (SELECT value FROM json_each(?)) GROUP BY user'
  );

  const summaryStmt = db.prepare(`
    SELECT
      user,
      COUNT(DISTINCT ts_utc) AS snapshot_count,
      MAX(total_gpu_mem_mb) AS peak_gpu_mem_mb,
      AVG(total_gpu_mem_mb) AS avg_gpu_mem_mb,
      MAX(gpu_count) AS max_gpu_count,
      AVG(avg_cpu_pct) AS avg_cpu_pct,
      MAX(max_cpu_pct) AS max_cpu_pct,
      GROUP_CONCAT(DISTINCT server) AS servers,
      MIN(ts_utc) AS first_seen,
      MAX(ts_utc) AS last_seen
    FROM user_rollups
    WHERE ts_utc BETWEEN ? AND ?
    GROUP BY user
    ORDER BY peak_gpu_mem_mb DESC
  `);

  const summaryByServerStmt = db.prepare(`
    SELECT
      user,
      COUNT(DISTINCT ts_utc) AS snapshot_count,
      MAX(total_gpu_mem_mb) AS peak_gpu_mem_mb,
      AVG(total_gpu_mem_mb) AS avg_gpu_mem_mb,
      MAX(gpu_count) AS max_gpu_count,
      AVG(avg_cpu_pct) AS avg_cpu_pct,
      MAX(max_cpu_pct) AS max_cpu_pct,
      GROUP_CONCAT(DISTINCT server) AS servers,
      MIN(ts_utc) AS first_seen,
      MAX(ts_utc) AS last_seen
    FROM user_rollups
    WHERE server = ? AND ts_utc BETWEEN ? AND ?
    GROUP BY user
    ORDER BY peak_gpu_mem_mb DESC
  `);

  const historyAllStmt = db.prepare(`
    SELECT ts_utc, user,
      SUM(total_gpu_mem_mb) AS total_gpu_mem_mb,
      SUM(gpu_count) AS gpu_count,
      AVG(avg_cpu_pct) AS avg_cpu_pct
    FROM user_rollups
    WHERE ts_utc BETWEEN ? AND ?
    GROUP BY ts_utc, user
    ORDER BY ts_utc
    LIMIT 50000
  `);

  const historyByServerStmt = db.prepare(`
    SELECT ts_utc, user, server,
      SUM(total_gpu_mem_mb) AS total_gpu_mem_mb,
      SUM(gpu_count) AS gpu_count,
      AVG(avg_cpu_pct) AS avg_cpu_pct
    FROM user_rollups
    WHERE server = ? AND ts_utc BETWEEN ? AND ?
    GROUP BY ts_utc, user
    ORDER BY ts_utc
    LIMIT 50000
  `);

  const userHistoryStmt = db.prepare(`
    SELECT ts_utc, server, process_count, gpu_count, total_gpu_mem_mb, avg_cpu_pct, max_cpu_pct
    FROM user_rollups
    WHERE user = ? AND ts_utc BETWEEN ? AND ?
    ORDER BY ts_utc
  `);

  const userJobsStmt = db.prepare(`
    SELECT
      pid, server, gpu_index, process_name, cmd,
      MAX(gpu_mem_mb) AS peak_gpu_mem_mb,
      AVG(cpu_pct) AS avg_cpu_pct,
      MIN(ts_utc) AS first_seen,
      MAX(ts_utc) AS last_seen,
      COUNT(*) AS snapshot_count,
      (CAST((julianday(MAX(ts_utc)) - julianday(MIN(ts_utc))) * 86400 AS INTEGER)) AS duration_sec
    FROM gpu_processes
    WHERE user = ? AND ts_utc BETWEEN ? AND ?
    GROUP BY pid, server
    ORDER BY last_seen DESC
  `);

  /**
   * GET /api/users
   * Active users with latest rollup.
   * Query params: from, to, server
   */
  router.get('/', (req, res) => {
    try {
      const { from, to } = getDateRange(req.query);
      const server = req.query.server;

      let sql;
      let params;

      if (server) {
        sql = `
          SELECT
            user,
            SUM(process_count) AS process_count,
            SUM(gpu_count) AS gpu_count,
            SUM(total_gpu_mem_mb) AS total_gpu_mem_mb,
            AVG(avg_cpu_pct) AS avg_cpu_pct,
            MAX(max_cpu_pct) AS max_cpu_pct,
            GROUP_CONCAT(DISTINCT server) AS servers
          FROM user_rollups r
          WHERE server = ?
            AND r.ts_utc = (SELECT MAX(ts_utc) FROM user_rollups WHERE server = r.server AND ts_utc BETWEEN ? AND ?)
          GROUP BY user
          ORDER BY total_gpu_mem_mb DESC
        `;
        params = [server, from, to];
      } else {
        sql = `
          SELECT
            user,
            SUM(process_count) AS process_count,
            SUM(gpu_count) AS gpu_count,
            SUM(total_gpu_mem_mb) AS total_gpu_mem_mb,
            AVG(avg_cpu_pct) AS avg_cpu_pct,
            MAX(max_cpu_pct) AS max_cpu_pct,
            GROUP_CONCAT(DISTINCT server) AS servers
          FROM user_rollups r
          WHERE r.ts_utc = (SELECT MAX(ts_utc) FROM user_rollups WHERE server = r.server AND ts_utc BETWEEN ? AND ?)
          GROUP BY user
          ORDER BY total_gpu_mem_mb DESC
        `;
        params = [from, to];
      }

      const rows = db.prepare(sql).all(...params);

      // Batch-fetch last_active for all users in one query
      if (rows.length > 0) {
        const users = JSON.stringify(rows.map(r => r.user));
        const lastActiveRows = lastActiveStmt.all(users);
        const lastActiveMap = new Map(lastActiveRows.map(r => [r.user, r.last_active]));
        for (const row of rows) {
          row.last_active = lastActiveMap.get(row.user) || null;
        }
      }

      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/users/summary
   * Per-user aggregate stats over a time range.
   * Query params: from, to, server
   */
  router.get('/summary', (req, res) => {
    try {
      const { from, to } = getDateRange(req.query);
      const server = req.query.server;

      const rows = server
        ? summaryByServerStmt.all(server, from, to)
        : summaryStmt.all(from, to);

      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/users/history
   * Time-series rollup data for ALL users (for multi-user chart).
   * Query params: from, to, server
   */
  router.get('/history', (req, res) => {
    try {
      const { from, to } = getDateRange(req.query);
      const server = req.query.server;

      const rows = server
        ? historyByServerStmt.all(server, from, to)
        : historyAllStmt.all(from, to);

      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/users/:username
   * User detail: latest processes and rollups.
   */
  router.get('/:username', (req, res) => {
    try {
      const { username } = req.params;

      const processes = db.prepare(`
        SELECT * FROM gpu_processes
        WHERE user = ?
          AND ts_utc = (SELECT MAX(ts_utc) FROM gpu_processes WHERE user = ?)
      `).all(username, username);

      const rollups = db.prepare(`
        SELECT * FROM user_rollups
        WHERE user = ?
          AND ts_utc = (SELECT MAX(ts_utc) FROM user_rollups WHERE user = ?)
      `).all(username, username);

      res.json({ user: username, processes, rollups });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/users/:username/jobs
   * Query params: from, to
   */
  router.get('/:username/jobs', (req, res) => {
    try {
      const { username } = req.params;
      const { from, to } = getDateRange(req.query);

      const jobs = userJobsStmt.all(username, from, to);

      const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      for (const job of jobs) {
        job.active = job.last_seen >= cutoff;
      }

      res.json(jobs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/users/:username/history
   * Query params: from, to
   */
  router.get('/:username/history', (req, res) => {
    try {
      const { username } = req.params;
      const { from, to } = getDateRange(req.query);

      const rows = userHistoryStmt.all(username, from, to);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
