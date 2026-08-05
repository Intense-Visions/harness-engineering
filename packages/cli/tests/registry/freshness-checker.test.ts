import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  readFreshnessState,
  writeFreshnessState,
  isFreshnessCheckEnabled,
  shouldRunFreshnessCheck,
  type FreshnessState,
} from '../../src/registry/freshness-checker';

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
