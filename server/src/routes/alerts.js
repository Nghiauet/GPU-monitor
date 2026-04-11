import { Router } from 'express';

/**
 * Factory function that returns an Express Router for alert-related routes.
 * @param {import('better-sqlite3').Database} db
 * @returns {Router}
 */
export function alertsRouter(db) {
  const router = Router();

  /**
   * GET /api/alerts
   * Triggered alerts with rule name via JOIN.
   * Query param: acknowledged (true/false)
   */
  router.get('/', (req, res) => {
    try {
      const { acknowledged } = req.query;

      let sql = `
        SELECT a.*, r.name AS rule_name
        FROM alerts a
        JOIN alert_rules r ON a.rule_id = r.id
      `;
      const params = [];

      if (acknowledged !== undefined) {
        const ackValue = acknowledged === 'true' ? 1 : 0;
        sql += ' WHERE a.acknowledged = ?';
        params.push(ackValue);
      }

      sql += ' ORDER BY a.ts_utc DESC';

      const rows = db.prepare(sql).all(...params);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/alerts/:id/acknowledge
   * Mark an alert as acknowledged.
   */
  router.post('/:id/acknowledge', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'id must be an integer' });
      }

      const result = db.prepare(`
        UPDATE alerts SET acknowledged = 1 WHERE id = ?
      `).run(id);

      if (result.changes === 0) {
        return res.status(404).json({ error: `Alert with id ${id} not found` });
      }

      const updated = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/alerts/rules
   * List all alert rules.
   */
  router.get('/rules', (req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM alert_rules ORDER BY id').all();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/alerts/rules
   * Create a new alert rule.
   * Body: { name, condition_type, target, threshold, duration_min, enabled }
   */
  router.post('/rules', (req, res) => {
    try {
      const { name, condition_type, target, threshold, duration_min, enabled } = req.body;

      if (!name || !condition_type || !target || threshold === undefined || duration_min === undefined) {
        return res.status(400).json({
          error: 'Missing required fields: name, condition_type, target, threshold, duration_min',
        });
      }

      const result = db.prepare(`
        INSERT INTO alert_rules (name, condition_type, target, threshold, duration_min, enabled)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        name,
        condition_type,
        target,
        threshold,
        duration_min,
        enabled !== undefined ? (enabled ? 1 : 0) : 1
      );

      const created = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(created);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * PUT /api/alerts/rules/:id
   * Update an alert rule (partial update, merge with existing).
   */
  router.put('/rules/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'id must be an integer' });
      }

      const existing = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(id);
      if (!existing) {
        return res.status(404).json({ error: `Alert rule with id ${id} not found` });
      }

      const merged = { ...existing, ...req.body, id };

      // Normalize enabled to 0/1
      if (merged.enabled !== undefined) {
        merged.enabled = merged.enabled ? 1 : 0;
      }

      db.prepare(`
        UPDATE alert_rules
        SET name = ?, condition_type = ?, target = ?, threshold = ?, duration_min = ?, enabled = ?
        WHERE id = ?
      `).run(
        merged.name,
        merged.condition_type,
        merged.target,
        merged.threshold,
        merged.duration_min,
        merged.enabled,
        id
      );

      const updated = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(id);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * DELETE /api/alerts/rules/:id
   * Delete an alert rule.
   */
  router.delete('/rules/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'id must be an integer' });
      }

      const result = db.prepare('DELETE FROM alert_rules WHERE id = ?').run(id);
      if (result.changes === 0) {
        return res.status(404).json({ error: `Alert rule with id ${id} not found` });
      }

      res.json({ deleted: id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
