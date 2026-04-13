import { Router } from 'express';
import { getDateRange } from '../dateRange.js';
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
      const { from, to } = getDateRange(req.query);

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

      // Validate field format to prevent injection into shell/SSH commands
      const safeNameRe = /^[a-zA-Z0-9._-]+$/;
      const safePathRe = /^[a-zA-Z0-9._~\/-]+$/;
      if (!safeNameRe.test(name) || !safeNameRe.test(hostname) || !safeNameRe.test(ssh_user) || !safePathRe.test(ssh_key_path)) {
        return res.status(400).json({
          error: 'Fields contain invalid characters. Use only alphanumeric, dots, hyphens, underscores (paths may include ~, /).',
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

      // Whitelist allowed fields to prevent arbitrary key injection
      const { hostname, ssh_user, ssh_key_path, enabled } = req.body;

      // Validate field format to prevent injection into shell/SSH commands
      const safeNameRe = /^[a-zA-Z0-9._-]+$/;
      const safePathRe = /^[a-zA-Z0-9._~\/-]+$/;
      if (
        (hostname !== undefined && !safeNameRe.test(hostname)) ||
        (ssh_user !== undefined && !safeNameRe.test(ssh_user)) ||
        (ssh_key_path !== undefined && !safePathRe.test(ssh_key_path))
      ) {
        return res.status(400).json({
          error: 'Fields contain invalid characters. Use only alphanumeric, dots, hyphens, underscores (paths may include ~, /).',
        });
      }

      const updated = { ...config.servers[idx] };
      if (hostname !== undefined) updated.hostname = hostname;
      if (ssh_user !== undefined) updated.ssh_user = ssh_user;
      if (ssh_key_path !== undefined) updated.ssh_key_path = ssh_key_path;
      if (enabled !== undefined) updated.enabled = Boolean(enabled);
      updated.name = name;
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
