import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isUpdateCheckEnabled,
  shouldRunCheck,
  readCheckState,
  invalidateCheckState,
  spawnBackgroundCheck,
  getUpdateNotification,
  type UpdateCheckState,
} from '../../src/update-checker';

const mockUnref = vi.fn();
const mockSpawn = vi.fn().mockReturnValue({
  unref: mockUnref,
  pid: 12345,
  stdin: null,
  stdout: null,
  stderr: null,
});

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: (...args: unknown[]) => mockSpawn(...args),
  };
});
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

describe('invalidateCheckState', () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-invalidate-'));
    originalHome = os.homedir();
    process.env['HOME'] = tmpDir;
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('removes the state file so subsequent readCheckState returns null', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    const statePath = path.join(harnessDir, 'update-check.json');
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        lastCheckTime: 1000,
        latestVersion: '2.3.1',
        currentVersion: '2.3.0',
      })
    );
    // Sanity check: pre-state is readable.
    expect(readCheckState()).not.toBeNull();

    invalidateCheckState();

    expect(fs.existsSync(statePath)).toBe(false);
    expect(readCheckState()).toBeNull();
  });

  it('does not throw when the state file is missing', () => {
    expect(() => invalidateCheckState()).not.toThrow();
  });

  it('suppresses stale "Update available" output after invalidation', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'update-check.json'),
      // Mirrors the contradiction reproduced in the field: cached latest is
      // older than what's now installed, but the notification would still
      // fire on every invocation until the 24h TTL elapses.
      JSON.stringify({
        lastCheckTime: 1000,
        latestVersion: '2.3.1',
        currentVersion: '2.3.0',
      })
    );

    // With cache present, notification fires for an older running version.
    expect(getUpdateNotification('2.3.0')).not.toBeNull();

    invalidateCheckState();

    // After invalidation, no notification regardless of current version.
    expect(getUpdateNotification('2.3.0')).toBeNull();
  });
});

describe('spawnBackgroundCheck', () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-spawn-'));
    originalHome = os.homedir();
    process.env['HOME'] = tmpDir;
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('spawns a detached node process with unref', () => {
    mockSpawn.mockClear();
    mockUnref.mockClear();

    spawnBackgroundCheck('1.7.0');

    expect(mockSpawn).toHaveBeenCalledOnce();
    const [cmd, args, opts] = mockSpawn.mock.calls[0]!;
    expect(cmd).toBe(process.execPath);
    expect(args![0]).toBe('-e');
    expect(typeof args![1]).toBe('string');
    expect(opts).toMatchObject({
      detached: true,
      stdio: 'ignore',
    });
    expect(mockUnref).toHaveBeenCalledOnce();
  });

  it('inline script references npm view and the state file path', () => {
    mockSpawn.mockClear();
    mockUnref.mockClear();

    spawnBackgroundCheck('1.7.0');

    const script = mockSpawn.mock.calls[0]![1]![1] as string;
    expect(script).toContain('npm');
    expect(script).toContain('@harness-engineering/cli');
    expect(script).toContain('update-check.json');
  });
});

describe('getUpdateNotification', () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-notif-'));
    originalHome = os.homedir();
    process.env['HOME'] = tmpDir;
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns formatted message when latestVersion > currentVersion', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'update-check.json'),
      JSON.stringify({
        lastCheckTime: Date.now(),
        latestVersion: '1.8.0',
        currentVersion: '1.7.0',
      })
    );

    const msg = getUpdateNotification('1.7.0');
    expect(msg).toContain('1.7.0');
    expect(msg).toContain('1.8.0');
    expect(msg).toContain('harness update');
  });

  it('returns null when versions are equal', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'update-check.json'),
      JSON.stringify({
        lastCheckTime: Date.now(),
        latestVersion: '1.7.0',
        currentVersion: '1.7.0',
      })
    );

    expect(getUpdateNotification('1.7.0')).toBeNull();
  });

  it('returns null when current is newer than latest (downgrade)', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'update-check.json'),
      JSON.stringify({
        lastCheckTime: Date.now(),
        latestVersion: '1.6.0',
        currentVersion: '1.7.0',
      })
    );

    expect(getUpdateNotification('1.7.0')).toBeNull();
  });

  it('returns null when latestVersion is null', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'update-check.json'),
      JSON.stringify({
        lastCheckTime: Date.now(),
        latestVersion: null,
        currentVersion: '1.7.0',
      })
    );

    expect(getUpdateNotification('1.7.0')).toBeNull();
  });

  it('returns null when state file is missing', () => {
    expect(getUpdateNotification('1.7.0')).toBeNull();
  });

  it('handles major version bump', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'update-check.json'),
      JSON.stringify({
        lastCheckTime: Date.now(),
        latestVersion: '2.0.0',
        currentVersion: '1.9.9',
      })
    );

    const msg = getUpdateNotification('1.9.9');
    expect(msg).toContain('2.0.0');
    expect(msg).toContain('1.9.9');
  });

  it('handles patch version bump', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'update-check.json'),
      JSON.stringify({
        lastCheckTime: Date.now(),
        latestVersion: '1.7.1',
        currentVersion: '1.7.0',
      })
    );

    const msg = getUpdateNotification('1.7.0');
    expect(msg).not.toBeNull();
    expect(msg).toContain('1.7.1');
  });

  it('uses ASCII arrow in notification format', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'update-check.json'),
      JSON.stringify({
        lastCheckTime: Date.now(),
        latestVersion: '2.0.0',
        currentVersion: '1.0.0',
      })
    );

    const msg = getUpdateNotification('1.0.0');
    expect(msg).toContain('v1.0.0 -> v2.0.0');
    // Should NOT contain Unicode arrow
    expect(msg).not.toContain('\u2192');
  });

  it('returns null for pre-release version strings when NaN affects comparison', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'update-check.json'),
      JSON.stringify({
        lastCheckTime: Date.now(),
        latestVersion: '1.7.1-beta.1',
        currentVersion: '1.7.0',
      })
    );

    // "1-beta" in the patch position becomes NaN, causing the relational
    // checks (NaN > 0, NaN < 0) to both be false. The loop falls through
    // and returns 0 ("equal"), suppressing the notification. This is
    // intentional: pre-release handling is a non-goal per the spec.
    expect(getUpdateNotification('1.7.0')).toBeNull();
  });
});
