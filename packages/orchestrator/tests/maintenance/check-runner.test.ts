import { describe, it, expect } from 'vitest';
import {
  runHarnessCheck,
  isCheckTimeoutError,
  MAINTENANCE_CHECK_MAX_BUFFER,
  MAINTENANCE_CHECK_TIMEOUT_MS,
  type ExecFileAsyncFn,
  type RunHarnessCheckOptions,
} from '../../src/maintenance/check-runner';
import { classifyCheckExecutionFailure } from '../../src/maintenance/task-runner';

/** An execFile stub that RESOLVES with the given stdout (clean run). */
function resolveWith(stdout: string): ExecFileAsyncFn {
  return async () => ({ stdout, stderr: '' });
}

/** An execFile stub that REJECTS with an execFile-shaped error. */
function rejectWith(props: {
  stdout?: string;
  stderr?: string;
  killed?: boolean;
  signal?: string | null;
  code?: string | number | null;
}): ExecFileAsyncFn {
  return async () => {
    throw Object.assign(new Error('execFile failed'), props);
  };
}

const SPAWN = { file: 'harness', args: ['check-arch'] };

describe('runHarnessCheck — shared cron+CLI spawn/parse/timeout core', () => {
  it('exports the shared 64MB / 300s constants', () => {
    expect(MAINTENANCE_CHECK_MAX_BUFFER).toBe(64 * 1024 * 1024);
    expect(MAINTENANCE_CHECK_TIMEOUT_MS).toBe(300_000);
  });

  it('clean run (exit 0, no count) → 0 findings, passed, not failed', async () => {
    const r = await runHarnessCheck(SPAWN, '/repo', {
      execFileAsync: resolveWith('Validation passed\n'),
    });
    expect(r.findings).toBe(0);
    expect(r.passed).toBe(true);
    expect(r.executionFailed).toBe(false);
    expect(r.output).toContain('Validation passed');
  });

  it('clean run with a parseable count → parsed findings (passed=false)', async () => {
    const r = await runHarnessCheck(SPAWN, '/repo', {
      execFileAsync: resolveWith('Found 12 issues\n'),
    });
    expect(r.findings).toBe(12);
    expect(r.passed).toBe(false);
    expect(r.executionFailed).toBe(false);
  });

  it('non-zero exit WITH a parseable count → real findings, NOT executionFailed', async () => {
    const r = await runHarnessCheck(SPAWN, '/repo', {
      execFileAsync: rejectWith({ stdout: 'Validation failed (45 issues)', code: 1 }),
    });
    expect(r.findings).toBe(45);
    expect(r.passed).toBe(false);
    expect(r.executionFailed).toBe(false);
  });

  it('spawn error (ENOENT, no count) → executionFailed, 0 findings (not 1)', async () => {
    const r = await runHarnessCheck(SPAWN, '/repo', {
      execFileAsync: rejectWith({ code: 'ENOENT', stderr: 'spawn harness ENOENT' }),
    });
    expect(r.executionFailed).toBe(true);
    expect(r.findings).toBe(0);
    // ENOENT is NOT a timeout — no synthesized timeout marker.
    expect(r.output).not.toMatch(/timed out/i);
    expect(classifyCheckExecutionFailure(r.output).kind).toBe('unrunnable');
  });

  it('unknown subcommand (exit 1, no count) → executionFailed, 0 findings', async () => {
    const r = await runHarnessCheck(SPAWN, '/repo', {
      execFileAsync: rejectWith({ stderr: "error: unknown command 'frobnicate'", code: 1 }),
    });
    expect(r.executionFailed).toBe(true);
    expect(r.findings).toBe(0);
  });

  it('timeout with EMPTY output → executionFailed, 0 findings, synthesized marker', async () => {
    const r = await runHarnessCheck(SPAWN, '/repo', {
      execFileAsync: rejectWith({ killed: true, signal: 'SIGTERM' }),
    });
    expect(r.executionFailed).toBe(true);
    expect(r.findings).toBe(0);
    expect(r.output).toMatch(/check timed out after 300000ms/i);
    expect(classifyCheckExecutionFailure(r.output).kind).toBe('unrunnable');
  });

  it('timeout marker uses the injected timeoutMs', async () => {
    const r = await runHarnessCheck(SPAWN, '/repo', {
      execFileAsync: rejectWith({ code: 'ETIMEDOUT' }),
      timeoutMs: 42,
    });
    expect(r.output).toMatch(/check timed out after 42ms/i);
    expect(r.executionFailed).toBe(true);
  });

  // Item 3 (timeout provenance): a check that flushes PARTIAL parseable output
  // before SIGTERM must be classified `unrunnable` (failure), NOT a truncated
  // "ran-no-count" success that trusts the partial "5 issues".
  it('timeout that flushed PARTIAL parseable output → executionFailed (not a 5-finding success)', async () => {
    const r = await runHarnessCheck(SPAWN, '/repo', {
      execFileAsync: rejectWith({ stdout: '5 issues so far...', killed: true, signal: 'SIGTERM' }),
    });
    expect(r.executionFailed).toBe(true);
    expect(r.findings).toBe(0); // partial count is NOT trusted
    expect(r.output).toContain('5 issues so far');
    expect(r.output).toMatch(/check timed out after/i);
    // The marker is appended after the partial output, yet classification still
    // resolves to `unrunnable` (timeout wins ahead of explicitFindingsCount).
    expect(classifyCheckExecutionFailure(r.output).kind).toBe('unrunnable');
  });

  it('empty command output on success-with-buffer is stringified safely', async () => {
    const r = await runHarnessCheck(SPAWN, '/repo', {
      execFileAsync: resolveWith(''),
    });
    expect(r.findings).toBe(0);
    expect(r.passed).toBe(true);
    expect(r.output).toBe('');
  });

  it('threads cwd / timeout / maxBuffer through to execFile', async () => {
    let seen: { cwd: string; timeout: number; maxBuffer: number } | null = null;
    const spy: ExecFileAsyncFn = async (_file, _args, options) => {
      seen = options;
      return { stdout: 'ok' };
    };
    const opts: RunHarnessCheckOptions = { execFileAsync: spy, timeoutMs: 1234, maxBuffer: 999 };
    await runHarnessCheck(SPAWN, '/some/cwd', opts);
    expect(seen).toEqual({ cwd: '/some/cwd', timeout: 1234, maxBuffer: 999 });
  });

  it('defaults timeout/maxBuffer to the shared constants', async () => {
    let seen: { cwd: string; timeout: number; maxBuffer: number } | null = null;
    const spy: ExecFileAsyncFn = async (_file, _args, options) => {
      seen = options;
      return { stdout: 'ok' };
    };
    await runHarnessCheck(SPAWN, '/repo', { execFileAsync: spy });
    expect(seen!.timeout).toBe(MAINTENANCE_CHECK_TIMEOUT_MS);
    expect(seen!.maxBuffer).toBe(MAINTENANCE_CHECK_MAX_BUFFER);
  });
});

describe('isCheckTimeoutError', () => {
  it('recognizes SIGTERM / ETIMEDOUT / killed', () => {
    expect(isCheckTimeoutError({ killed: true })).toBe(true);
    expect(isCheckTimeoutError({ signal: 'SIGTERM' })).toBe(true);
    expect(isCheckTimeoutError({ code: 'ETIMEDOUT' })).toBe(true);
  });
  it('does not flag an ordinary non-zero exit', () => {
    expect(isCheckTimeoutError({ code: 1 })).toBe(false);
    expect(isCheckTimeoutError({ code: 'ENOENT' })).toBe(false);
  });
});
