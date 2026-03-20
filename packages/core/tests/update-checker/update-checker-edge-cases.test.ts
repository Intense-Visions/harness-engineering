import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readCheckState, spawnBackgroundCheck } from '../../src/update-checker';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
