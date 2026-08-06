import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { createCheckArchCommand, runCheckArch } from '../../src/commands/check-arch';
import * as path from 'path';

const validProjectPath = path.join(__dirname, '../fixtures/valid-project');

describe('check-arch command', () => {
  describe('createCheckArchCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createCheckArchCommand();
      expect(cmd.name()).toBe('check-arch');
    });

    it('has --update-baseline option', () => {
      const cmd = createCheckArchCommand();
      const opts = cmd.options.map((o) => o.long);
      expect(opts).toContain('--update-baseline');
    });

    it('has --module option', () => {
      const cmd = createCheckArchCommand();
      const opts = cmd.options.map((o) => o.long);
      expect(opts).toContain('--module');
    });
  });

  describe('runCheckArch', () => {
    it('returns success when architecture is not configured (defaults)', async () => {
      const result = await runCheckArch({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(true);
      }
    });

    it('returns config error for invalid config path', async () => {
      const result = await runCheckArch({
        configPath: '/nonexistent/harness.config.json',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.exitCode).toBe(2);
      }
    });

    it('emits warning in threshold-only mode when no baseline exists', async () => {
      const result = await runCheckArch({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        // No baseline in valid-project fixture, so threshold-only mode
        expect(result.value.mode).toBe('threshold-only');
        expect(result.value.warning).toContain('--update-baseline');
      }
    });

    it('returns passed=true when architecture defaults are used with no violations', async () => {
      const result = await runCheckArch({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(true);
        expect(result.value.thresholdViolations).toEqual([]);
      }
    });

    it('filters results by module when --module is specified', async () => {
      const result = await runCheckArch({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
        module: 'src/nonexistent',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Filtering to a non-existent module should yield zero violations
        expect(result.value.passed).toBe(true);
        expect(result.value.totalViolations).toBe(0);
      }
    });

    it('updates baseline when --update-baseline is set', async () => {
      const fs = await import('node:fs');
      const os = await import('node:os');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-arch-'));

      // Create a minimal harness.config.json in temp dir
      fs.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({ version: 1, architecture: { enabled: true } })
      );

      const result = await runCheckArch({
        cwd: tmpDir,
        configPath: path.join(tmpDir, 'harness.config.json'),
        updateBaseline: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baselineUpdated).toBe(true);
        expect(result.value.passed).toBe(true);
      }

      // Verify baseline file was created
      const baselinePath = path.join(tmpDir, '.harness', 'arch', 'baselines.json');
      expect(fs.existsSync(baselinePath)).toBe(true);

      // Clean up
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // Regression for issue #268: --update-baseline must merge into the
    // existing baseline so a collector that emits no results does not silently
    // drop a tracked category. We pre-seed `complexity` with a unique
    // violationId, then reuse the same `runCheckArch` call as a no-op refresh
    // (all collectors run, but the seeded violationId for complexity is
    // expected to remain visible because the merge keeps existing entries
    // when the refresh produces a smaller set). The manager-level tests in
    // packages/core/tests/architecture/baseline-manager.test.ts cover the
    // exact merge semantics; this is the smoke check that the CLI is wired
    // through `manager.update()` rather than `capture()`+`save()`.
    it('routes --update-baseline through manager.update (issue #268)', async () => {
      const fs = await import('node:fs');
      const os = await import('node:os');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-arch-issue-268-'));
      const baselinePath = path.join(tmpDir, '.harness', 'arch', 'baselines.json');

      fs.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({ version: 1, architecture: { enabled: true } })
      );

      fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
      fs.writeFileSync(
        baselinePath,
        JSON.stringify({
          version: 1,
          updatedAt: '2026-01-01T00:00:00.000Z',
          updatedFrom: 'seed',
          metrics: {
            // Seed every category so a regression that drops one would be
            // visible as a missing key after refresh.
            'circular-deps': { value: 0, violationIds: [] },
            'layer-violations': { value: 0, violationIds: [] },
            complexity: { value: 0, violationIds: [] },
            coupling: { value: 0, violationIds: [] },
            'forbidden-imports': { value: 0, violationIds: [] },
            'module-size': { value: 0, violationIds: [] },
            'dependency-depth': { value: 0, violationIds: [] },
          },
        })
      );

      const result = await runCheckArch({
        cwd: tmpDir,
        configPath: path.join(tmpDir, 'harness.config.json'),
        updateBaseline: true,
      });
      expect(result.ok).toBe(true);

      const written = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
      expect(Object.keys(written.metrics).sort()).toEqual([
        'circular-deps',
        'complexity',
        'coupling',
        'dependency-depth',
        'forbidden-imports',
        'layer-violations',
        'module-size',
      ]);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // Regression for issue #594: a module-scoped baseline refresh
    // (`--update-baseline --module X`) must NOT clobber the whole-repo
    // aggregate baseline. The baseline schema stores one aggregate value per
    // category, so writing a cli-only subset over it makes every later
    // whole-repo `ci check` report a permanent false regression. Combining the
    // two flags is rejected instead of silently corrupting the file.
    it('rejects --update-baseline combined with --module (issue #594)', async () => {
      const fs = await import('node:fs');
      const os = await import('node:os');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-arch-594-'));
      const baselinePath = path.join(tmpDir, '.harness', 'arch', 'baselines.json');

      fs.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({ version: 1, architecture: { enabled: true } })
      );

      // Pre-seed a correct whole-repo baseline that must survive untouched.
      fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
      const seeded = {
        version: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
        updatedFrom: 'seed',
        metrics: {
          'module-size': { value: 167349, violationIds: [] },
          'dependency-depth': { value: 494, violationIds: [] },
        },
      };
      fs.writeFileSync(baselinePath, JSON.stringify(seeded));

      const result = await runCheckArch({
        cwd: tmpDir,
        configPath: path.join(tmpDir, 'harness.config.json'),
        updateBaseline: true,
        module: 'packages/cli',
      });

      // The combination must error out, not write a clobbered baseline.
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.exitCode).toBe(2);
        expect(result.error.message).toMatch(/--module/);
      }

      // The pre-existing aggregate baseline must be left exactly as-is.
      const after = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
      expect(after.metrics['module-size'].value).toBe(167349);
      expect(after.metrics['dependency-depth'].value).toBe(494);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('runs in baseline mode when baseline exists and reports regressions', async () => {
      const fs = await import('node:fs');
      const os = await import('node:os');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-arch-baseline-'));

      // Create minimal config
      fs.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({ version: 1, architecture: { enabled: true } })
      );

      // First capture a baseline
      const updateResult = await runCheckArch({
        cwd: tmpDir,
        configPath: path.join(tmpDir, 'harness.config.json'),
        updateBaseline: true,
      });
      expect(updateResult.ok).toBe(true);

      // Now run check (should use baseline mode)
      const checkResult = await runCheckArch({
        cwd: tmpDir,
        configPath: path.join(tmpDir, 'harness.config.json'),
      });

      expect(checkResult.ok).toBe(true);
      if (checkResult.ok) {
        expect(checkResult.value.mode).toBe('baseline');
        expect(checkResult.value.passed).toBe(true);
        expect(checkResult.value.regressions).toEqual([]);
      }

      // Clean up
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // #530: a --update-baseline that WORSENS a metric must be an explicit, recorded
    // decision (--allow-regress --reason), not a silent rewrite.
    async function seedRegressingWorkspace(): Promise<{ tmpDir: string; configPath: string }> {
      const fs = await import('node:fs');
      const os = await import('node:os');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-arch-530-'));
      const configPath = path.join(tmpDir, 'harness.config.json');
      fs.writeFileSync(configPath, JSON.stringify({ version: 1, architecture: { enabled: true } }));
      const codePath = path.join(tmpDir, 'code.ts');
      // Small file → capture a low module-size baseline.
      fs.writeFileSync(codePath, `export const x = 1;\n`);
      await runCheckArch({ cwd: tmpDir, configPath, updateBaseline: true });
      // Grow the file substantially → the next scan worsens module-size well beyond
      // any regression tolerance.
      const bloat = Array.from({ length: 60 }, (_, i) => `export const v${i} = ${i};`).join('\n');
      fs.writeFileSync(codePath, `${bloat}\n`);
      return { tmpDir, configPath };
    }

    it('registers --allow-regress and --reason options', () => {
      const opts = createCheckArchCommand().options.map((o) => o.long);
      expect(opts).toContain('--allow-regress');
      expect(opts).toContain('--reason');
    });

    it('rejects a regressing --update-baseline without --allow-regress (#530)', async () => {
      const fs = await import('node:fs');
      const { tmpDir, configPath } = await seedRegressingWorkspace();
      const result = await runCheckArch({ cwd: tmpDir, configPath, updateBaseline: true });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toMatch(/WORSENS/);
        expect(result.error.message).toMatch(/--allow-regress --reason/);
      }
      // No audit entry written on a rejected update.
      expect(fs.existsSync(path.join(tmpDir, '.harness', 'audit.log'))).toBe(false);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('rejects --allow-regress without a --reason (#530)', async () => {
      const fs = await import('node:fs');
      const { tmpDir, configPath } = await seedRegressingWorkspace();
      const result = await runCheckArch({
        cwd: tmpDir,
        configPath,
        updateBaseline: true,
        allowRegress: true,
      });
      expect(result.ok).toBe(false);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('accepts a regressing update with --allow-regress --reason and logs it to audit.log (#530)', async () => {
      const fs = await import('node:fs');
      const { tmpDir, configPath } = await seedRegressingWorkspace();
      const result = await runCheckArch({
        cwd: tmpDir,
        configPath,
        updateBaseline: true,
        allowRegress: true,
        reason: 'accepted for the migration in #999',
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.baselineUpdated).toBe(true);
      const auditPath = path.join(tmpDir, '.harness', 'audit.log');
      expect(fs.existsSync(auditPath)).toBe(true);
      const entry = JSON.parse(fs.readFileSync(auditPath, 'utf-8').trim().split('\n')[0]);
      expect(entry.event).toBe('arch-baseline-regression-accepted');
      expect(entry.reason).toBe('accepted for the migration in #999');
      expect(entry.regressions.length).toBeGreaterThan(0);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('a non-regressing --update-baseline still works without --allow-regress (#530)', async () => {
      const fs = await import('node:fs');
      const os = await import('node:os');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-arch-530-ok-'));
      const configPath = path.join(tmpDir, 'harness.config.json');
      fs.writeFileSync(configPath, JSON.stringify({ version: 1, architecture: { enabled: true } }));
      await runCheckArch({ cwd: tmpDir, configPath, updateBaseline: true });
      // Re-capture with no change — no regression, so no flag needed.
      const result = await runCheckArch({ cwd: tmpDir, configPath, updateBaseline: true });
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.harness', 'audit.log'))).toBe(false);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reports correct exit code mapping: 0=pass, 1=regression, 2=config-error', async () => {
      // Exit code 2 for config error
      const configError = await runCheckArch({
        configPath: '/nonexistent/config.json',
      });
      expect(configError.ok).toBe(false);
      if (!configError.ok) {
        expect(configError.error.exitCode).toBe(2);
      }

      // Exit code 0 for passing check
      const passing = await runCheckArch({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
      });
      expect(passing.ok).toBe(true);
      if (passing.ok) {
        expect(passing.value.passed).toBe(true);
        // Exit code 0 is determined by passed=true in the action handler
      }
    });
  });

  describe('action handler', () => {
    let mockExit: ReturnType<typeof vi.spyOn>;
    let mockConsoleLog: ReturnType<typeof vi.spyOn>;
    const exitError = new Error('process.exit');

    beforeEach(() => {
      mockExit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
        throw exitError;
      }) as never);
      mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      mockExit.mockRestore();
      mockConsoleLog.mockRestore();
    });

    async function safeParseAsync(program: Command, args: string[]) {
      try {
        await program.parseAsync(args);
      } catch (e) {
        if (e !== exitError) throw e;
      }
    }

    function makeProgram(): Command {
      const program = new Command();
      program.option('--json', 'JSON output');
      program.option('--quiet', 'Quiet output');
      program.option('--verbose', 'Verbose');
      program.option('-c, --config <path>', 'Config');
      program.addCommand(createCheckArchCommand());
      return program;
    }

    it('exits with error when config is invalid', async () => {
      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '-c',
        '/nonexistent/harness.config.json',
        'check-arch',
      ]);

      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('outputs JSON error when --json and config fails', async () => {
      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '--json',
        '-c',
        '/nonexistent/harness.config.json',
        'check-arch',
      ]);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('error'));
    });

    it('handles --update-baseline and exits with SUCCESS', { timeout: 60_000 }, async () => {
      const fsSync = await import('node:fs');
      const osModule = await import('node:os');
      const tmpDir = fsSync.mkdtempSync(path.join(osModule.tmpdir(), 'check-arch-action-'));

      fsSync.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({ version: 1, architecture: { enabled: true } })
      );

      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '-c',
        path.join(tmpDir, 'harness.config.json'),
        'check-arch',
        '--update-baseline',
      ]);

      expect(mockExit).toHaveBeenCalledWith(0);

      fsSync.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('handles --update-baseline with JSON output', { timeout: 60_000 }, async () => {
      const fsSync = await import('node:fs');
      const osModule = await import('node:os');
      const tmpDir = fsSync.mkdtempSync(path.join(osModule.tmpdir(), 'check-arch-json-'));

      fsSync.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({ version: 1, architecture: { enabled: true } })
      );

      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '--json',
        '-c',
        path.join(tmpDir, 'harness.config.json'),
        'check-arch',
        '--update-baseline',
      ]);

      expect(mockExit).toHaveBeenCalledWith(0);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('baselineUpdated'));

      fsSync.rmSync(tmpDir, { recursive: true, force: true });
    });

    // Regression for issue #911: the action handler must write the baseline
    // into the project that owns the `-c` config, never into process.cwd().
    // Previously `runCheckArch` defaulted cwd to process.cwd(), so invoking
    // `check-arch -c <fixture>/harness.config.json --update-baseline` (as these
    // action-handler tests do) rewrote this repo's tracked
    // packages/cli/.harness/arch/baselines.json — a test-isolation leak that
    // dirtied the working tree on every run.
    it('writes the baseline into the config project, not process.cwd() (issue #911)', async () => {
      const fsSync = await import('node:fs');
      const osModule = await import('node:os');
      const tmpDir = fsSync.mkdtempSync(path.join(osModule.tmpdir(), 'check-arch-911-'));

      fsSync.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({ version: 1, architecture: { enabled: true } })
      );

      // Snapshot process.cwd()'s real baseline (if any) so we can prove the run
      // leaves it untouched — this is the file that leaked before the fix.
      const cwdBaselinePath = path.join(process.cwd(), '.harness', 'arch', 'baselines.json');
      const cwdBaselineBefore = fsSync.existsSync(cwdBaselinePath)
        ? fsSync.readFileSync(cwdBaselinePath, 'utf-8')
        : null;

      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '-c',
        path.join(tmpDir, 'harness.config.json'),
        'check-arch',
        '--update-baseline',
      ]);

      expect(mockExit).toHaveBeenCalledWith(0);

      // The baseline must land inside the fixture project (the config's dir)...
      const fixtureBaselinePath = path.join(tmpDir, '.harness', 'arch', 'baselines.json');
      expect(fsSync.existsSync(fixtureBaselinePath)).toBe(true);

      // ...and process.cwd()'s tracked baseline must be exactly as it was.
      const cwdBaselineAfter = fsSync.existsSync(cwdBaselinePath)
        ? fsSync.readFileSync(cwdBaselinePath, 'utf-8')
        : null;
      expect(cwdBaselineAfter).toBe(cwdBaselineBefore);

      fsSync.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('exits with SUCCESS for disabled architecture', async () => {
      const fsSync = await import('node:fs');
      const osModule = await import('node:os');
      const tmpDir = fsSync.mkdtempSync(path.join(osModule.tmpdir(), 'check-arch-disabled-'));

      fsSync.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({ version: 1, architecture: { enabled: false } })
      );

      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '-c',
        path.join(tmpDir, 'harness.config.json'),
        'check-arch',
      ]);

      expect(mockExit).toHaveBeenCalledWith(0);

      fsSync.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});

// ---------------------------------------------------------------------------
// Base-aware gating + per-PR allowance files (the baselines.json merge-cascade
// fix). In a PR (feature-branch) context, `--update-baseline` must write a
// uniquely-named allowance file INSTEAD of rewriting the shared snapshot, so
// baselines.json stays byte-identical to the base and never conflicts.
// ---------------------------------------------------------------------------
describe('check-arch: base-aware gating + allowances (PR context)', () => {
  function gitq(cwd: string, args: string[]): void {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
  }

  /**
   * A git repo with a committed arch baseline on `main`, then a `feature` branch that grows
   * a source file enough to regress module-size beyond tolerance. Returns the paths plus a
   * restore() for the HARNESS_ARCH_BASE_REF env override (no `origin` remote exists in a
   * throwaway repo, so we point the resolver at the local `main` ref).
   */
  async function seedPrContext(): Promise<{
    tmpDir: string;
    configPath: string;
    baselinePath: string;
    allowancesDir: string;
    restore: () => void;
  }> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-arch-allow-'));
    execFileSync('git', ['init', '-b', 'main'], { cwd: tmpDir, stdio: 'ignore' });
    gitq(tmpDir, ['config', 'user.email', 'test@example.com']);
    gitq(tmpDir, ['config', 'user.name', 'Test']);

    const configPath = path.join(tmpDir, 'harness.config.json');
    fs.writeFileSync(configPath, JSON.stringify({ version: 1, architecture: { enabled: true } }));
    const codePath = path.join(tmpDir, 'code.ts');
    fs.writeFileSync(codePath, `export const x = 1;\n`);

    // Capture the baseline on main (whole-snapshot behavior on the base branch) and commit it.
    await runCheckArch({ cwd: tmpDir, configPath, updateBaseline: true });
    gitq(tmpDir, ['add', '-A']);
    gitq(tmpDir, ['commit', '-m', 'seed baseline']);

    // Feature branch that regresses module-size well beyond tolerance.
    gitq(tmpDir, ['checkout', '-b', 'feature']);
    const bloat = Array.from({ length: 80 }, (_, i) => `export const v${i} = ${i};`).join('\n');
    fs.writeFileSync(codePath, `${bloat}\n`);

    // Point the resolver at the local `main` ref (throwaway repo has no `origin`).
    const prev = process.env.HARNESS_ARCH_BASE_REF;
    process.env.HARNESS_ARCH_BASE_REF = 'main';

    return {
      tmpDir,
      configPath,
      baselinePath: path.join(tmpDir, '.harness', 'arch', 'baselines.json'),
      allowancesDir: path.join(tmpDir, '.harness', 'arch', 'allowances'),
      restore: () => {
        if (prev === undefined) delete process.env.HARNESS_ARCH_BASE_REF;
        else process.env.HARNESS_ARCH_BASE_REF = prev;
      },
    };
  }

  it('the read gate REGRESSES vs the base baseline on the branch (before any allowance)', async () => {
    const ctx = await seedPrContext();
    try {
      const result = await runCheckArch({ cwd: ctx.tmpDir, configPath: ctx.configPath });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.mode).toBe('baseline');
        expect(result.value.passed).toBe(false);
        expect(result.value.regressions.length).toBeGreaterThan(0);
      }
    } finally {
      ctx.restore();
      fs.rmSync(ctx.tmpDir, { recursive: true, force: true });
    }
  });

  it('`--update-baseline --reason` writes an ALLOWANCE and leaves baselines.json byte-identical to base (AC1)', async () => {
    const ctx = await seedPrContext();
    try {
      const before = fs.readFileSync(ctx.baselinePath, 'utf-8');
      const result = await runCheckArch({
        cwd: ctx.tmpDir,
        configPath: ctx.configPath,
        updateBaseline: true,
        reason: 'intentional growth for the new feature',
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.baselineUpdated).toBe(true);

      // An allowance file was written, named after the branch (conflict-free).
      const files = fs.readdirSync(ctx.allowancesDir);
      expect(files).toEqual(['feature.json']);
      const allowance = JSON.parse(
        fs.readFileSync(path.join(ctx.allowancesDir, 'feature.json'), 'utf-8')
      );
      expect(allowance.reason).toBe('intentional growth for the new feature');
      expect(Object.keys(allowance.categories)).toContain('module-size');

      // baselines.json is UNCHANGED (the whole point — no snapshot rewrite on the branch).
      expect(fs.readFileSync(ctx.baselinePath, 'utf-8')).toBe(before);
      const gitDiff = execFileSync('git', ['diff', 'main', '--', '.harness/arch/baselines.json'], {
        cwd: ctx.tmpDir,
        encoding: 'utf-8',
      });
      expect(gitDiff.trim()).toBe('');
    } finally {
      ctx.restore();
      fs.rmSync(ctx.tmpDir, { recursive: true, force: true });
    }
  });

  it('after writing the allowance, the read gate PASSES (AC1) with baselines.json still unchanged', async () => {
    const ctx = await seedPrContext();
    try {
      await runCheckArch({
        cwd: ctx.tmpDir,
        configPath: ctx.configPath,
        updateBaseline: true,
        reason: 'accepted',
      });
      const result = await runCheckArch({ cwd: ctx.tmpDir, configPath: ctx.configPath });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(true);
        expect(result.value.regressions).toEqual([]);
      }
    } finally {
      ctx.restore();
      fs.rmSync(ctx.tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects an allowance write without a --reason', async () => {
    const ctx = await seedPrContext();
    try {
      const result = await runCheckArch({
        cwd: ctx.tmpDir,
        configPath: ctx.configPath,
        updateBaseline: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toMatch(/requires a reason/);
      // No allowance file, and baselines.json untouched.
      expect(fs.existsSync(ctx.allowancesDir)).toBe(false);
    } finally {
      ctx.restore();
      fs.rmSync(ctx.tmpDir, { recursive: true, force: true });
    }
  });
});
