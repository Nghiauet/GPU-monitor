import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CollectorManager } from '../src/collector.js';
import { randomBytes } from 'crypto';
import { writeFileSync, existsSync, unlinkSync, readFileSync } from 'fs';

function tmpPath(suffix = '') {
  return `/tmp/test-collector-${randomBytes(8).toString('hex')}${suffix}`;
}

function writeConfig(path, data) {
  writeFileSync(path, JSON.stringify(data));
}

let configPath;
let scriptPath;
let manager;

beforeEach(() => {
  configPath = tmpPath('.json');
  scriptPath = tmpPath('.sh');
  writeConfig(configPath, { interval_seconds: 30 });
  // Write a simple script that exits immediately
  writeFileSync(scriptPath, '#!/bin/bash\nexit 0\n');
  manager = null;
});

afterEach(() => {
  if (manager) {
    manager.stop();
    manager = null;
  }
  for (const p of [configPath, scriptPath]) {
    if (p && existsSync(p)) unlinkSync(p);
  }
});

describe('CollectorManager — initial state', () => {
  it('starts in stopped state', () => {
    manager = new CollectorManager(configPath, scriptPath);
    const status = manager.getStatus();
    expect(status.running).toBe(false);
    expect(status.collecting).toBe(false);
    expect(status.lastRunAt).toBeNull();
    expect(status.lastError).toBeNull();
    expect(status.lastDurationMs).toBeNull();
  });

  it('reads interval_seconds from config file', () => {
    manager = new CollectorManager(configPath, scriptPath);
    const status = manager.getStatus();
    expect(status.intervalSeconds).toBe(30);
  });

  it('defaults to 60 if interval_seconds is missing', () => {
    writeConfig(configPath, {});
    manager = new CollectorManager(configPath, scriptPath);
    expect(manager.getStatus().intervalSeconds).toBe(60);
  });

  it('defaults to 60 if config file does not exist', () => {
    const missingPath = tmpPath('.json');
    manager = new CollectorManager(missingPath, scriptPath);
    expect(manager.getStatus().intervalSeconds).toBe(60);
  });
});

describe('CollectorManager — start/stop state', () => {
  it('sets running=true after start()', () => {
    manager = new CollectorManager(configPath, scriptPath);
    manager.start();
    expect(manager.getStatus().running).toBe(true);
    manager.stop();
    expect(manager.getStatus().running).toBe(false);
  });

  it('is idempotent: calling start() twice does not throw', () => {
    manager = new CollectorManager(configPath, scriptPath);
    expect(() => {
      manager.start();
      manager.start();
    }).not.toThrow();
    manager.stop();
  });

  it('stop() when not running does not throw', () => {
    manager = new CollectorManager(configPath, scriptPath);
    expect(() => manager.stop()).not.toThrow();
  });
});

describe('CollectorManager — updateInterval', () => {
  it('updates intervalSeconds in memory', () => {
    manager = new CollectorManager(configPath, scriptPath);
    manager.updateInterval(120);
    expect(manager.getStatus().intervalSeconds).toBe(120);
  });

  it('writes updated interval_seconds to config file', () => {
    manager = new CollectorManager(configPath, scriptPath);
    manager.updateInterval(45);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(config.interval_seconds).toBe(45);
  });

  it('preserves existing config keys when updating', () => {
    writeConfig(configPath, { interval_seconds: 30, extra_key: 'hello' });
    manager = new CollectorManager(configPath, scriptPath);
    manager.updateInterval(90);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(config.interval_seconds).toBe(90);
    expect(config.extra_key).toBe('hello');
  });

  it('restarts the collector if it was running when interval updated', () => {
    manager = new CollectorManager(configPath, scriptPath);
    manager.start();
    expect(manager.getStatus().running).toBe(true);
    manager.updateInterval(60);
    expect(manager.getStatus().running).toBe(true);
    expect(manager.getStatus().intervalSeconds).toBe(60);
  });
});

describe('CollectorManager — runOnce and callbacks', () => {
  it('calls onRunComplete callback after run finishes', async () => {
    // Use a script that exits immediately
    const result = await new Promise((resolve) => {
      manager = new CollectorManager(configPath, scriptPath, (r) => resolve(r));
      manager.runOnce();
    });
    expect(result.lastRunAt).toBeTruthy();
    expect(typeof result.lastDurationMs).toBe('number');
  });

  it('sets lastRunAt and lastDurationMs after runOnce', async () => {
    await new Promise((resolve) => {
      manager = new CollectorManager(configPath, scriptPath, resolve);
      manager.runOnce();
    });
    const status = manager.getStatus();
    expect(status.lastRunAt).toBeTruthy();
    expect(typeof status.lastDurationMs).toBe('number');
    expect(status.lastDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('sets lastError when script writes to stderr', async () => {
    const stderrScript = tmpPath('.sh');
    writeFileSync(stderrScript, '#!/bin/bash\necho "error msg" >&2\nexit 1\n');
    try {
      await new Promise((resolve) => {
        manager = new CollectorManager(configPath, stderrScript, resolve);
        manager.runOnce();
      });
      const status = manager.getStatus();
      expect(status.lastError).toBeTruthy();
      expect(status.lastError).toContain('error msg');
    } finally {
      if (existsSync(stderrScript)) unlinkSync(stderrScript);
    }
  });

  it('sets null lastError on successful run with no stderr', async () => {
    await new Promise((resolve) => {
      manager = new CollectorManager(configPath, scriptPath, resolve);
      manager.runOnce();
    });
    const status = manager.getStatus();
    expect(status.lastError).toBeNull();
  });

  it('sets collecting=true while running and false after completion', async () => {
    let wasCollecting = false;
    manager = new CollectorManager(configPath, scriptPath, () => {});

    // Use a slow script so we can check mid-run
    const slowScript = tmpPath('.sh');
    writeFileSync(slowScript, '#!/bin/bash\nsleep 0.1\n');
    try {
      const m2 = new CollectorManager(configPath, slowScript, () => {});
      m2.runOnce();
      wasCollecting = m2.getStatus().collecting;
      // Wait for completion
      await new Promise((resolve) => {
        m2._onRunComplete = resolve;
        // If already done, check status
        if (!m2.getStatus().collecting && m2.getStatus().lastRunAt) resolve({});
      });
      expect(wasCollecting).toBe(true);
      expect(m2.getStatus().collecting).toBe(false);
      m2.stop();
    } finally {
      if (existsSync(slowScript)) unlinkSync(slowScript);
    }
  });
});
