import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  resolveAutonomyForSession,
  writeSessionOverride,
  writeLoweringOverride,
  sessionOverridePath,
} from '../../src/autonomy/index';

let tmp: string;
let home: string;
let project: string;
let other: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-session-'));
  home = path.join(tmp, 'home');
  project = path.join(tmp, 'project');
  other = path.join(tmp, 'other');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(other, { recursive: true });
  // Raises are bound to a live session dir (D14).
  fs.mkdirSync(path.join(project, '.harness', 'sessions', 's1'), { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const resolve = (session: string | undefined, projectPath = project) =>
  resolveAutonomyForSession({
    projectPath,
    ...(session !== undefined && { session }),
    env: {},
    homeDir: home,
  });

describe('resolveAutonomyForSession (SC7 resolver level)', () => {
  it('an override written for a session is returned by the next resolve', () => {
    expect([resolve('s1').level, resolve('s1').source.level]).toEqual(['supervised', 'default']);
    expect(
      writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', { homeDir: home }).ok
    ).toBe(true);
    const after = resolve('s1');
    expect([after.level, after.source.level, after.audit]).toEqual(['trusted', 'session', true]);
    expect(
      writeLoweringOverride(project, 's1', { level: 'supervised' }, { homeDir: home }).ok
    ).toBe(true);
    expect([resolve('s1').level, resolve('s1').source.level]).toEqual(['supervised', 'session']);
  });
  it('does not leak to another session, to no session, or to another repo', () => {
    expect(
      writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', { homeDir: home }).ok
    ).toBe(true);
    // Positive control: the session it was written for does see it.
    expect(resolve('s1').source.level).toBe('session');
    expect(resolve('s2').source.level).toBe('default');
    expect(resolve(undefined).source.level).toBe('default');
    expect(resolve('s1', other).source.level).toBe('default');
  });
  it('reads the user config from the injected home', () => {
    fs.mkdirSync(path.join(home, '.harness'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.harness', 'config.json'),
      JSON.stringify({ autonomy: { level: 'trusted' } })
    );
    expect(resolve(undefined).source.level).toBe('user-config');
  });
  it('surfaces an invalid slug as a warning instead of throwing', () => {
    const r = resolve('../x');
    expect(r.source.level).toBe('default');
    expect(r.warnings.some((w) => /slug/i.test(w))).toBe(true);
  });
});

describe('corrupt fields fail closed at resolution (I4)', () => {
  const writeUserConfig = (cfg: unknown) => {
    fs.mkdirSync(path.join(home, '.harness'), { recursive: true });
    fs.writeFileSync(path.join(home, '.harness', 'config.json'), JSON.stringify(cfg));
  };
  const writeRawOverride = (doc: unknown) => {
    const p = sessionOverridePath(project, 's1', { homeDir: home });
    if (!p.ok) throw p.error;
    fs.mkdirSync(path.dirname(p.value), { recursive: true });
    fs.writeFileSync(p.value, typeof doc === 'string' ? doc : JSON.stringify(doc));
  };
  const TRUSTED_NO_AUDIT = {
    autonomy: { level: 'trusted', audit: { trusted: false, supervised: false } },
  };

  it('corrupt level + user config trusted → supervised (source session), never trusted', () => {
    writeUserConfig(TRUSTED_NO_AUDIT);
    // Positive control: with no override the same user config resolves trusted.
    expect(resolve(undefined).level).toBe('trusted');
    writeRawOverride({ level: { value: 'TRUSTED', setAt: 'x', origin: 'cli' } });
    const r = resolve('s1');
    expect([r.level, r.source.level]).toEqual(['supervised', 'session']);
    expect(r.warnings.some((w) => /level/.test(w))).toBe(true);
  });

  it('corrupt audit + user config audit off → audit ON (source session)', () => {
    writeUserConfig(TRUSTED_NO_AUDIT);
    writeRawOverride({
      level: { value: 'supervised', setAt: '2026-01-01T00:00:00.000Z', origin: 'cli' },
      audit: { value: 'false', setAt: '2026-01-02T00:00:00.000Z', origin: 'mcp' },
    });
    const r = resolve('s1');
    expect([r.level, r.source.level, r.audit, r.source.audit]).toEqual([
      'supervised',
      'session',
      true,
      'session',
    ]);
    expect(r.warnings.some((w) => /audit/.test(w))).toBe(true);
  });

  it('a wholly corrupt override + trusted user config → supervised with audit on', () => {
    writeUserConfig(TRUSTED_NO_AUDIT);
    writeRawOverride('{not json');
    const r = resolve('s1');
    expect([r.level, r.audit]).toEqual(['supervised', true]);
  });

  it('a fail-closed level beats a later invocation flag', () => {
    writeRawOverride({ level: 'trusted' });
    const r = resolveAutonomyForSession({
      projectPath: project,
      session: 's1',
      env: {},
      homeDir: home,
      flag: { level: 'trusted', at: '2999-01-01T00:00:00.000Z' },
    });
    expect([r.level, r.source.level]).toEqual(['supervised', 'session']);
  });
});

describe('resolveAutonomyForSession never throws (S1)', () => {
  it.each([[42], [{}], [['s1']], [null]])('a non-string session %j → warning, not a throw', (s) => {
    const r = resolveAutonomyForSession({
      projectPath: project,
      session: s as unknown as string,
      env: {},
      homeDir: home,
    });
    expect(r.level).toBe('supervised');
    expect(r.warnings.some((w) => /session/i.test(w))).toBe(true);
  });

  it('an internal throw resolves to the supervised default (fail closed), even over a trusted flag', () => {
    const r = resolveAutonomyForSession({
      projectPath: project,
      session: 's1',
      env: {},
      homeDir: home,
      flag: { level: 'trusted' },
      readFile: () => {
        throw new Error('disk on fire');
      },
    });
    expect([r.level, r.audit, r.source.level]).toEqual(['supervised', false, 'default']);
    expect(r.warnings.join('\n')).toMatch(/disk on fire/);
  });
});

/**
 * N2(b): the raise→session-dir binding (D14) is checked at READ time too. Worktrees share one
 * override key (D15), so without this a raise made in worktree A would be honoured in a sibling
 * worktree B that has no such live session. Lowerings are never gated.
 */
describe('a raised field is honoured only where its session dir exists at read time (N2b)', () => {
  let wtA: string;
  let wtB: string;
  let common: string;
  let opts: { homeDir: string; gitCommonDir: () => string };
  beforeEach(() => {
    wtA = path.join(tmp, 'wt-a');
    wtB = path.join(tmp, 'wt-b');
    common = path.join(tmp, 'repo.git');
    for (const d of [wtA, wtB, common]) fs.mkdirSync(d, { recursive: true });
    fs.mkdirSync(path.join(wtA, '.harness', 'sessions', 's'), { recursive: true });
    // Two worktrees of one repo: distinct directories, one shared git common dir.
    opts = { homeDir: home, gitCommonDir: () => common };
  });
  const read = (wt: string) =>
    resolveAutonomyForSession({ projectPath: wt, session: 's', env: {}, ...opts });

  it('worktree B without .harness/sessions/s/ does not honour a raise made in A', () => {
    expect(writeSessionOverride(wtA, 's', { level: 'trusted' }, 'cli', opts).ok).toBe(true);
    // Positive control: A, which has the session dir, honours it.
    expect([read(wtA).level, read(wtA).source.level]).toEqual(['trusted', 'session']);
    const b = read(wtB);
    expect([b.level, b.source.level]).toEqual(['supervised', 'default']);
    expect(b.warnings.some((w) => /session dir|does not exist/i.test(w))).toBe(true);
  });

  it('a raised audit=off is likewise not honoured in B', () => {
    expect(writeSessionOverride(wtA, 's', { level: 'trusted', audit: false }, 'cli', opts).ok).toBe(
      true
    );
    expect([read(wtA).audit, read(wtA).source.audit]).toEqual([false, 'session']);
    // B falls back to the supervised default; the session's audit=off is not what it reads.
    const b = read(wtB);
    expect(b.source.audit).toBe('default');
    expect(b.warnings.some((w) => /audit=false/.test(w))).toBe(true);
  });

  it('worktree B WITH .harness/sessions/s/ honours it', () => {
    expect(writeSessionOverride(wtA, 's', { level: 'trusted' }, 'cli', opts).ok).toBe(true);
    fs.mkdirSync(path.join(wtB, '.harness', 'sessions', 's'), { recursive: true });
    expect([read(wtB).level, read(wtB).source.level]).toEqual(['trusted', 'session']);
  });

  it('a raise whose session dir was removed after writing is no longer honoured in A', () => {
    expect(writeSessionOverride(wtA, 's', { level: 'trusted' }, 'cli', opts).ok).toBe(true);
    fs.rmSync(path.join(wtA, '.harness', 'sessions', 's'), { recursive: true });
    expect(read(wtA).source.level).toBe('default');
  });

  it('lowerings are unaffected: B without the session dir still honours a lowering', () => {
    expect(writeLoweringOverride(wtA, 's', { level: 'supervised' }, opts).ok).toBe(true);
    expect([read(wtB).level, read(wtB).source.level]).toEqual(['supervised', 'session']);
  });
});
