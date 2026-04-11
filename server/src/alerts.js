/**
 * Alert Engine: evaluates alert rules against recent data and fires alerts.
 */

/**
 * Checks if a user's GPU memory has exceeded threshold for the full duration.
 * @param {import('better-sqlite3').Database} db
 * @param {object} rule
 * @returns {object|null} fired alert data or null
 */
function evalUserGpuMemExceeds(db, rule) {
  const { target: user, threshold, duration_min } = rule;
  const rows = db.prepare(`
    SELECT total_gpu_mem_mb FROM user_rollups
    WHERE user = ? AND ts_utc >= datetime('now', ? || ' minutes')
    ORDER BY ts_utc
  `).all(user, `-${duration_min}`);

  if (rows.length === 0) return null;
  if (!rows.every((r) => r.total_gpu_mem_mb > threshold)) return null;

  return {
    rule_id: rule.id,
    ts_utc: new Date().toISOString(),
    server: null,
    user,
    message: `User ${user} GPU memory ${rows[rows.length - 1].total_gpu_mem_mb} MB exceeds threshold ${threshold} MB for ${duration_min} min`,
  };
}

/**
 * Checks if a user's GPU count has exceeded threshold for the full duration.
 */
function evalUserGpuCountExceeds(db, rule) {
  const { target: user, threshold, duration_min } = rule;
  const rows = db.prepare(`
    SELECT gpu_count FROM user_rollups
    WHERE user = ? AND ts_utc >= datetime('now', ? || ' minutes')
    ORDER BY ts_utc
  `).all(user, `-${duration_min}`);

  if (rows.length === 0) return null;
  if (!rows.every((r) => r.gpu_count > threshold)) return null;

  return {
    rule_id: rule.id,
    ts_utc: new Date().toISOString(),
    server: null,
    user,
    message: `User ${user} GPU count ${rows[rows.length - 1].gpu_count} exceeds threshold ${threshold} for ${duration_min} min`,
  };
}

/**
 * Checks if a GPU has been idle (util < threshold) for the full duration.
 * Target format: "server:gpuIndex"
 */
function evalGpuIdle(db, rule) {
  const { target, threshold, duration_min } = rule;
  const [server, gpuIndexStr] = target.split(':');
  const gpuIndex = parseInt(gpuIndexStr, 10);

  const rows = db.prepare(`
    SELECT gpu_util_pct FROM gpu_devices
    WHERE server = ? AND gpu_index = ? AND ts_utc >= datetime('now', ? || ' minutes')
    ORDER BY ts_utc
  `).all(server, gpuIndex, `-${duration_min}`);

  if (rows.length === 0) return null;
  if (!rows.every((r) => r.gpu_util_pct < threshold)) return null;

  return {
    rule_id: rule.id,
    ts_utc: new Date().toISOString(),
    server,
    user: null,
    message: `GPU ${gpuIndex} on ${server} utilization below ${threshold}% for ${duration_min} min`,
  };
}

/**
 * Checks if server load_1 has exceeded threshold for the full duration.
 * Target is server name.
 */
function evalServerLoadExceeds(db, rule) {
  const { target: server, threshold, duration_min } = rule;
  const rows = db.prepare(`
    SELECT load_1 FROM host_summaries
    WHERE server = ? AND ts_utc >= datetime('now', ? || ' minutes')
    ORDER BY ts_utc
  `).all(server, `-${duration_min}`);

  if (rows.length === 0) return null;
  if (!rows.every((r) => r.load_1 > threshold)) return null;

  return {
    rule_id: rule.id,
    ts_utc: new Date().toISOString(),
    server,
    user: null,
    message: `Server ${server} load_1 ${rows[rows.length - 1].load_1} exceeds threshold ${threshold} for ${duration_min} min`,
  };
}

/**
 * Checks if a server has had consecutive failures >= threshold.
 * Target is server name.
 */
function evalServerUnreachable(db, rule) {
  const { target: server, threshold } = rule;
  const rows = db.prepare(`
    SELECT status FROM collector_runs
    WHERE server = ?
    ORDER BY ts_utc DESC
    LIMIT ?
  `).all(server, Math.ceil(threshold));

  if (rows.length < threshold) return null;
  if (!rows.every((r) => r.status !== 'ok')) return null;

  return {
    rule_id: rule.id,
    ts_utc: new Date().toISOString(),
    server,
    user: null,
    message: `Server ${server} unreachable for ${threshold} consecutive runs`,
  };
}

/**
 * Checks if a GPU temperature has exceeded threshold for the full duration.
 * Target format: "server:gpuIndex"
 */
function evalGpuTempExceeds(db, rule) {
  const { target, threshold, duration_min } = rule;
  const [server, gpuIndexStr] = target.split(':');
  const gpuIndex = parseInt(gpuIndexStr, 10);

  const rows = db.prepare(`
    SELECT temp_c FROM gpu_devices
    WHERE server = ? AND gpu_index = ? AND ts_utc >= datetime('now', ? || ' minutes')
    ORDER BY ts_utc
  `).all(server, gpuIndex, `-${duration_min}`);

  if (rows.length === 0) return null;
  if (!rows.every((r) => r.temp_c > threshold)) return null;

  return {
    rule_id: rule.id,
    ts_utc: new Date().toISOString(),
    server,
    user: null,
    message: `GPU ${gpuIndex} on ${server} temperature ${rows[rows.length - 1].temp_c}°C exceeds threshold ${threshold}°C for ${duration_min} min`,
  };
}

const CONDITION_EVALUATORS = {
  user_gpu_mem_exceeds: evalUserGpuMemExceeds,
  user_gpu_count_exceeds: evalUserGpuCountExceeds,
  gpu_idle: evalGpuIdle,
  server_load_exceeds: evalServerLoadExceeds,
  server_unreachable: evalServerUnreachable,
  gpu_temp_exceeds: evalGpuTempExceeds,
};

/**
 * Evaluates all enabled alert rules and fires alerts for triggered conditions.
 * Deduplicates: won't fire if an unacknowledged alert already exists for that rule.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {object[]} array of fired alert objects
 */
export function evaluateAlerts(db) {
  const rules = db.prepare(`
    SELECT * FROM alert_rules WHERE enabled = 1
  `).all();

  const insertAlert = db.prepare(`
    INSERT INTO alerts (rule_id, ts_utc, server, user, message)
    VALUES (@rule_id, @ts_utc, @server, @user, @message)
  `);

  const checkDedup = db.prepare(`
    SELECT 1 FROM alerts WHERE rule_id = ? AND acknowledged = 0 LIMIT 1
  `);

  const fired = [];

  for (const rule of rules) {
    // Dedup: skip if an unacknowledged alert already exists for this rule
    const existing = checkDedup.get(rule.id);
    if (existing) continue;

    const evaluator = CONDITION_EVALUATORS[rule.condition_type];
    if (!evaluator) continue;

    const alertData = evaluator(db, rule);
    if (!alertData) continue;

    insertAlert.run(alertData);
    fired.push(alertData);
  }

  return fired;
}
