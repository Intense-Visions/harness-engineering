import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isUpdateCheckEnabled,
  shouldRunCheck,
  readCheckState,
  type UpdateCheckState,
} from '../../src/update-checker';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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

describe('readCheckState', () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-update-'));
    originalHome = os.homedir();
    // We need to override the state file path used by readCheckState.
    // The module reads from ~/.harness/update-check.json.
    // We override HOME so os.homedir() returns our tmp dir.
    process.env['HOME'] = tmpDir;
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns null when state file does not exist', () => {
    expect(readCheckState()).toBeNull();
  });

  it('returns parsed state when file is valid', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    const state: UpdateCheckState = {
      lastCheckTime: 1000,
      latestVersion: '1.8.0',
      currentVersion: '1.7.0',
    };
    fs.writeFileSync(path.join(harnessDir, 'update-check.json'), JSON.stringify(state));
    expect(readCheckState()).toEqual(state);
  });

  it('returns null when file contains invalid JSON', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(path.join(harnessDir, 'update-check.json'), 'not-json{{{');
    expect(readCheckState()).toBeNull();
  });

  it('returns null when file has wrong shape', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'update-check.json'),
      JSON.stringify({ unrelated: true })
    );
    // Missing required fields; readCheckState should treat as corrupt
    expect(readCheckState()).toBeNull();
  });
});
