import { describe, it, expect } from 'vitest';
import { getRequiredPassword } from '../src/authConfig.js';

describe('auth configuration', () => {
  it('requires GPU_MONITOR_PASSWORD to be set', () => {
    expect(() => getRequiredPassword({})).toThrow('GPU_MONITOR_PASSWORD is required');
  });

  it('returns the configured password', () => {
    expect(getRequiredPassword({ GPU_MONITOR_PASSWORD: 'secret' })).toBe('secret');
  });
});
