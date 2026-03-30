import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HOOK_PATH = resolve(__dirname, '../../src/hooks/pre-compact-state.js');

function runHook(stdinData: string, cwd?: string): { exitCode: number; stderr: string } {
  try {
    execFileSync('node', [HOOK_PATH], {
      input: stdinData,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: cwd ?? process.cwd(),
    });
    return { exitCode: 0, stderr: '' };
  } catch (err: any) {
    return { exitCode: err.status ?? 1, stderr: err.stderr ?? '' };
  }
}

describe('pre-compact-state', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pre-compact-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .harness/compact-snapshots/ directory and writes snapshot', () => {
    const input = JSON.stringify({
      hook_type: 'PreCompact',
      session_id: 'test-session-123',
    });
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).toBe(0);

    const snapshotsDir = join(tmpDir, '.harness', 'compact-snapshots');
    expect(existsSync(snapshotsDir)).toBe(true);

    // Should have created a snapshot file
    const files = require('fs').readdirSync(snapshotsDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]).toMatch(/\.json$/);
  });

  it('snapshot contains timestamp and input data', () => {
    const input = JSON.stringify({
      hook_type: 'PreCompact',
      session_id: 'test-session-456',
    });
    runHook(input, tmpDir);

    const snapshotsDir = join(tmpDir, '.harness', 'compact-snapshots');
    const files = require('fs').readdirSync(snapshotsDir);
    const snapshot = JSON.parse(readFileSync(join(snapshotsDir, files[0]), 'utf-8'));

    expect(snapshot).toHaveProperty('timestamp');
    expect(snapshot).toHaveProperty('hookInput');
    expect(snapshot.hookInput.session_id).toBe('test-session-456');
  });

  it('preserves existing .harness directory', () => {
    mkdirSync(join(tmpDir, '.harness'), { recursive: true });
    require('fs').writeFileSync(join(tmpDir, '.harness', 'existing.txt'), 'keep me');

    const input = JSON.stringify({ hook_type: 'PreCompact' });
    runHook(input, tmpDir);

    expect(existsSync(join(tmpDir, '.harness', 'existing.txt'))).toBe(true);
  });

  it('fails open on malformed JSON', () => {
    const { exitCode } = runHook('not json', tmpDir);
    expect(exitCode).toBe(0);
  });

  it('fails open on empty stdin', () => {
    const { exitCode } = runHook('', tmpDir);
    expect(exitCode).toBe(0);
  });

  it('always exits 0', () => {
    const input = JSON.stringify({ hook_type: 'PreCompact' });
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).toBe(0);
  });
});
