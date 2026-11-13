import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { computeRepoKey, sessionOverridePath } from '@harness-engineering/core';
import { runAutonomySet } from '../../src/commands/autonomy/set';
import { runAutonomyShow } from '../../src/commands/autonomy/show';
import { handleManageState } from '../../src/mcp/tools/state';
import { handleGatherContext } from '../../src/mcp/tools/gather-context';

/**
 * FIX 2 (D12): repoKey = sha256 of the repo ROOT, so every caller resolves the same override
 * regardless of which subdirectory it runs from. Uses real git; worktrees share one key (D15).
 */
let tmp: string;
let home: string;
let proj: string;
let sub: string;
const git = (cwd: string, ...args: string[]) =>
  execFileSync(
    'git',
    [
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@example.com',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'init.defaultBranch=main',
      '-c',
      'core.hooksPath=/dev/null',
      ...args,
    ],
    { cwd, stdio: ['ignore', 'pipe', 'pipe'] }
  );

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-autonomy-root-')));
  home = path.join(tmp, 'home');
  proj = path.join(tmp, 'proj');
  sub = path.join(proj, 'sub');
  fs.mkdirSync(sub, { recursive: true });
  git(proj, 'init', '-q');
  git(proj, 'commit', '-q', '--allow-empty', '-m', 'init');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const show = (cwd: string) =>
  runAutonomyShow({ session: 's1' }, { cwd: () => cwd, homeDir: home, env: {} });

describe('autonomy override is keyed on the project root', () => {
  it('set from proj/sub, show from proj → same key, override applies', async () => {
    expect(computeRepoKey(sub)).toBe(computeRepoKey(proj));
    const out = await runAutonomySet(
      'supervised',
      { session: 's1', audit: 'on' },
      { cwd: () => sub, homeDir: home, env: {}, isInteractive: () => false }
    );
    expect(out.status).toBe('written');
    const p = sessionOverridePath(proj, 's1', { homeDir: home });
    expect(p.ok && fs.existsSync(p.value)).toBe(true);
    const r = show(proj);
    expect([r.level, r.source.level, r.audit, r.source.audit]).toEqual([
      'supervised',
      'session',
      true,
      'session',
    ]);
  });

  it('manage_state set-autonomy from proj/sub is seen by show from proj', async () => {
    const res = await handleManageState(
      { path: sub, action: 'set-autonomy', session: 's1', audit: true } as Parameters<
        typeof handleManageState
      >[0],
      { homeDir: home }
    );
    expect(res.isError).toBeFalsy();
    expect([show(proj).audit, show(proj).source.audit]).toEqual([true, 'session']);
  });

  it('gather_context from proj/sub sees an override set from proj', async () => {
    const seeded = await runAutonomySet(
      'supervised',
      { session: 's1', audit: 'on' },
      { cwd: () => proj, homeDir: home, env: {}, isInteractive: () => false }
    );
    expect(seeded.status).toBe('written');
    const res = await handleGatherContext(
      { path: sub, intent: 'root key', include: ['autonomy'], session: 's1' } as Parameters<
        typeof handleGatherContext
      >[0],
      { homeDir: home, env: {} }
    );
    const out = JSON.parse(res.content[0]!.text);
    expect(out.autonomy).toMatchObject({
      level: 'supervised',
      audit: true,
      source: { level: 'session', audit: 'session' },
    });
  });

  it('D15: worktrees share the key, so a lowering in proj reaches the worktree', async () => {
    const wt = path.join(tmp, 'wt');
    git(proj, 'worktree', 'add', '-q', wt);
    expect(computeRepoKey(wt)).toBe(computeRepoKey(proj));
    // Positive control: before any override the worktree resolves to the default.
    expect(show(wt).source.level).toBe('default');
    const seeded = await runAutonomySet(
      'supervised',
      { session: 's1', audit: 'on' },
      { cwd: () => sub, homeDir: home, env: {}, isInteractive: () => false }
    );
    expect(seeded.status).toBe('written');
    expect(show(proj).source.level).toBe('session');
    expect([show(wt).level, show(wt).source.level, show(wt).audit]).toEqual([
      'supervised',
      'session',
      true,
    ]);
  });
});
