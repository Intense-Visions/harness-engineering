import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HOOK_PATH = resolve(__dirname, '../../src/hooks/strict-quality-gate.js');

// These tests drive the hook through a fake `gofmt` on PATH so we can produce a
// deterministic "violations" outcome without installing a real formatter. POSIX
// shell scripts only — macOS CI is the gate (see quality-warner.test.ts).
const isPosix = process.platform !== 'win32';

function runHook(
  stdinData: string,
  opts: { cwd?: string; extraPath?: string; timeoutMs?: number } = {}
): { exitCode: number; stderr: string } {
  // A generous formatter timeout by default, so machine load cannot turn the
  // fake formatter's verdict into a timeout (#2337). Timeout behaviour itself
  // is exercised explicitly with a short `timeoutMs`.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HARNESS_FORMAT_CHECK_TIMEOUT_MS: String(opts.timeoutMs ?? 50000),
  };
  if (opts.extraPath) {
    env.PATH = `${opts.extraPath}:${process.env.PATH ?? ''}`;
  }
  const result = spawnSync('node', [HOOK_PATH], {
    input: stdinData,
    encoding: 'utf-8',
    cwd: opts.cwd ?? process.cwd(),
    env,
    timeout: 60000,
  });
  return {
    // A hook killed by a signal has no verdict; never read that as a pass (0).
    exitCode: result.status ?? -1,
    stderr: result.stderr ?? '',
  };
}

/** Install an executable fake `gofmt` (POSIX sh) into <tmpDir>/bin and return that dir. */
function installFakeGofmt(tmpDir: string, body: string): string {
  const binDir = join(tmpDir, 'bin');
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(binDir, 'gofmt'), `#!/bin/sh\n${body}\n`);
  chmodSync(join(binDir, 'gofmt'), 0o755);
  return binDir;
}

const GO_EDIT = JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'main.go' } });

describe('strict-quality-gate', { timeout: 60000 }, () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'strict-quality-gate-'));
    writeFileSync(join(tmpDir, 'package.json'), '{"type":"module"}\n');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fails open (exit 0) on empty stdin', () => {
    expect(runHook('').exitCode).toBe(0);
  });

  it('fails open (exit 0) on malformed JSON', () => {
    expect(runHook('not json').exitCode).toBe(0);
  });

  it('exits 0 when no formatter is detected', () => {
    const input = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'src/app.ts' } });
    expect(runHook(input, { cwd: tmpDir }).exitCode).toBe(0);
  });

  it.skipIf(!isPosix)('exits 2 on genuine format violations', () => {
    // `gofmt -l main.go` echoing the filename signals it needs formatting.
    const binDir = installFakeGofmt(tmpDir, 'echo "$2"');
    const { exitCode, stderr } = runHook(GO_EDIT, { cwd: tmpDir, extraPath: binDir });
    expect(exitCode).toBe(2);
    expect(stderr).toContain('BLOCKED');
    expect(stderr).toContain('main.go');
  });

  it.skipIf(!isPosix)('fails open (exit 0) when the formatter cannot run', () => {
    // Non-zero exit with no parseable output → infra-error → fail open.
    const binDir = installFakeGofmt(tmpDir, 'exit 3');
    const { exitCode, stderr } = runHook(GO_EDIT, { cwd: tmpDir, extraPath: binDir });
    expect(exitCode).toBe(0);
    expect(stderr).toContain('failing open');
  });

  // #2337: a formatter that times out produced no verdict. The strict gate used
  // to fail open (exit 0) here, which under load let a genuine violation through.
  it.skipIf(!isPosix)('blocks (exit 2) when the formatter times out', () => {
    // `exec` so the timeout's SIGTERM reaches the sleeping process itself.
    const binDir = installFakeGofmt(tmpDir, 'exec sleep 30');
    const { exitCode, stderr } = runHook(GO_EDIT, {
      cwd: tmpDir,
      extraPath: binDir,
      timeoutMs: 200,
    });
    expect(exitCode).toBe(2);
    expect(stderr).toContain('BLOCKED');
    expect(stderr).toContain('timed out');
  });

  it.skipIf(!isPosix)('exits 0 (clean) when the formatter reports no issues', () => {
    const binDir = installFakeGofmt(tmpDir, 'exit 0');
    expect(runHook(GO_EDIT, { cwd: tmpDir, extraPath: binDir }).exitCode).toBe(0);
  });
});
