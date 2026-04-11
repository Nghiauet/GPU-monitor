import { readdirSync, rmdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Deletes rows older than retentionDays from monitored data tables.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} retentionDays - Number of days to retain data
 * @returns {{ gpu_processes: number, user_rollups: number, gpu_devices: number, host_summaries: number, collector_runs: number }}
 */
export function cleanupDb(db, retentionDays) {
  const tables = ['gpu_processes', 'user_rollups', 'gpu_devices', 'host_summaries', 'collector_runs'];
  const counts = {};

  for (const table of tables) {
    const result = db.prepare(`
      DELETE FROM ${table}
      WHERE ts_utc < datetime('now', ? || ' days')
    `).run(`-${retentionDays}`);
    counts[table] = result.changes;
  }

  return counts;
}

/**
 * Deletes subdirectories matching YYYY-MM-DD pattern older than retentionDays.
 *
 * @param {string} logDir - Directory containing date-named subdirectories
 * @param {number} retentionDays - Number of days to retain log dirs
 * @returns {number} Count of removed directories
 */
export function cleanupLogDirs(logDir, retentionDays) {
  if (!existsSync(logDir)) return 0;

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  // Use date-only comparison: normalize cutoff to start of day UTC
  const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

  let removed = 0;
  let entries;
  try {
    entries = readdirSync(logDir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!datePattern.test(entry.name)) continue;
    if (entry.name < cutoffStr) {
      try {
        rmdirSync(join(logDir, entry.name), { recursive: true });
        removed++;
      } catch {
        // skip directories that can't be removed
      }
    }
  }

  return removed;
}
