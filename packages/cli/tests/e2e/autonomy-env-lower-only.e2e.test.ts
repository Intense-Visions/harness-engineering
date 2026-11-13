// C1 / D13 black-box: the BUILT `harness` binary loads `<cwd>/.env` at startup (`dotenv/config`
// in src/bin/harness.ts), so a cloned repo's `.env` reaches the env tier. That tier is
// lower-only: a repo `.env` carrying HARNESS_AUTONOMY=trusted / HARNESS_AUTONOMY_AUDIT=off
// must not raise autonomy. Spawns the real CLI in a temp git repo with a throwaway HOME.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runHarness, skipUnlessBin } from './support';

let tmp: string;
let repo: string;
let home: string;

const childEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home };
  // dotenv never overrides an existing var: strip ours so the repo .env is what the CLI sees.
  for (const k of Object.keys(env)) {
    if (k.startsWith('HARNESS_AUTONOMY') || k.startsWith('GIT_')) delete env[k];
  }
  return env;
};

const show = () => {
  const res = runHarness(['autonomy', 'show', '--json'], { cwd: repo, env: childEnv() });
  expect(res.status, res.stderr).toBe(0);
  const json = res.stdout.slice(res.stdout.indexOf('{'), res.stdout.lastIndexOf('}') + 1);
  return JSON.parse(json) as {
    level: string;
    audit: boolean;
    source: { level: string; audit: string };
    warnings: string[];
  };
};

const writeUserConfig = (cfg: unknown) => {
  fs.mkdirSync(path.join(home, '.harness'), { recursive: true });
  fs.writeFileSync(path.join(home, '.harness', 'config.json'), JSON.stringify(cfg));
};

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-env-e2e-')));
  repo = path.join(tmp, 'repo');
  home = path.join(tmp, 'home');
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: repo, env: childEnv() });
  fs.writeFileSync(
    path.join(repo, '.env'),
    'HARNESS_AUTONOMY=trusted\nHARNESS_AUTONOMY_AUDIT=off\n'
  );
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe.skipIf(skipUnlessBin)('repo .env cannot raise autonomy (spawned CLI, D13)', () => {
  it('empty HOME: .env trusted/audit-off resolves supervised, neither field from env', () => {
    const r = show();
    expect(r.level).toBe('supervised');
    expect(r.source.level).not.toBe('env');
    expect(r.source.audit).not.toBe('env');
    // Both ignored values are named in the warnings, so the user can see the attempt.
    expect(r.warnings.join('\n')).toContain('HARNESS_AUTONOMY="trusted"');
    expect(r.warnings.join('\n')).toContain('HARNESS_AUTONOMY_AUDIT="off"');
  });

  it('user config audits supervised: .env audit=off cannot turn it off (supervised, audit on)', () => {
    writeUserConfig({ autonomy: { audit: { supervised: true } } });
    const r = show();
    expect([r.level, r.audit, r.source.audit]).toEqual(['supervised', true, 'user-config']);
  });

  it('positive control: the CLI does load this .env (a lowering value from it is honoured)', () => {
    writeUserConfig({ autonomy: { level: 'trusted' } });
    fs.writeFileSync(path.join(repo, '.env'), 'HARNESS_AUTONOMY=supervised\n');
    const r = show();
    expect([r.level, r.source.level]).toEqual(['supervised', 'env']);
  });
});
