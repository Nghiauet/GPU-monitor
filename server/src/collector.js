import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

/**
 * Manages the collector script: scheduling, spawning, and status tracking.
 */
export class CollectorManager {
  /**
   * @param {string} configPath - Path to JSON config file containing interval_seconds
   * @param {string} scriptPath - Path to the bash collector script
   * @param {Function} onRunComplete - Callback called after each run completes
   */
  constructor(configPath, scriptPath, onRunComplete = () => {}) {
    this._configPath = configPath;
    this._scriptPath = scriptPath;
    this._onRunComplete = onRunComplete;

    this._running = false;
    this._collecting = false;
    this._intervalSeconds = this._readIntervalFromConfig();
    this._lastRunAt = null;
    this._lastError = null;
    this._lastDurationMs = null;
    this._intervalHandle = null;
    this._childProcess = null;
  }

  /**
   * Reads interval_seconds from the config file.
   * @returns {number}
   */
  _readIntervalFromConfig() {
    try {
      const raw = readFileSync(this._configPath, 'utf8');
      const config = JSON.parse(raw);
      return config.interval_seconds ?? 60;
    } catch {
      return 60;
    }
  }

  /**
   * Returns current status of the collector.
   * @returns {{ running: boolean, collecting: boolean, intervalSeconds: number, lastRunAt: string|null, lastError: string|null, lastDurationMs: number|null }}
   */
  getStatus() {
    return {
      running: this._running,
      collecting: this._collecting,
      intervalSeconds: this._intervalSeconds,
      lastRunAt: this._lastRunAt,
      lastError: this._lastError,
      lastDurationMs: this._lastDurationMs,
    };
  }

  /**
   * Starts the collector: runs immediately, then schedules recurring runs.
   */
  start() {
    if (this._running) return;
    this._running = true;
    this.runOnce();
    this._intervalHandle = setInterval(() => {
      this.runOnce();
    }, this._intervalSeconds * 1000);
  }

  /**
   * Stops the collector: clears interval and kills child process if running.
   */
  stop() {
    this._running = false;
    if (this._intervalHandle !== null) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = null;
    }
    if (this._childProcess) {
      try {
        this._childProcess.kill();
      } catch {
        // process may have already exited
      }
      this._childProcess = null;
      this._collecting = false;
    }
  }

  /**
   * Updates the interval: writes new value to config file, restarts if running.
   * @param {number} seconds
   */
  updateInterval(seconds) {
    this._intervalSeconds = seconds;

    // Read existing config and update interval_seconds
    let config = {};
    try {
      const raw = readFileSync(this._configPath, 'utf8');
      config = JSON.parse(raw);
    } catch {
      // start fresh if file doesn't exist or is invalid
    }
    config.interval_seconds = seconds;
    writeFileSync(this._configPath, JSON.stringify(config, null, 2));

    // Restart the interval timer if running, but don't kill in-flight collection
    if (this._running) {
      // Only clear and re-create the interval timer — leave _childProcess alone
      if (this._intervalHandle !== null) {
        clearInterval(this._intervalHandle);
        this._intervalHandle = null;
      }
      this._intervalHandle = setInterval(() => {
        this.runOnce();
      }, this._intervalSeconds * 1000);
    }
  }

  /**
   * Spawns `bash scriptPath configPath`, tracks stderr, sets status fields on close.
   * Calls onRunComplete callback when done.
   */
  runOnce() {
    if (this._collecting) return;
    this._collecting = true;
    const startTime = Date.now();
    const stderrLines = [];

    const child = spawn('bash', [this._scriptPath, this._configPath]);
    this._childProcess = child;

    child.stderr.on('data', (data) => {
      stderrLines.push(data.toString());
    });

    child.on('close', (code) => {
      this._childProcess = null;
      this._collecting = false;
      this._lastRunAt = new Date().toISOString();
      this._lastDurationMs = Date.now() - startTime;
      this._lastError = stderrLines.length > 0 ? stderrLines.join('') : (code !== 0 ? `Exit code: ${code}` : null);
      Promise.resolve(this._onRunComplete({
        code,
        lastRunAt: this._lastRunAt,
        lastDurationMs: this._lastDurationMs,
        lastError: this._lastError,
      })).catch((err) => {
        console.error('[CollectorManager] onRunComplete error:', err);
      });
    });

    child.on('error', (err) => {
      this._childProcess = null;
      this._collecting = false;
      this._lastRunAt = new Date().toISOString();
      this._lastDurationMs = Date.now() - startTime;
      this._lastError = err.message;
      Promise.resolve(this._onRunComplete({
        code: -1,
        lastRunAt: this._lastRunAt,
        lastDurationMs: this._lastDurationMs,
        lastError: this._lastError,
      })).catch((cbErr) => {
        console.error('[CollectorManager] onRunComplete error:', cbErr);
      });
    });
  }
}
