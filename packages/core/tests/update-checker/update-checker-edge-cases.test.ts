import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readCheckState, spawnBackgroundCheck } from '../../src/update-checker';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const mockUnref = vi.fn();
const mockSpawn = vi.fn().mockReturnValue({
  unref: mockUnref,
  pid: 99999,
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

describe('readCheckState — edge cases', () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-edge-'));
    originalHome = process.env['HOME']!;
    process.env['HOME'] = tmpDir;
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns null for empty file', () => {
    fs.writeFileSync(path.join(tmpDir, '.harness', 'update-check.json'), '');
    expect(readCheckState()).toBeNull();
  });

  it('returns null for truncated JSON', () => {
    fs.writeFileSync(path.join(tmpDir, '.harness', 'update-check.json'), '{"lastCheckTime":1234');
    expect(readCheckState()).toBeNull();
  });

  it('returns null for binary content', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.harness', 'update-check.json'),
      Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd])
    );
    expect(readCheckState()).toBeNull();
  });

  it('returns null for JSON array instead of object', () => {
    fs.writeFileSync(path.join(tmpDir, '.harness', 'update-check.json'), '[1, 2, 3]');
    expect(readCheckState()).toBeNull();
  });

  it('returns null for JSON string instead of object', () => {
    fs.writeFileSync(path.join(tmpDir, '.harness', 'update-check.json'), '"just a string"');
    expect(readCheckState()).toBeNull();
  });

  it('returns null when lastCheckTime is a string instead of number', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.harness', 'update-check.json'),
      JSON.stringify({
        lastCheckTime: 'not-a-number',
        latestVersion: '1.0.0',
        currentVersion: '1.0.0',
      })
    );
    expect(readCheckState()).toBeNull();
  });

  it('returns null when currentVersion is a number instead of string', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.harness', 'update-check.json'),
      JSON.stringify({
        lastCheckTime: 1000,
        latestVersion: '1.0.0',
        currentVersion: 100,
      })
    );
    expect(readCheckState()).toBeNull();
  });

  it('normalizes non-string latestVersion to null', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.harness', 'update-check.json'),
      JSON.stringify({
        lastCheckTime: 1000,
        latestVersion: 42,
        currentVersion: '1.0.0',
      })
    );
    const state = readCheckState();
    expect(state).not.toBeNull();
    expect(state!.latestVersion).toBeNull();
  });

  it('returns null for JSON null', () => {
    fs.writeFileSync(path.join(tmpDir, '.harness', 'update-check.json'), 'null');
    expect(readCheckState()).toBeNull();
  });
});

describe('readCheckState — missing directory', () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-nodir-'));
    originalHome = process.env['HOME']!;
    process.env['HOME'] = tmpDir;
    // Deliberately do NOT create ~/.harness/
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns null when ~/.harness/ directory does not exist', () => {
    expect(readCheckState()).toBeNull();
  });
});

describe('spawnBackgroundCheck — missing directory', () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-spawn-nodir-'));
    originalHome = process.env['HOME']!;
    process.env['HOME'] = tmpDir;
    mockSpawn.mockClear();
    mockUnref.mockClear();
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not throw when ~/.harness/ does not exist', () => {
    expect(() => spawnBackgroundCheck('1.0.0')).not.toThrow();
    expect(mockSpawn).toHaveBeenCalledOnce();
    expect(mockUnref).toHaveBeenCalledOnce();
  });

  it('inline script includes mkdirSync with recursive true', () => {
    spawnBackgroundCheck('1.0.0');
    const script = mockSpawn.mock.calls[0]![1]![1] as string;
    expect(script).toContain('mkdirSync');
    expect(script).toContain('recursive');
  });
});

describe('spawnBackgroundCheck — does not throw when spawn fails', () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-spawn-fail-'));
    originalHome = process.env['HOME']!;
    process.env['HOME'] = tmpDir;
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true });
    mockSpawn.mockReturnValue({
      unref: mockUnref,
      pid: 99999,
      stdin: null,
      stdout: null,
      stderr: null,
    });
  });

  it('propagates if spawn itself throws (caller should wrap)', () => {
    mockSpawn.mockImplementation(() => {
      throw new Error('spawn ENOENT');
    });
    // spawnBackgroundCheck does NOT wrap the spawn call in try/catch.
    // The callers (CLI + MCP) catch this. Verify current behavior:
    expect(() => spawnBackgroundCheck('1.0.0')).toThrow('spawn ENOENT');
  });
});
