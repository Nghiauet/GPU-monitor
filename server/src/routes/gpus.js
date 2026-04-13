import { Router } from 'express';
import { getDateRange } from '../dateRange.js';

/**
 * Factory function that returns an Express Router for GPU-related routes.
 * @param {import('better-sqlite3').Database} db
 * @returns {Router}
 */
export function gpusRouter(db) {
  const router = Router();

  /**
   * GET /api/gpus
   * Latest GPU device snapshot.
   * Query param: server
   */
  router.get('/', (req, res) => {
    try {
      const { server } = req.query;

      let sql;
      let params;

      if (server) {
        sql = `
          SELECT * FROM gpu_devices
          WHERE server = ?
            AND ts_utc = (SELECT MAX(ts_utc) FROM gpu_devices WHERE server = ?)
          ORDER BY gpu_index
        `;
        params = [server, server];
      } else {
        sql = `
          SELECT * FROM gpu_devices g
          WHERE g.ts_utc = (SELECT MAX(ts_utc) FROM gpu_devices WHERE server = g.server)
          ORDER BY g.server, g.gpu_index
        `;
        params = [];
      }

      const rows = db.prepare(sql).all(...params);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/gpus/:server/:gpuIndex
   * GPU detail with latest device info and current processes.
   */
  router.get('/:server/:gpuIndex', (req, res) => {
    try {
      const { server } = req.params;
      const gpuIndex = parseInt(req.params.gpuIndex, 10);

      if (isNaN(gpuIndex)) {
        return res.status(400).json({ error: 'gpuIndex must be an integer' });
      }

      const device = db.prepare(`
        SELECT * FROM gpu_devices
        WHERE server = ? AND gpu_index = ?
          AND ts_utc = (SELECT MAX(ts_utc) FROM gpu_devices WHERE server = ? AND gpu_index = ?)
        LIMIT 1
      `).get(server, gpuIndex, server, gpuIndex);

      const processes = db.prepare(`
        SELECT * FROM gpu_processes
        WHERE server = ? AND gpu_index = ?
          AND ts_utc = (SELECT MAX(ts_utc) FROM gpu_processes WHERE server = ? AND gpu_index = ?)
      `).all(server, gpuIndex, server, gpuIndex);

      res.json({ device: device || null, processes });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/gpus/:server/:gpuIndex/history
   * Time-series data for a specific GPU.
   * Query params: from, to
   */
  router.get('/:server/:gpuIndex/history', (req, res) => {
    try {
      const { server } = req.params;
      const gpuIndex = parseInt(req.params.gpuIndex, 10);

      if (isNaN(gpuIndex)) {
        return res.status(400).json({ error: 'gpuIndex must be an integer' });
      }

      const { from, to } = getDateRange(req.query);

      const rows = db.prepare(`
        SELECT ts_utc, gpu_util_pct, mem_util_pct, mem_used_mb, mem_total_mb, temp_c
        FROM gpu_devices
        WHERE server = ? AND gpu_index = ? AND ts_utc BETWEEN ? AND ?
        ORDER BY ts_utc
      `).all(server, gpuIndex, from, to);

      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
