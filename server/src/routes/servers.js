import { Router } from 'express';
import { readFileSync, writeFileSync } from 'fs';

/**
 * Factory function that returns an Express Router for server-related routes.
 * @param {import('better-sqlite3').Database} db
 * @param {string} configPath - Path to the config.json file
 * @returns {Router}
 */
export function serversRouter(db, configPath) {
  const router = Router();

  /**
   * Reads and parses the config file.
   * @returns {{ servers: object[], interval_seconds: number, retention_days: number }}
   */
  function readConfig() {
    const raw = readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  }

  /**
   * Writes the config object back to the config file.
   * @param {object} config
   */
  function writeConfig(config) {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  /**
   * GET /api/servers
   * List configured servers with latest host_summary and health status.
   */
  router.get('/', (req, res) => {
    try {
      const config = readConfig();
      const servers = config.servers || [];

      const result = servers.map((serverConfig) => {
        const host_summary = db.prepare(`
          SELECT * FROM host_summaries
          WHERE server = ?
            AND ts_utc = (SELECT MAX(ts_utc) FROM host_summaries WHERE server = ?)
          LIMIT 1
        `).get(serverConfig.name, serverConfig.name);

        const last_run = db.prepare(`
          SELECT * FROM collector_runs
          WHERE server = ?
          ORDER BY ts_utc DESC
          LIMIT 1
        `).get(serverConfig.name);

        return {
          ...serverConfig,
          host_summary: host_summary || null,
          last_run: last_run || null,
          healthy: last_run?.status === 'ok',
        };
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/servers/:name
   * Server detail: host_summary + GPUs + processes.
   */
  router.get('/:name', (req, res) => {
    try {
      const { name } = req.params;

      const host_summary = db.prepare(`
        SELECT * FROM host_summaries
        WHERE server = ?
          AND ts_utc = (SELECT MAX(ts_utc) FROM host_summaries WHERE server = ?)
        LIMIT 1
      `).get(name, name);

      const gpus = db.prepare(`
        SELECT * FROM gpu_devices
        WHERE server = ?
          AND ts_utc = (SELECT MAX(ts_utc) FROM gpu_devices WHERE server = ?)
        ORDER BY gpu_index
      `).all(name, name);

      const processes = db.prepare(`
        SELECT * FROM gpu_processes
        WHERE server = ?
          AND ts_utc = (SELECT MAX(ts_utc) FROM gpu_processes WHERE server = ?)
        ORDER BY gpu_index, pid
      `).all(name, name);

      const last_run = db.prepare(`
        SELECT * FROM collector_runs
        WHERE server = ?
        ORDER BY ts_utc DESC
        LIMIT 1
      `).get(name);

      res.json({
        name,
        host_summary: host_summary || null,
        gpus,
        processes,
        last_run: last_run || null,
        healthy: last_run?.status === 'ok',
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/servers/:name/history
   * host_summary time-series for a server.
   * Query params: from, to
   */
  router.get('/:name/history', (req, res) => {
    try {
      const { name } = req.params;
      const now = new Date();
      const defaultFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const defaultTo = now.toISOString();

      const from = req.query.from || defaultFrom;
      const to = req.query.to || defaultTo;

      const rows = db.prepare(`
        SELECT ts_utc, load_1, load_5, load_15, cpu_user_pct, cpu_system_pct, cpu_idle_pct,
               mem_total_mb, mem_used_mb, mem_free_mb, swap_total_mb, swap_used_mb,
               task_total, task_running, task_sleeping
        FROM host_summaries
        WHERE server = ? AND ts_utc BETWEEN ? AND ?
        ORDER BY ts_utc
      `).all(name, from, to);

      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/servers
   * Add a server to config.
   * Body: { name, hostname, ssh_user, ssh_key_path, enabled }
   */
  router.post('/', (req, res) => {
    try {
      const { name, hostname, ssh_user, ssh_key_path, enabled } = req.body;

      // Validate required fields
      if (!name || !hostname || !ssh_user || !ssh_key_path) {
        return res.status(400).json({
          error: 'Missing required fields: name, hostname, ssh_user, ssh_key_path',
        });
      }

      const config = readConfig();
      if (!config.servers) config.servers = [];

      // Check for duplicate name
      if (config.servers.some((s) => s.name === name)) {
        return res.status(409).json({ error: `Server with name '${name}' already exists` });
      }

      const newServer = {
        name,
        hostname,
        ssh_user,
        ssh_key_path,
        enabled: enabled !== undefined ? Boolean(enabled) : true,
      };

      config.servers.push(newServer);
      writeConfig(config);

      res.status(201).json(newServer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * PUT /api/servers/:name
   * Update server config (merge body into existing entry).
   */
  router.put('/:name', (req, res) => {
    try {
      const { name } = req.params;
      const config = readConfig();
      if (!config.servers) config.servers = [];

      const idx = config.servers.findIndex((s) => s.name === name);
      if (idx === -1) {
        return res.status(404).json({ error: `Server '${name}' not found` });
      }

      // Merge: do not allow changing the name via body
      const updated = { ...config.servers[idx], ...req.body, name };
      config.servers[idx] = updated;
      writeConfig(config);

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * DELETE /api/servers/:name
   * Remove a server from config.
   */
  router.delete('/:name', (req, res) => {
    try {
      const { name } = req.params;
      const config = readConfig();
      if (!config.servers) config.servers = [];

      const idx = config.servers.findIndex((s) => s.name === name);
      if (idx === -1) {
        return res.status(404).json({ error: `Server '${name}' not found` });
      }

      config.servers.splice(idx, 1);
      writeConfig(config);

      res.json({ deleted: name });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
