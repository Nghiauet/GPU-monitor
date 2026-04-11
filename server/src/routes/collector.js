import { Router } from 'express';

/**
 * Factory function that returns an Express Router for collector control routes.
 * @param {import('../collector.js').CollectorManager} collectorManager
 * @returns {Router}
 */
export function collectorRouter(collectorManager) {
  const router = Router();

  /**
   * GET /api/collector/status
   * Returns current collector status.
   */
  router.get('/status', (req, res) => {
    try {
      const status = collectorManager.getStatus();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/collector/start
   * Starts the collector.
   */
  router.post('/start', (req, res) => {
    try {
      collectorManager.start();
      res.json({ ok: true, status: collectorManager.getStatus() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/collector/stop
   * Stops the collector.
   */
  router.post('/stop', (req, res) => {
    try {
      collectorManager.stop();
      res.json({ ok: true, status: collectorManager.getStatus() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * PUT /api/collector/config
   * Updates collector interval.
   * Body: { interval_seconds }
   */
  router.put('/config', (req, res) => {
    try {
      const { interval_seconds } = req.body;

      if (interval_seconds === undefined) {
        return res.status(400).json({ error: 'interval_seconds is required' });
      }

      const seconds = Number(interval_seconds);
      if (!Number.isFinite(seconds) || seconds < 10 || seconds > 3600) {
        return res.status(400).json({ error: 'interval_seconds must be between 10 and 3600' });
      }

      collectorManager.updateInterval(seconds);
      res.json({ ok: true, interval_seconds: seconds });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
