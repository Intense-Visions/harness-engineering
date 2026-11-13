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
