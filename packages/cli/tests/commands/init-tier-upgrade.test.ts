import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import { runInit, createInitCommand } from '../../src/commands/init';
import { runMinimalInit } from '../../src/commands/init-minimal';

/**
 * #2630 item 7: the minimal tier documents an additive upgrade path ("re-running
 * init at a higher tier layers on top"), so `harness init --tier intermediate`
 * on a minimal project must layer on top instead of refusing — and must never
 * clobber what the adopter already has.
 */

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-tier-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

function readConfig(dir: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(dir, 'harness.config.json'), 'utf-8'));
}

/** A minimal project whose adopter customised the config and edited AGENTS.md. */
async function customisedMinimalProject(dir: string): Promise<void> {
  const minimal = await runMinimalInit({ cwd: dir, name: 'demo' });
  expect(minimal.ok).toBe(true);
  const config = readConfig(dir);
  config.architecture.thresholds.complexity.max = 9;
  config.myTeamSetting = { owner: 'platform' };
  fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify(config, null, 2));
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Our hand-written guide\n');
}

async function runInitCmd(
  args: string[],
  cwd: string
): Promise<{ exitCode: number | null; err: string }> {
  const program = new Command();
  program.option('--quiet');
  program.addCommand(createInitCommand());
  let exitCode: number | null = null;
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
    exitCode = c ?? 0;
    throw new Error(`__exit__:${exitCode}`);
  }) as never);
  const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const err: string[] = [];
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    err.push(a.map(String).join(' '));
  });
  try {
    await program.parseAsync(['node', 'harness', '--quiet', 'init', ...args]);
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
  } finally {
    exitSpy.mockRestore();
    cwdSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
  return { exitCode, err: err.join('\n') };
}

describe('init tier upgrade (#2630)', () => {
  let dir: string;
  beforeEach(() => {
    dir = makeRepo();
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('minimal → intermediate layers on top, keeping adopter config values and edited files', async () => {
    await customisedMinimalProject(dir);

    const result = await runInit({
      cwd: dir,
      name: 'demo',
      level: 'intermediate',
      tier: 'intermediate',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const config = readConfig(dir);
    // The recorded tier moves up so a re-run at the same tier is refused.
    expect(config.template.level).toBe('intermediate');
    // Every value the adopter set survives.
    expect(config.architecture.thresholds.complexity.max).toBe(9);
    expect(config.myTeamSetting).toEqual({ owner: 'platform' });
    // The higher tier's keys are added.
    expect(Array.isArray(config.layers)).toBe(true);
    expect(config.architecture.thresholds['circular-deps']).toEqual({ max: 0 });
    expect(config.security?.enabled).toBe(true);
    // An adopter-edited file is never overwritten.
    expect(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8')).toBe(
      '# Our hand-written guide\n'
    );
    // Files that did not exist are written; the gitignore is (re)ensured.
    expect(result.value.filesCreated).not.toContain('harness.config.json');
    expect(result.value.filesCreated).not.toContain('AGENTS.md');
    expect(result.value.filesCreated.length).toBeGreaterThan(0);
    for (const f of result.value.filesCreated) {
      expect(fs.existsSync(path.join(dir, f))).toBe(true);
    }
    expect(fs.existsSync(path.join(dir, '.harness', '.gitignore'))).toBe(true);
    // The minimal arch baseline is kept (it existed), not replaced.
    expect(fs.existsSync(path.join(dir, '.harness', 'arch', 'baselines.json'))).toBe(true);
  });

  it('reports adopter files it kept as skippedExisting, but not the merged config', async () => {
    await customisedMinimalProject(dir);
    const result = await runInit({
      cwd: dir,
      name: 'demo',
      level: 'intermediate',
      tier: 'intermediate',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.upgradedFrom).toBe('minimal');
    // AGENTS.md was kept verbatim, so it is reported as a kept file.
    expect(result.value.skippedExisting).toContain('AGENTS.md');
    // The config was merged (not left untouched), so it is not reported as kept.
    expect(result.value.skippedExisting).not.toContain('harness.config.json');
    for (const f of result.value.skippedExisting ?? []) {
      expect(result.value.filesCreated).not.toContain(f);
      expect(fs.existsSync(path.join(dir, f))).toBe(true);
    }
  });

  it('a template entry point the upgrade could not write is not declared in the merged config', async () => {
    await customisedMinimalProject(dir);
    // Pre-existing src/index.ts is kept; eslint.config.mjs is written by the tier.
    const result = await runInit({
      cwd: dir,
      name: 'demo',
      level: 'intermediate',
      tier: 'intermediate',
    });
    expect(result.ok).toBe(true);
    const declared: string[] = readConfig(dir).entropy?.entryPoints ?? [];
    for (const e of declared) expect(fs.existsSync(path.join(dir, e))).toBe(true);
  });

  it('refuses the same tier with a clear message and leaves the project untouched', async () => {
    const first = await runInit({
      cwd: dir,
      name: 'demo',
      level: 'intermediate',
      tier: 'intermediate',
    });
    expect(first.ok).toBe(true);
    const before = fs.readFileSync(path.join(dir, 'harness.config.json'), 'utf-8');

    const again = await runInit({
      cwd: dir,
      name: 'demo',
      level: 'intermediate',
      tier: 'intermediate',
    });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.message).toContain('already initialized at tier "intermediate"');
    expect(fs.readFileSync(path.join(dir, 'harness.config.json'), 'utf-8')).toBe(before);
  });

  it('refuses a lower tier (intermediate → minimal) and never downgrades', async () => {
    const first = await runInit({
      cwd: dir,
      name: 'demo',
      level: 'intermediate',
      tier: 'intermediate',
    });
    expect(first.ok).toBe(true);
    const before = fs.readFileSync(path.join(dir, 'harness.config.json'), 'utf-8');

    const down = await runMinimalInit({ cwd: dir, name: 'demo' });
    expect(down.ok).toBe(false);
    if (down.ok) return;
    expect(down.error.message).toContain('already initialized at tier "intermediate"');
    expect(down.error.message).toContain('higher than the requested "minimal"');
    expect(fs.readFileSync(path.join(dir, 'harness.config.json'), 'utf-8')).toBe(before);
  });

  it('refuses minimal → minimal with the tier-aware message', async () => {
    await runMinimalInit({ cwd: dir, name: 'demo' });
    const again = await runMinimalInit({ cwd: dir, name: 'demo' });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.message).toContain('already initialized at tier "minimal"');
  });

  it('still refuses when no tier was requested (programmatic runInit, unchanged)', async () => {
    await runMinimalInit({ cwd: dir, name: 'demo' });
    const r = await runInit({ cwd: dir, name: 'demo', level: 'intermediate' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toContain('already initialized');
  });

  it('still refuses when the recorded tier is unknown (no template.level)', async () => {
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ version: 1, name: 'x' })
    );
    const r = await runInit({
      cwd: dir,
      name: 'demo',
      level: 'intermediate',
      tier: 'intermediate',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toContain('Use --force to overwrite');
  });

  it('--force semantics are unchanged: it overwrites rather than merging', async () => {
    await customisedMinimalProject(dir);
    const r = await runInit({
      cwd: dir,
      name: 'demo',
      level: 'intermediate',
      tier: 'intermediate',
      force: true,
    });
    expect(r.ok).toBe(true);
    const config = readConfig(dir);
    expect(config.myTeamSetting).toBeUndefined();
    expect(config.template.level).toBe('intermediate');
  });

  describe('CLI dispatch', () => {
    it('`init --tier intermediate` on a minimal project upgrades (exit 0)', async () => {
      await customisedMinimalProject(dir);
      const { exitCode } = await runInitCmd(['--tier', 'intermediate'], dir);
      expect(exitCode).toBe(0);
      expect(readConfig(dir).template.level).toBe('intermediate');
      expect(readConfig(dir).myTeamSetting).toEqual({ owner: 'platform' });
    });

    it('a bare `init` (implicit default level) on a minimal project still refuses', async () => {
      await runMinimalInit({ cwd: dir, name: 'demo' });
      const { exitCode, err } = await runInitCmd([], dir);
      expect(exitCode).toBe(2);
      expect(err).toContain('already initialized');
      expect(readConfig(dir).template.level).toBe('minimal');
    });

    it('`init --tier intermediate` on an intermediate project refuses (exit 2)', async () => {
      await runInitCmd(['--tier', 'intermediate'], dir);
      const { exitCode, err } = await runInitCmd(['--tier', 'intermediate'], dir);
      expect(exitCode).toBe(2);
      expect(err).toContain('already initialized at tier "intermediate"');
    });
  });
});
