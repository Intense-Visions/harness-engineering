import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as path from 'path';
import { Ok } from '@harness-engineering/core';
import { createCheckDepsCommand, runCheckDeps } from '../../src/commands/check-deps';
import { ExitCode } from '../../src/utils/errors';

/**
 * Regression coverage for #2098 — "check-deps reports clean (exit 0) when the
 * parser is unavailable".
 *
 * `validateDependencies` abstains, and says so: an unavailable parser yields
 * `Ok({ valid: true, violations: [], graph: {...}, skipped: true, reason:
 * 'Parser unavailable' })`. No consumer read `skipped`, so `runCheckDeps` saw
 * an `Ok` with zero violations — indistinguishable from a genuinely clean repo.
 * `valid` stayed `true`, `--findings-json` printed `{ "findings": 0 }`, and the
 * command exited SUCCESS, having validated nothing. `harness check-deps &&
 * deploy` proceeded on an analysis that never ran.
 *
 * These tests drive the abstention at the engine boundary by mocking the core
 * export, for the same reason the sibling #1996 suite does: a `Result`'s
 * abstention channel is part of the contract regardless of which internal
 * branch happens to produce it today. (It also cannot be driven end-to-end
 * right now — the bundled `TypeScriptParser.health()` hardcodes
 * `available: true`.)
 */
vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    validateDependencies: vi.fn(actual.validateDependencies),
    detectCircularDepsInFiles: vi.fn(actual.detectCircularDepsInFiles),
  };
});

// Imported after the mock declaration so these bindings are the mocked ones.
const { validateDependencies, detectCircularDepsInFiles } =
  await import('@harness-engineering/core');

/** Layers configured, one module discoverable, analysis comes back clean. */
const cleanWithLayers = path.join(__dirname, '../fixtures/deps-clean-layers');

/** Same shape, but the project opted into the documented `warn` downgrade. */
const warnDowngrade = path.join(__dirname, '../fixtures/deps-abstention-warn');

/** Exactly what `validateDependencies` returns when `parser.health()` is unavailable. */
function abstainedDeps() {
  return Ok({
    valid: true,
    violations: [],
    graph: { nodes: [], edges: [] },
    skipped: true,
    reason: 'Parser unavailable',
  });
}

/** A clean, non-skipped success from the layer-validation engine. */
function okDeps() {
  return Ok({ valid: true, violations: [], graph: { nodes: [], edges: [] } });
}

/** A clean success from the cycle-detection engine. */
function okCycles() {
  return Ok({ hasCycles: false, cycles: [], largestCycle: 0 });
}

describe('check-deps does not report clean when the engine abstained (#2098)', () => {
  beforeEach(() => {
    vi.mocked(validateDependencies).mockReset();
    vi.mocked(detectCircularDepsInFiles).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runCheckDeps result', () => {
    it('refuses to report clean and records the abstention when the engine skipped', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(abstainedDeps() as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(okCycles() as never);

      const result = await runCheckDeps({
        cwd: cleanWithLayers,
        configPath: path.join(cleanWithLayers, 'harness.config.json'),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // The whole point: a discarded `skipped` used to leave this `true`.
      expect(result.value.valid).toBe(false);
      expect(result.value.unavailableChecks).toBeDefined();
      expect(result.value.unavailableChecks).toHaveLength(1);
      expect(result.value.unavailableChecks![0]!.reason).toContain('Parser unavailable');
      // And it must not masquerade as a finding.
      expect(result.value.layerViolations).toHaveLength(0);
      expect(result.value.analysisErrors).toBeUndefined();
    });

    it('leaves unavailableChecks unset on a genuinely clean analysis', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(okDeps() as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(okCycles() as never);

      const result = await runCheckDeps({
        cwd: cleanWithLayers,
        configPath: path.join(cleanWithLayers, 'harness.config.json'),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.valid).toBe(true);
      expect(result.value.unavailableChecks).toBeUndefined();
      expect(result.value.abstentionDowngraded).toBeUndefined();
    });

    it('asks the engine to abstain by default rather than warn-and-continue', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(okDeps() as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(okCycles() as never);

      await runCheckDeps({
        cwd: cleanWithLayers,
        configPath: path.join(cleanWithLayers, 'harness.config.json'),
      });

      const passed = vi.mocked(validateDependencies).mock.calls[0]![0]!;
      expect(passed.fallbackBehavior).toBe('skip');
    });

    it('honours deps.fallbackBehavior = "warn": records the abstention but stays valid', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(abstainedDeps() as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(okCycles() as never);

      const result = await runCheckDeps({
        cwd: warnDowngrade,
        configPath: path.join(warnDowngrade, 'harness.config.json'),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // The documented escape hatch: still reported, but not fatal.
      expect(result.value.unavailableChecks).toHaveLength(1);
      expect(result.value.abstentionDowngraded).toBe(true);
      expect(result.value.valid).toBe(true);

      const passed = vi.mocked(validateDependencies).mock.calls[0]![0]!;
      expect(passed.fallbackBehavior).toBe('warn');
    });
  });

  describe('process exit code', () => {
    let logs: string[];
    let exitCode: number | null;
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logs = [];
      exitCode = null;
      logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
        logs.push(a.map(String).join(' '));
      });
      errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      exitSpy = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
        exitCode = c ?? 0;
        throw new Error(`__exit__:${exitCode}`);
      }) as never);
    });

    afterEach(() => {
      logSpy.mockRestore();
      errSpy.mockRestore();
      warnSpy.mockRestore();
      exitSpy.mockRestore();
    });

    async function runAction(
      fixture: string,
      globals: string[] = [],
      localAfter: string[] = []
    ): Promise<void> {
      // The action resolves rootDir against process.cwd(); point it at the
      // fixture so discovery actually sees the fixture's modules.
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(fixture);
      const program = new Command();
      program.option('--config <path>');
      program.option('--json');
      program.option('--verbose');
      program.option('--quiet');
      program.addCommand(createCheckDepsCommand());
      try {
        await program.parseAsync(
          [
            ...globals,
            '--config',
            path.join(fixture, 'harness.config.json'),
            'check-deps',
            ...localAfter,
          ],
          { from: 'user' }
        );
      } catch (e) {
        if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
      } finally {
        cwdSpy.mockRestore();
      }
    }

    it('exits with the abstention code (not 0, not VALIDATION_FAILED) when the engine skipped', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(abstainedDeps() as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(okCycles() as never);

      await runAction(cleanWithLayers);

      expect(exitCode).not.toBe(ExitCode.SUCCESS);
      expect(exitCode).not.toBe(ExitCode.VALIDATION_FAILED);
      expect(exitCode).toBe(ExitCode.ZERO_DENOMINATOR);
      expect(logs.join('\n')).toContain('Parser unavailable');
    });

    it('reports the abstention in the --json payload rather than an empty clean result', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(abstainedDeps() as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(okCycles() as never);

      await runAction(cleanWithLayers, ['--json']);

      expect(exitCode).toBe(ExitCode.ZERO_DENOMINATOR);
      const payload = logs
        .map((l) => {
          try {
            return JSON.parse(l) as Record<string, unknown>;
          } catch {
            return null;
          }
        })
        .find((p): p is Record<string, unknown> => p !== null && 'valid' in p);

      expect(payload).toBeDefined();
      expect(payload!.valid).toBe(false);
      expect(payload).toHaveProperty('unavailableChecks');
      expect(JSON.stringify(payload)).toContain('Parser unavailable');
    });

    it('never counts an abstained run as { findings: 0 } in the maintenance contract', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(abstainedDeps() as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(okCycles() as never);

      await runAction(cleanWithLayers, [], ['--findings-json']);

      const contractLine = logs.find((l) => l.includes('"findings"'));
      expect(contractLine).toBeDefined();
      expect(contractLine).not.toContain('"findings": 0');
      expect(contractLine).not.toContain('"findings":0');
    });

    it('deps.fallbackBehavior = "warn" downgrades the abstention back to exit 0', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(abstainedDeps() as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(okCycles() as never);

      await runAction(warnDowngrade);

      expect(exitCode).toBe(ExitCode.SUCCESS);
      // Downgraded, not hidden: the operator is still told nothing was validated.
      expect(logs.join('\n')).toContain('Parser unavailable');
    });

    // Regression guard: the genuinely-clean path must be untouched by this fix.
    it('still exits 0 with unchanged output when the analysis is genuinely clean', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(okDeps() as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(okCycles() as never);

      await runAction(cleanWithLayers);

      expect(exitCode).toBe(ExitCode.SUCCESS);
      const out = logs.join('\n');
      expect(out).toMatch(/^Analyzed \d+ module\(s\) across 1 layer\(s\)\.$/m);
      expect(out).toContain('validation passed');
      expect(out).not.toMatch(/could not run/i);
    });

    it('clean --json payload carries no unavailableChecks key', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(okDeps() as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(okCycles() as never);

      await runAction(cleanWithLayers, ['--json']);

      expect(exitCode).toBe(ExitCode.SUCCESS);
      const payload = logs
        .map((l) => {
          try {
            return JSON.parse(l) as Record<string, unknown>;
          } catch {
            return null;
          }
        })
        .find((p): p is Record<string, unknown> => p !== null && 'valid' in p);

      expect(payload).toBeDefined();
      expect(payload!.valid).toBe(true);
      expect(payload).not.toHaveProperty('unavailableChecks');
      expect(payload).not.toHaveProperty('analysisErrors');
    });
  });
});
