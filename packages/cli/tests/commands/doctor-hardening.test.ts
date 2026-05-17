import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Important: the doctor module mocks fs in its sibling test. We import
// directly from the source so that mock does not bleed across files.
import {
  checkLivePings,
  checkHookValidity,
  checkBaselineFreshness,
  checkSessionCorruption,
} from '../../src/commands/doctor';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-doctor-h-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('checkLivePings', () => {
  it('reports info when no integration credentials are set', () => {
    const results = checkLivePings({});
    expect(results.every((r) => r.status === 'info')).toBe(true);
  });

  it('passes when a well-shaped Anthropic key is present', () => {
    const env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: 'sk-ant-' + 'a'.repeat(40) };
    const r = checkLivePings(env).find((c) => c.name === 'live-pings-anthropic_api_key');
    expect(r?.status).toBe('pass');
  });

  it('warns when an Anthropic key has the wrong prefix', () => {
    const env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: 'pk-wrong-prefix-but-long-enough-padding' };
    const r = checkLivePings(env).find((c) => c.name === 'live-pings-anthropic_api_key');
    expect(r?.status).toBe('warn');
  });

  it('warns when a credential is too short', () => {
    const env: NodeJS.ProcessEnv = { GITHUB_TOKEN: 'short' };
    const r = checkLivePings(env).find((c) => c.name === 'live-pings-github_token');
    expect(r?.status).toBe('warn');
  });
});

describe('checkHookValidity', () => {
  it('reports info when no hooks directory exists', () => {
    const r = checkHookValidity(tmpDir);
    expect(r).toHaveLength(1);
    expect(r[0]!.status).toBe('info');
  });

  it('passes a valid JSON hook', () => {
    const hooksDir = path.join(tmpDir, '.harness', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, 'lint.json'), JSON.stringify({ command: 'eslint' }));
    const results = checkHookValidity(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe('pass');
  });

  it('fails an invalid JSON hook', () => {
    const hooksDir = path.join(tmpDir, '.harness', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, 'lint.json'), '{not json');
    const results = checkHookValidity(tmpDir);
    expect(results[0]!.status).toBe('fail');
  });

  it('warns a shell hook without a shebang', () => {
    const hooksDir = path.join(tmpDir, '.harness', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, 'pre-commit.sh'), 'echo hi');
    const results = checkHookValidity(tmpDir);
    expect(results[0]!.status).toBe('warn');
  });

  it('passes a shell hook with a shebang', () => {
    const hooksDir = path.join(tmpDir, '.harness', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, 'pre-commit.sh'), '#!/usr/bin/env bash\necho hi');
    const results = checkHookValidity(tmpDir);
    expect(results[0]!.status).toBe('pass');
  });

  it('fails an empty hook file', () => {
    const hooksDir = path.join(tmpDir, '.harness', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, 'empty.sh'), '');
    const results = checkHookValidity(tmpDir);
    expect(results[0]!.status).toBe('fail');
  });
});

describe('checkBaselineFreshness', () => {
  it('reports info for absent baseline files', () => {
    const results = checkBaselineFreshness(tmpDir);
    expect(results.every((r) => r.status === 'info')).toBe(true);
  });

  it('passes a freshly-written baseline', () => {
    const archDir = path.join(tmpDir, '.harness', 'arch');
    fs.mkdirSync(archDir, { recursive: true });
    fs.writeFileSync(path.join(archDir, 'baselines.json'), '{}');
    const r = checkBaselineFreshness(tmpDir).find((c) => c.name.endsWith('arch/baselines.json'));
    expect(r?.status).toBe('pass');
  });

  it('warns on a 45-day-old baseline', () => {
    const archDir = path.join(tmpDir, '.harness', 'arch');
    fs.mkdirSync(archDir, { recursive: true });
    const filePath = path.join(archDir, 'baselines.json');
    fs.writeFileSync(filePath, '{}');
    const now = Date.now();
    const forty5DaysAgo = now - 45 * 24 * 60 * 60 * 1000;
    fs.utimesSync(filePath, new Date(forty5DaysAgo), new Date(forty5DaysAgo));
    const r = checkBaselineFreshness(tmpDir, now).find((c) =>
      c.name.endsWith('arch/baselines.json')
    );
    expect(r?.status).toBe('warn');
  });

  it('fails a 120-day-old baseline', () => {
    const archDir = path.join(tmpDir, '.harness', 'arch');
    fs.mkdirSync(archDir, { recursive: true });
    const filePath = path.join(archDir, 'baselines.json');
    fs.writeFileSync(filePath, '{}');
    const now = Date.now();
    const oneTwentyDaysAgo = now - 120 * 24 * 60 * 60 * 1000;
    fs.utimesSync(filePath, new Date(oneTwentyDaysAgo), new Date(oneTwentyDaysAgo));
    const r = checkBaselineFreshness(tmpDir, now).find((c) =>
      c.name.endsWith('arch/baselines.json')
    );
    expect(r?.status).toBe('fail');
  });
});

describe('checkSessionCorruption', () => {
  it('reports info when no session archives exist', () => {
    const r = checkSessionCorruption(tmpDir);
    expect(r).toHaveLength(1);
    expect(r[0]!.status).toBe('info');
  });

  it('passes when all sampled summaries parse', () => {
    const sessionsDir = path.join(tmpDir, '.harness', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    const sub = path.join(sessionsDir, 'session-001');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'session-summary.json'), JSON.stringify({ ok: true }));
    const r = checkSessionCorruption(tmpDir);
    expect(r[0]!.status).toBe('pass');
  });

  it('warns when some summaries are malformed', () => {
    const sessionsDir = path.join(tmpDir, '.harness', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    const good = path.join(sessionsDir, 'session-001');
    const bad = path.join(sessionsDir, 'session-002');
    fs.mkdirSync(good, { recursive: true });
    fs.mkdirSync(bad, { recursive: true });
    fs.writeFileSync(path.join(good, 'session-summary.json'), '{}');
    fs.writeFileSync(path.join(bad, 'session-summary.json'), '{not json');
    const r = checkSessionCorruption(tmpDir);
    expect(r[0]!.status).toBe('warn');
    expect(r[0]!.message).toContain('session-002');
  });

  it('fails when every sampled summary is malformed', () => {
    const sessionsDir = path.join(tmpDir, '.harness', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    const sub = path.join(sessionsDir, 'session-001');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'session-summary.json'), '{not json');
    const r = checkSessionCorruption(tmpDir);
    expect(r[0]!.status).toBe('fail');
  });
});
