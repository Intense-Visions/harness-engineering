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
    writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', { homeDir: home });
    const after = resolve('s1');
    expect([after.level, after.source.level, after.audit]).toEqual(['trusted', 'session', true]);
    writeLoweringOverride(project, 's1', { level: 'supervised' }, { homeDir: home });
    expect([resolve('s1').level, resolve('s1').source.level]).toEqual(['supervised', 'session']);
  });
  it('does not leak to another session, to no session, or to another repo', () => {
    writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', { homeDir: home });
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

describe('corrupt field cannot erase a lowering (D12, FIX 1c)', () => {
  it('user config trusted+audit off, override level=supervised + corrupt audit → supervised/session', () => {
    fs.mkdirSync(path.join(home, '.harness'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.harness', 'config.json'),
      JSON.stringify({
        autonomy: { level: 'trusted', audit: { trusted: false, supervised: false } },
      })
    );
    const p = sessionOverridePath(project, 's1', { homeDir: home });
    if (!p.ok) throw p.error;
    fs.mkdirSync(path.dirname(p.value), { recursive: true });
    fs.writeFileSync(
      p.value,
      JSON.stringify({
        level: { value: 'supervised', setAt: '2026-01-01T00:00:00.000Z', origin: 'cli' },
        audit: { value: 'false', setAt: '2026-01-02T00:00:00.000Z', origin: 'mcp' },
      })
    );
    const r = resolve('s1');
    expect([r.level, r.source.level]).toEqual(['supervised', 'session']);
    // The corrupt audit is ignored (falls through to user config for supervised) and reported.
    expect([r.audit, r.source.audit]).toEqual([false, 'user-config']);
    expect(r.warnings.some((w) => /audit/.test(w))).toBe(true);
    // Positive control: with no override the same user config resolves trusted.
    expect(resolve(undefined).level).toBe('trusted');
  });
});
