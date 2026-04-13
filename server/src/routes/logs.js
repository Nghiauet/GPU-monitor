import { Router } from 'express';
import { createReadStream, existsSync, statSync } from 'fs';
import { createInterface } from 'readline';

/**
 * Factory function that returns an Express Router for log viewing routes.
 * @param {import('better-sqlite3').Database} db
 * @param {string} collectorLogPath - Filesystem path to the collector.log JSONL file.
 * @returns {Router}
 */
export function logsRouter(db, collectorLogPath) {
  const router = Router();

  /**
   * GET /api/logs
   * Reads the collector.log JSONL file, parses lines, optionally filters by level,
   * and slices to a limit.
   * Query params:
   *   level - "all" (default) or "error" to filter to error entries only
   *   limit - max entries to return (default 200, max 1000)
   * Returns: { entries, total }
   */
  router.get('/', async (req, res) => {
    try {
      const level = req.query.level || 'all';
      let limit = parseInt(req.query.limit, 10);
      if (!Number.isFinite(limit) || limit < 1) limit = 200;
      if (limit > 1000) limit = 1000;

      if (!existsSync(collectorLogPath)) {
        return res.json({ entries: [], total: 0 });
      }

      // Stream the file and collect all matching entries, then return the newest
      const allEntries = [];
      const fileStream = createReadStream(collectorLogPath);
      const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let entry;
        try {
          entry = JSON.parse(trimmed);
        } catch {
          continue;
        }
        if (level === 'error' && entry.level !== 'error') continue;
        allEntries.push(entry);
      }

      const total = allEntries.length;
      // Return the most recent entries (tail of the file)
      const entries = allEntries.slice(-limit);

      res.json({ entries, total });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/logs/runs
   * Queries the collector_runs table for recent run history.
   * Query params:
   *   limit - max rows to return (default 200, max 1000)
   * Returns: { runs }
   */
  router.get('/runs', (req, res) => {
    try {
      let limit = parseInt(req.query.limit, 10);
      if (!Number.isFinite(limit) || limit < 1) limit = 200;
      if (limit > 1000) limit = 1000;

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
