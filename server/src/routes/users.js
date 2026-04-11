import { Router } from 'express';

/**
 * Factory function that returns an Express Router for user-related routes.
 * @param {import('better-sqlite3').Database} db
 * @returns {Router}
 */
export function usersRouter(db) {
  const router = Router();

  /**
   * GET /api/users
   * Active users with latest rollup.
   * Query params: from, to, server
   */
  router.get('/', (req, res) => {
    try {
      const now = new Date();
      const defaultFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const defaultTo = now.toISOString();

      const from = req.query.from || defaultFrom;
      const to = req.query.to || defaultTo;
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
   * GET /api/users/:username/history
   * Time-series rollup data for a user.
   * Query params: from, to
   */
  router.get('/:username/history', (req, res) => {
    try {
      const { username } = req.params;
      const now = new Date();
      const defaultFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const defaultTo = now.toISOString();

      const from = req.query.from || defaultFrom;
      const to = req.query.to || defaultTo;

      const rows = db.prepare(`
        SELECT ts_utc, server, process_count, gpu_count, total_gpu_mem_mb, avg_cpu_pct, max_cpu_pct
        FROM user_rollups
        WHERE user = ? AND ts_utc BETWEEN ? AND ?
        ORDER BY ts_utc
      `).all(username, from, to);

      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
