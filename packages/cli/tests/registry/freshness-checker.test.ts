import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  readFreshnessState,
  writeFreshnessState,
  isFreshnessCheckEnabled,
  shouldRunFreshnessCheck,
  evaluateEntry,
  getFreshnessNotification,
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
    expect(shouldRunFreshnessCheck({ lastCheckTime: Date.now(), providers: [] }, 1_000_000)).toBe(false);
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
      name: 's', kind: 'github', current: 'aaa', latest: 'bbb', outdated: true,
    });
    expect(evaluateEntry('s', npm, '1.0.0', '1.1.0')).toEqual({
      name: 's', kind: 'npm', current: '1.0.0', latest: '1.1.0', outdated: true,
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
    expect(getFreshnessNotification()).toBe('1 skill provider has updates — run `harness skill update`');
    write([
      { name: 'a', kind: 'npm', current: '1', latest: '2', outdated: true },
      { name: 'b', kind: 'github', current: 'x', latest: 'y', outdated: true },
    ]);
    expect(getFreshnessNotification()).toBe('2 skill providers have updates — run `harness skill update`');
  });
});
