import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const describeUnix = process.platform === 'win32' ? describe.skip : describe;

// Mock node:fs so resolveAgnixBinary/lookupOnPath discovery is deterministic.
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

import { existsSync } from 'node:fs';
import {
  DEFAULT_AGNIX_TIMEOUT_MS,
  HARNESS_AGNIX_BIN,
  HARNESS_AGNIX_DISABLE,
  isAgnixDisabled,
  parseAgnixOutput,
  resolveAgnixBinary,
  runAgnix,
  type AgnixOutcome,
} from '../../../src/validation/agent-configs/agnix-runner';

const existsSyncMock = vi.mocked(existsSync);

/** Minimal ChildProcess double: EventEmitter + stdout/stderr streams + a spy kill(). */
function makeFakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

describe('DEFAULT_AGNIX_TIMEOUT_MS', () => {
  it('is 30_000ms', () => {
    expect(DEFAULT_AGNIX_TIMEOUT_MS).toBe(30_000);
  });
});

describe('env-var name constants', () => {
  it('expose stable env-var names', () => {
    expect(HARNESS_AGNIX_DISABLE).toBe('HARNESS_AGNIX_DISABLE');
    expect(HARNESS_AGNIX_BIN).toBe('HARNESS_AGNIX_BIN');
  });
});

describe('isAgnixDisabled', () => {
  const original = process.env[HARNESS_AGNIX_DISABLE];
  afterEach(() => {
    if (original === undefined) delete process.env[HARNESS_AGNIX_DISABLE];
    else process.env[HARNESS_AGNIX_DISABLE] = original;
  });

  it('is true for "1"', () => {
    process.env[HARNESS_AGNIX_DISABLE] = '1';
    expect(isAgnixDisabled()).toBe(true);
  });

  it('is true for "true"', () => {
    process.env[HARNESS_AGNIX_DISABLE] = 'true';
    expect(isAgnixDisabled()).toBe(true);
  });

  it('is false for "0"', () => {
    process.env[HARNESS_AGNIX_DISABLE] = '0';
    expect(isAgnixDisabled()).toBe(false);
  });

  it('is false for an arbitrary truthy-looking value like "yes"', () => {
    process.env[HARNESS_AGNIX_DISABLE] = 'yes';
    expect(isAgnixDisabled()).toBe(false);
  });

  it('is false when unset', () => {
    delete process.env[HARNESS_AGNIX_DISABLE];
    expect(isAgnixDisabled()).toBe(false);
  });
});

describeUnix('resolveAgnixBinary', () => {
  const originalBin = process.env[HARNESS_AGNIX_BIN];
  const originalPath = process.env.PATH;
  const originalPathCap = process.env.Path;

  beforeEach(() => {
    existsSyncMock.mockReset();
    delete process.env[HARNESS_AGNIX_BIN];
  });

  afterEach(() => {
    if (originalBin === undefined) delete process.env[HARNESS_AGNIX_BIN];
    else process.env[HARNESS_AGNIX_BIN] = originalBin;
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    if (originalPathCap === undefined) delete process.env.Path;
    else process.env.Path = originalPathCap;
  });

  it('returns the explicit path when it exists', () => {
    existsSyncMock.mockReturnValue(true);
    expect(resolveAgnixBinary('/opt/agnix')).toBe('/opt/agnix');
    expect(existsSyncMock).toHaveBeenCalledWith('/opt/agnix');
  });

  it('returns null when the explicit path does not exist', () => {
    existsSyncMock.mockReturnValue(false);
    expect(resolveAgnixBinary('/opt/agnix')).toBeNull();
  });

  it('uses HARNESS_AGNIX_BIN when set and existing', () => {
    process.env[HARNESS_AGNIX_BIN] = '/env/agnix';
    existsSyncMock.mockImplementation((p) => p === '/env/agnix');
    expect(resolveAgnixBinary()).toBe('/env/agnix');
  });

  it('falls through to PATH lookup when the env binary does not exist', () => {
    process.env[HARNESS_AGNIX_BIN] = '/env/agnix';
    process.env.PATH = '/usr/local/bin';
    // env binary missing, but PATH candidate present
    existsSyncMock.mockImplementation((p) => String(p).endsWith('agnix') && p !== '/env/agnix');
    const result = resolveAgnixBinary();
    expect(result).toBe('/usr/local/bin/agnix');
  });

  it('returns null when PATH is empty', () => {
    process.env.PATH = '';
    delete process.env.Path;
    existsSyncMock.mockReturnValue(false);
    expect(resolveAgnixBinary()).toBeNull();
  });

  it('returns null when no PATH directory contains the binary', () => {
    process.env.PATH = '/a:/b:/c';
    existsSyncMock.mockReturnValue(false);
    expect(resolveAgnixBinary()).toBeNull();
  });

  it('discovers the binary on the first matching PATH dir', () => {
    process.env.PATH = ['/nope', '/hit'].join(process.platform === 'win32' ? ';' : ':');
    existsSyncMock.mockImplementation((p) => String(p).startsWith('/hit'));
    const result = resolveAgnixBinary();
    expect(String(result).startsWith('/hit')).toBe(true);
    expect(String(result)).toContain('agnix');
  });
});

describe('runAgnix', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds args as ["--format","json", cwd] in non-strict mode and spawns with cwd', async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child);
    const p = runAgnix('/repo', false, '/bin/agnix', 30_000, spawnFn as never);
    child.stdout.emit('data', Buffer.from('[]'));
    child.emit('close', 0);
    const outcome = await p;

    expect(spawnFn).toHaveBeenCalledTimes(1);
    const [bin, args, opts] = spawnFn.mock.calls[0] as unknown as [
      string,
      string[],
      { cwd: string },
    ];
    expect(bin).toBe('/bin/agnix');
    expect(args).toEqual(['--format', 'json', '/repo']);
    expect(opts.cwd).toBe('/repo');
    expect(outcome).toEqual({ kind: 'ok', code: 0, stdout: '[]' });
  });

  it('adds --strict before the cwd in strict mode', async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child);
    const p = runAgnix('/repo', true, '/bin/agnix', 30_000, spawnFn as never);
    child.emit('close', 0);
    await p;
    const args = spawnFn.mock.calls[0]?.[1] as unknown as string[];
    expect(args).toEqual(['--format', 'json', '--strict', '/repo']);
  });

  it('accumulates chunked stdout and resolves ok with code 0', async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child);
    const p = runAgnix('/repo', false, '/bin/agnix', 30_000, spawnFn as never);
    child.stdout.emit('data', Buffer.from('foo'));
    child.stdout.emit('data', Buffer.from('bar'));
    child.emit('close', 0);
    expect(await p).toEqual({ kind: 'ok', code: 0, stdout: 'foobar' });
  });

  it('treats exit code 1 as ok (lint findings, not a tool crash)', async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child);
    const p = runAgnix('/repo', false, '/bin/agnix', 30_000, spawnFn as never);
    child.stdout.emit('data', Buffer.from('out'));
    child.emit('close', 1);
    expect(await p).toEqual({ kind: 'ok', code: 1, stdout: 'out' });
  });

  it('treats a non-0/1 exit code as tool-failure and captures stderr', async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child);
    const p = runAgnix('/repo', false, '/bin/agnix', 30_000, spawnFn as never);
    child.stderr.emit('data', Buffer.from('boom'));
    child.emit('close', 2);
    expect(await p).toEqual({ kind: 'tool-failure', code: 2, stderr: 'boom' });
  });

  it('maps a null exit code to tool-failure code -1', async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child);
    const p = runAgnix('/repo', false, '/bin/agnix', 30_000, spawnFn as never);
    child.emit('close', null);
    expect(await p).toEqual({ kind: 'tool-failure', code: -1, stderr: '' });
  });

  it('reports spawn-error when the child errors, regardless of exit code', async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child);
    const p = runAgnix('/repo', false, '/bin/agnix', 30_000, spawnFn as never);
    child.stderr.emit('data', Buffer.from('ENOENT'));
    child.emit('error', new Error('spawn failed'));
    child.emit('close', 0);
    expect(await p).toEqual({ kind: 'spawn-error', stderr: 'ENOENT' });
  });

  it('kills the child and resolves timeout when the deadline elapses', async () => {
    vi.useFakeTimers();
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child);
    const p = runAgnix('/repo', false, '/bin/agnix', 5_000, spawnFn as never);
    vi.advanceTimersByTime(5_000);
    const outcome = await p;
    expect(outcome).toEqual({ kind: 'timeout' });
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('settles only once: a late close after a resolved outcome is ignored', async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child);
    const p = runAgnix('/repo', false, '/bin/agnix', 30_000, spawnFn as never);
    child.stdout.emit('data', Buffer.from('first'));
    child.emit('close', 0);
    const outcome = await p;
    // A second close event must not change the already-settled outcome.
    child.emit('close', 2);
    expect(outcome).toEqual({ kind: 'ok', code: 0, stdout: 'first' });
  });

  it('defaults timeoutMs to DEFAULT_AGNIX_TIMEOUT_MS when omitted', async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child);
    // Not asserting the timer value directly; exercising the default-arg path.
    const p = runAgnix('/repo', false, '/bin/agnix', undefined, spawnFn as never);
    child.emit('close', 0);
    const outcome: AgnixOutcome = await p;
    expect(outcome.kind).toBe('ok');
  });
});

describe('parseAgnixOutput — additional shapes', () => {
  it('returns [] for whitespace-only stdout', () => {
    expect(parseAgnixOutput('   \n\t', '/repo')).toEqual([]);
  });

  it('accepts an envelope with a `findings` array', () => {
    const stdout = JSON.stringify({
      findings: [{ file: '/repo/x', rule_id: 'R-1', severity: 'error', message: 'm' }],
    });
    expect(parseAgnixOutput(stdout, '/repo')?.[0]).toMatchObject({
      file: 'x',
      ruleId: 'R-1',
      severity: 'error',
    });
  });

  it('accepts an envelope with a `results` array', () => {
    const stdout = JSON.stringify({
      results: [{ file: '/repo/y', rule_id: 'R-2', severity: 'warning', message: 'm' }],
    });
    expect(parseAgnixOutput(stdout, '/repo')?.[0]).toMatchObject({ file: 'y', ruleId: 'R-2' });
  });

  it('returns null for an object without a recognized diagnostics array', () => {
    expect(parseAgnixOutput(JSON.stringify({ other: [] }), '/repo')).toBeNull();
  });

  it('returns null for a JSON scalar (neither array nor object)', () => {
    expect(parseAgnixOutput('5', '/repo')).toBeNull();
  });

  it('defaults ruleId to AGNIX-UNKNOWN when neither rule_id nor rule present', () => {
    const stdout = JSON.stringify([{ file: '/repo/z', severity: 'error', message: 'm' }]);
    expect(parseAgnixOutput(stdout, '/repo')?.[0]?.ruleId).toBe('AGNIX-UNKNOWN');
  });

  it('defaults message to "agnix diagnostic" when message missing', () => {
    const stdout = JSON.stringify([{ file: '/repo/z', rule_id: 'R', severity: 'error' }]);
    expect(parseAgnixOutput(stdout, '/repo')?.[0]?.message).toBe('agnix diagnostic');
  });

  it('normalizes a missing/empty file path to "(unknown)"', () => {
    const stdout = JSON.stringify([{ rule_id: 'R', severity: 'error', message: 'm' }]);
    expect(parseAgnixOutput(stdout, '/repo')?.[0]?.file).toBe('(unknown)');
  });

  it('leaves a file path that is not under cwd unchanged', () => {
    const stdout = JSON.stringify([
      { file: '/elsewhere/foo.md', rule_id: 'R', severity: 'error', message: 'm' },
    ]);
    expect(parseAgnixOutput(stdout, '/repo')?.[0]?.file).toBe('/elsewhere/foo.md');
  });

  it('strips leading slashes when relativizing a path under cwd', () => {
    const stdout = JSON.stringify([
      { file: '/repo/nested/deep.md', rule_id: 'R', severity: 'error', message: 'm' },
    ]);
    expect(parseAgnixOutput(stdout, '/repo')?.[0]?.file).toBe('nested/deep.md');
  });

  it('attaches line and column when numeric', () => {
    const stdout = JSON.stringify([
      { file: '/repo/a', rule_id: 'R', severity: 'error', message: 'm', line: 3, column: 7 },
    ]);
    const finding = parseAgnixOutput(stdout, '/repo')?.[0];
    expect(finding?.line).toBe(3);
    expect(finding?.column).toBe(7);
  });

  it('omits line/column when non-numeric', () => {
    const stdout = JSON.stringify([
      {
        file: '/repo/a',
        rule_id: 'R',
        severity: 'error',
        message: 'm',
        line: 'x',
        column: null,
      },
    ]);
    const finding = parseAgnixOutput(stdout, '/repo')?.[0];
    expect(finding?.line).toBeUndefined();
    expect(finding?.column).toBeUndefined();
  });

  it('reads suggestion from the `fix` field when `suggestion` absent', () => {
    const stdout = JSON.stringify([
      { file: '/repo/a', rule_id: 'R', severity: 'error', message: 'm', fix: 'do this' },
    ]);
    expect(parseAgnixOutput(stdout, '/repo')?.[0]?.suggestion).toBe('do this');
  });

  it('prefers `suggestion` over `fix` when both present', () => {
    const stdout = JSON.stringify([
      {
        file: '/repo/a',
        rule_id: 'R',
        severity: 'error',
        message: 'm',
        suggestion: 'primary',
        fix: 'secondary',
      },
    ]);
    expect(parseAgnixOutput(stdout, '/repo')?.[0]?.suggestion).toBe('primary');
  });

  it('reads rule from `rule` and severity from `level` (fallback field names)', () => {
    const stdout = JSON.stringify([
      { file: '/repo/a', rule: 'LEGACY-1', level: 'critical', message: 'm' },
    ]);
    const finding = parseAgnixOutput(stdout, '/repo')?.[0];
    expect(finding?.ruleId).toBe('LEGACY-1');
    expect(finding?.severity).toBe('error');
  });

  it('maps note/info/hint severities to info', () => {
    const stdout = JSON.stringify([
      { file: '/repo/a', rule_id: 'R', severity: 'note', message: 'm' },
      { file: '/repo/b', rule_id: 'R', severity: 'info', message: 'm' },
      { file: '/repo/c', rule_id: 'R', severity: 'hint', message: 'm' },
    ]);
    const parsed = parseAgnixOutput(stdout, '/repo');
    expect(parsed?.map((f) => f.severity)).toEqual(['info', 'info', 'info']);
  });

  it('is case-insensitive on severity', () => {
    const stdout = JSON.stringify([
      { file: '/repo/a', rule_id: 'R', severity: 'ERROR', message: 'm' },
    ]);
    expect(parseAgnixOutput(stdout, '/repo')?.[0]?.severity).toBe('error');
  });
});
