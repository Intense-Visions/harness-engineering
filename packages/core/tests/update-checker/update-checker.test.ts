import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isUpdateCheckEnabled,
  shouldRunCheck,
  type UpdateCheckState,
} from '../../src/update-checker';

describe('isUpdateCheckEnabled', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns false when HARNESS_NO_UPDATE_CHECK=1', () => {
    process.env['HARNESS_NO_UPDATE_CHECK'] = '1';
    expect(isUpdateCheckEnabled()).toBe(false);
  });

  it('returns false when configInterval is 0', () => {
    expect(isUpdateCheckEnabled(0)).toBe(false);
  });

  it('returns true when env var is not set and interval is positive', () => {
    delete process.env['HARNESS_NO_UPDATE_CHECK'];
    expect(isUpdateCheckEnabled(86400000)).toBe(true);
  });

  it('returns true when env var is not set and no interval provided', () => {
    delete process.env['HARNESS_NO_UPDATE_CHECK'];
    expect(isUpdateCheckEnabled()).toBe(true);
  });

  it('returns false when env var is set even if interval is positive', () => {
    process.env['HARNESS_NO_UPDATE_CHECK'] = '1';
    expect(isUpdateCheckEnabled(86400000)).toBe(false);
  });
});

describe('shouldRunCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when state is null (never checked)', () => {
    expect(shouldRunCheck(null, 86400000)).toBe(true);
  });

  it('returns false when interval has not elapsed', () => {
    vi.setSystemTime(new Date(100_000));
    const state: UpdateCheckState = {
      lastCheckTime: 50_000,
      latestVersion: '1.0.0',
      currentVersion: '1.0.0',
    };
    // 50_000 + 86400000 > 100_000 => not elapsed
    expect(shouldRunCheck(state, 86400000)).toBe(false);
  });

  it('returns true when interval has elapsed', () => {
    vi.setSystemTime(new Date(100_000_000));
    const state: UpdateCheckState = {
      lastCheckTime: 1_000,
      latestVersion: '1.0.0',
      currentVersion: '1.0.0',
    };
    // 1_000 + 86400000 < 100_000_000 => elapsed
    expect(shouldRunCheck(state, 86400000)).toBe(true);
  });

  it('returns true when interval has exactly elapsed', () => {
    vi.setSystemTime(new Date(86401000));
    const state: UpdateCheckState = {
      lastCheckTime: 1000,
      latestVersion: '1.0.0',
      currentVersion: '1.0.0',
    };
    // 1000 + 86400000 = 86401000 = Date.now() => elapsed (<=)
    expect(shouldRunCheck(state, 86400000)).toBe(true);
  });
});
