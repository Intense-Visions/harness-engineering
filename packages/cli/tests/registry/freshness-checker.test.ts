import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

const mockUnref = vi.fn();
const mockSpawn = vi.fn().mockReturnValue({ unref: mockUnref, pid: 4321 });
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, spawn: (...args: unknown[]) => mockSpawn(...args) };
});

import {
  readFreshnessState,
  writeFreshnessState,
  isFreshnessCheckEnabled,
  shouldRunFreshnessCheck,
  evaluateEntry,
  getFreshnessNotification,
  spawnBackgroundFreshnessCheck,
  buildProbeScript,
  MAX_PROVIDERS,
  type FreshnessState,
  type FreshnessProvider,
} from '../../src/registry/freshness-checker';
import type { SkillSource } from '../../src/registry/lockfile';

describe('freshness state IO + gating', () => {
  const originalEnv = process.env;
  let tmpHome: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-fresh-home-'));
    process.env['HOME'] = tmpHome;
    delete process.env['HARNESS_NO_UPDATE_CHECK'];
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('round-trips state through write then read', () => {
    const state: FreshnessState = {
      lastCheckTime: 123,
      providers: [{ name: 'a', kind: 'github', current: 'abc', latest: 'def', outdated: true }],
    };
    writeFreshnessState(state);
    expect(readFreshnessState()).toEqual(state);
  });

  it('returns null when the state file is missing', () => {
    expect(readFreshnessState()).toBeNull();
  });

  it('returns null when the state file is corrupt or mis-shaped', () => {
    const p = path.join(tmpHome, '.harness', 'skill-freshness.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'not json');
    expect(readFreshnessState()).toBeNull();
    fs.writeFileSync(p, JSON.stringify({ lastCheckTime: 'nope', providers: [] }));
    expect(readFreshnessState()).toBeNull();
  });

  it('drops malformed provider entries but keeps valid ones', () => {
    const p = path.join(tmpHome, '.harness', 'skill-freshness.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(
      p,
      JSON.stringify({
        lastCheckTime: 5,
        providers: [
          { name: 'ok', kind: 'npm', current: '1.0.0', latest: '1.1.0', outdated: true },
          { bogus: true },
        ],
      })
    );
    expect(readFreshnessState()).toEqual({
      lastCheckTime: 5,
      providers: [{ name: 'ok', kind: 'npm', current: '1.0.0', latest: '1.1.0', outdated: true }],
    });
  });

  it('isFreshnessCheckEnabled honors HARNESS_NO_UPDATE_CHECK and interval 0', () => {
    process.env['HARNESS_NO_UPDATE_CHECK'] = '1';
    expect(isFreshnessCheckEnabled()).toBe(false);
    delete process.env['HARNESS_NO_UPDATE_CHECK'];
    expect(isFreshnessCheckEnabled(0)).toBe(false);
    expect(isFreshnessCheckEnabled(86_400_000)).toBe(true);
  });

  it('shouldRunFreshnessCheck gates by interval', () => {
    expect(shouldRunFreshnessCheck(null, 1000)).toBe(true);
    expect(shouldRunFreshnessCheck({ lastCheckTime: Date.now(), providers: [] }, 1_000_000)).toBe(
      false
    );
    expect(shouldRunFreshnessCheck({ lastCheckTime: 0, providers: [] }, 1000)).toBe(true);
  });
});

describe('evaluateEntry (comparison + defensive skip)', () => {
  const gh: SkillSource = { kind: 'github', owner: 'o', repo: 'r', ref: 'HEAD', commit: 'aaa' };
  const npm: SkillSource = { kind: 'npm', package: 'p' };

  it('github outdated when upstream SHA differs from recorded commit', () => {
    expect(evaluateEntry('s', gh, '1.0.0', 'bbb')?.outdated).toBe(true);
    expect(evaluateEntry('s', gh, '1.0.0', 'aaa')?.outdated).toBe(false);
  });

  it('npm outdated when upstream version differs from entry version', () => {
    expect(evaluateEntry('s', npm, '1.0.0', '1.1.0')?.outdated).toBe(true);
    expect(evaluateEntry('s', npm, '1.0.0', '1.0.0')?.outdated).toBe(false);
  });

  it('records current/latest/kind correctly per source', () => {
    expect(evaluateEntry('s', gh, '9.9.9', 'bbb')).toEqual({
      name: 's',
      kind: 'github',
      current: 'aaa',
      latest: 'bbb',
      outdated: true,
    });
    expect(evaluateEntry('s', npm, '1.0.0', '1.1.0')).toEqual({
      name: 's',
      kind: 'npm',
      current: '1.0.0',
      latest: '1.1.0',
      outdated: true,
    });
  });

  it('is fail-safe when latest is null (failed probe -> not outdated)', () => {
    expect(evaluateEntry('s', gh, '1.0.0', null)?.outdated).toBe(false);
    expect(evaluateEntry('s', npm, '1.0.0', null)?.outdated).toBe(false);
  });

  it('skips (returns null) for no source, local, or unknown kind', () => {
    expect(evaluateEntry('s', undefined, '1.0.0', 'x')).toBeNull();
    expect(evaluateEntry('s', { kind: 'local', path: '/p' }, '1.0.0', 'x')).toBeNull();
    // legacy / unrecognized kind at runtime must not crash
    expect(evaluateEntry('s', { kind: 'svn' } as unknown as SkillSource, '1.0.0', 'x')).toBeNull();
  });
});

describe('getFreshnessNotification', () => {
  const originalEnv = process.env;
  let tmpHome: string;
  beforeEach(() => {
    process.env = { ...originalEnv };
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-fresh-note-'));
    process.env['HOME'] = tmpHome;
  });
  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  function write(providers: FreshnessProvider[]): void {
    const p = path.join(tmpHome, '.harness', 'skill-freshness.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ lastCheckTime: Date.now(), providers }));
  }

  it('returns null when there is no state', () => {
    expect(getFreshnessNotification()).toBeNull();
  });

  it('returns null when zero providers are outdated', () => {
    write([{ name: 'a', kind: 'npm', current: '1', latest: '1', outdated: false }]);
    expect(getFreshnessNotification()).toBeNull();
  });

  it('pluralizes correctly', () => {
    write([{ name: 'a', kind: 'npm', current: '1', latest: '2', outdated: true }]);
    expect(getFreshnessNotification()).toBe(
      '1 skill provider has updates — run `harness skill update`'
    );
    write([
      { name: 'a', kind: 'npm', current: '1', latest: '2', outdated: true },
      { name: 'b', kind: 'github', current: 'x', latest: 'y', outdated: true },
    ]);
    expect(getFreshnessNotification()).toBe(
      '2 skill providers have updates — run `harness skill update`'
    );
  });
});

describe('spawnBackgroundFreshnessCheck', () => {
  beforeEach(() => {
    mockSpawn.mockClear();
    mockUnref.mockClear();
    mockSpawn.mockReturnValue({ unref: mockUnref, pid: 4321 });
  });

  it('spawns a detached, unref-ed process with stdio ignored', () => {
    spawnBackgroundFreshnessCheck(['/some/skills-lock.json']);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = mockSpawn.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(cmd).toBe(process.execPath);
    expect(args[0]).toBe('-e');
    expect(typeof args[1]).toBe('string');
    expect(args[1]).toContain('/some/skills-lock.json'); // lockfile paths embedded
    expect(opts).toMatchObject({ detached: true, stdio: 'ignore' });
    expect(mockUnref).toHaveBeenCalledTimes(1);
  });

  it('swallows spawn() throwing', () => {
    mockSpawn.mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    expect(() => spawnBackgroundFreshnessCheck(['/x'])).not.toThrow();
  });
});

describe('buildProbeScript (shipped probe body)', () => {
  it('embeds the exact execFileSync argv shapes for git and npm', () => {
    const script = buildProbeScript(
      ['/lock/skills-lock.json'],
      '/state/skill-freshness.json',
      '/state'
    );
    // FIX #2: assert the shipped argv shapes (no shell) rather than just "a path".
    expect(script).toContain("execFileSync('git', ['ls-remote', url, ref]");
    expect(script).toContain("['view', source.package, 'version']");
    expect(script).toContain("execFileSync('npm', args,");
  });

  it('embeds the leading-dash argument-injection guard for every consumed value', () => {
    const script = buildProbeScript(
      ['/lock/skills-lock.json'],
      '/state/skill-freshness.json',
      '/state'
    );
    // FIX #1: dash helper + guards on owner/repo/ref (git) and package/registry (npm).
    expect(script).toContain("const dash = (v) => typeof v === 'string' && v.charAt(0) === '-'");
    expect(script).toContain(
      'if (dash(source.owner) || dash(source.repo) || dash(source.ref)) continue;'
    );
    expect(script).toContain('if (dash(source.package) || dash(source.registry)) continue;');
  });

  it('embeds the provider cap and wall-clock budget bounds', () => {
    const script = buildProbeScript(
      ['/lock/skills-lock.json'],
      '/state/skill-freshness.json',
      '/state'
    );
    // FIX #4: bounded work so a giant lockfile cannot spawn an unbounded probe storm.
    expect(script).toContain(`const MAX_PROVIDERS = ${MAX_PROVIDERS};`);
    expect(script).toContain('const PROBE_BUDGET_MS = 120000;');
    expect(script).toContain(
      'if (probed >= MAX_PROVIDERS || Date.now() - startedAt > PROBE_BUDGET_MS) break outer;'
    );
  });

  it('embeds the provided lockfile, state, and state-dir paths', () => {
    const script = buildProbeScript(['/lock/a.json', '/lock/b.json'], '/state/f.json', '/state');
    expect(script).toContain('/lock/a.json');
    expect(script).toContain('/lock/b.json');
    expect(script).toContain('/state/f.json');
  });
});

// FIX #2: execute the SHIPPED probe body end-to-end against stub git/npm
// executables. This is the real coverage for the inlined child logic — the
// mocked-spawn tests above never run it. Skipped on Windows (POSIX sh stubs).
const e2e = process.platform === 'win32' ? describe.skip : describe;
e2e('buildProbeScript end-to-end (stub git/npm)', () => {
  let workDir: string;
  let binDir: string;
  let logPath: string;
  let statePath: string;
  let stateDir: string;
  let lockPath: string;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-fresh-e2e-'));
    binDir = path.join(workDir, 'bin');
    stateDir = path.join(workDir, 'state');
    fs.mkdirSync(binDir, { recursive: true });
    logPath = path.join(workDir, 'calls.log');
    statePath = path.join(stateDir, 'skill-freshness.json');
    lockPath = path.join(workDir, 'skills-lock.json');

    // Fake git: log argv, and for ls-remote print a SHA that differs from any
    // recorded commit so the entry is classified outdated.
    fs.writeFileSync(
      path.join(binDir, 'git'),
      '#!/bin/sh\necho "$@" >> "$FRESH_LOG"\nif [ "$1" = "ls-remote" ]; then\n  printf "feedface0000000000000000000000000000cafe\\trefs/heads/main\\n"\nfi\n',
      { mode: 0o755 }
    );
    // Fake npm: log argv, and for `view <pkg> version` print a differing version.
    fs.writeFileSync(
      path.join(binDir, 'npm'),
      '#!/bin/sh\necho "$@" >> "$FRESH_LOG"\nif [ "$1" = "view" ]; then\n  printf "2.0.0\\n"\nfi\n',
      { mode: 0o755 }
    );
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  function runProbe(): FreshnessState {
    const script = buildProbeScript([lockPath], statePath, stateDir);
    execFileSync(process.execPath, ['-e', script], {
      env: {
        ...process.env,
        PATH: binDir + path.delimiter + (process.env['PATH'] ?? ''),
        FRESH_LOG: logPath,
      },
      stdio: 'ignore',
      timeout: 30_000,
    });
    return JSON.parse(fs.readFileSync(statePath, 'utf-8')) as FreshnessState;
  }

  it('probes github/npm, skips local/unknown/no-source, and honors the dash guard', () => {
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        version: 2,
        skills: {
          'gh-outdated': {
            version: '0.0.0',
            source: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'aaa' },
          },
          'npm-outdated': { version: '1.0.0', source: { kind: 'npm', package: 'pkg' } },
          'local-skip': { version: '1.0.0', source: { kind: 'local', path: '/x' } },
          'no-source': { version: '1.0.0' },
          'unknown-kind': { version: '1.0.0', source: { kind: 'svn' } },
          // FIX #1: leading-dash values must be skipped WITHOUT invoking the tool.
          'dash-ref': {
            version: '0.0.0',
            source: { kind: 'github', owner: 'o', repo: 'r', ref: '-oops', commit: 'aaa' },
          },
          'dash-pkg': { version: '1.0.0', source: { kind: 'npm', package: '-evil' } },
        },
      })
    );

    const state = runProbe();
    const byName = Object.fromEntries(state.providers.map((p) => [p.name, p]));

    // Only the two well-formed remote entries are recorded.
    expect(state.providers.map((p) => p.name).sort()).toEqual(['gh-outdated', 'npm-outdated']);

    // github: ls-remote SHA differs from source.commit -> outdated.
    expect(byName['gh-outdated']).toEqual({
      name: 'gh-outdated',
      kind: 'github',
      current: 'aaa',
      latest: 'feedface0000000000000000000000000000cafe',
      outdated: true,
    });
    // npm: `npm view` version differs from entry.version -> outdated.
    expect(byName['npm-outdated']).toEqual({
      name: 'npm-outdated',
      kind: 'npm',
      current: '1.0.0',
      latest: '2.0.0',
      outdated: true,
    });

    // The dash entries never reached the tool (guard fired before execFileSync).
    const callLog = fs.readFileSync(logPath, 'utf-8');
    expect(callLog).toContain('ls-remote');
    expect(callLog).toContain('view');
    expect(callLog).not.toContain('-oops');
    expect(callLog).not.toContain('-evil');
  });

  it('records a github entry as up-to-date when the SHA matches the recorded commit', () => {
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        version: 2,
        skills: {
          'gh-current': {
            version: '0.0.0',
            source: {
              kind: 'github',
              owner: 'o',
              repo: 'r',
              ref: 'main',
              commit: 'feedface0000000000000000000000000000cafe',
            },
          },
        },
      })
    );
    const state = runProbe();
    expect(state.providers).toEqual([
      {
        name: 'gh-current',
        kind: 'github',
        current: 'feedface0000000000000000000000000000cafe',
        latest: 'feedface0000000000000000000000000000cafe',
        outdated: false,
      },
    ]);
  });
});
