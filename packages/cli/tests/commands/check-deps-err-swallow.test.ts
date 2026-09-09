import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as path from 'path';
import { Err, Ok, createError } from '@harness-engineering/core';
import type { ConstraintError } from '@harness-engineering/core';
import { createCheckDepsCommand, runCheckDeps } from '../../src/commands/check-deps';
import { ExitCode } from '../../src/utils/errors';

/**
 * Regression coverage for #1996 / CLI-R006 — "check-deps exits 0 when its
 * analysis fails".
 *
 * `validateDependencies` and `detectCircularDepsInFiles` both return a
 * `Result`. `runCheckDeps` used to consume each of them as a bare success guard
 * (`if (r.ok) { ... }`) with no `else`, so an `Err` was discarded: `valid`
 * stayed `true`, `layerViolations` stayed empty, and the command exited
 * SUCCESS. A caller — `harness check-deps && deploy`, a `--json` consumer, or
 * the `--findings-json` maintenance contract — could not tell a check that
 * failed to run from a genuinely clean repo.
 *
 * These tests drive the failure channel directly by mocking the two engine
 * exports, because a `Result`'s failure channel is part of the contract
 * regardless of which internal branch happens to produce it today.
 */
vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    // Default to the real implementations; individual tests override.
    validateDependencies: vi.fn(actual.validateDependencies),
    detectCircularDepsInFiles: vi.fn(actual.detectCircularDepsInFiles),
  };
});

// Imported after the mock declaration so these bindings are the mocked ones.
const { validateDependencies, detectCircularDepsInFiles } =
  await import('@harness-engineering/core');

/**
 * A fixture with layers configured AND a module discoverable, that analyzes
 * clean. Dedicated to this suite: the sibling `deps-node-modules-cycle` fixture
 * is mutated at runtime by another test file, which makes its module count
 * non-deterministic and unusable as an unchanged-output guard.
 */
const cleanWithLayers = path.join(__dirname, '../fixtures/deps-clean-layers');

const DEPS_ENGINE_ERROR = createError<ConstraintError>(
  'PARSER_UNAVAILABLE',
  'Parser typescript is not available',
  { parser: 'typescript' },
  ['Install required runtime']
);

const CYCLE_ENGINE_ERROR = createError<ConstraintError>(
  'PARSER_UNAVAILABLE',
  'walker failed to enumerate module graph',
  { parser: 'typescript' },
  ['Install required runtime']
);

/** A clean, non-skipped success from the layer-validation engine. */
function okDeps() {
  return Ok({ valid: true, violations: [], graph: { nodes: [], edges: [] } });
}

/** A clean success from the cycle-detection engine. */
function okCycles() {
  return Ok({ hasCycles: false, cycles: [], largestCycle: 0 });
}

describe('check-deps does not report clean when its analysis failed (#1996 / CLI-R006)', () => {
  beforeEach(() => {
    vi.mocked(validateDependencies).mockReset();
    vi.mocked(detectCircularDepsInFiles).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runCheckDeps result', () => {
    it('fails and records the error when validateDependencies returns Err', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(Err(DEPS_ENGINE_ERROR) as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(okCycles() as never);

      const result = await runCheckDeps({
        cwd: cleanWithLayers,
        configPath: path.join(cleanWithLayers, 'harness.config.json'),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // The whole point: a discarded Err used to leave this `true`.
      expect(result.value.valid).toBe(false);
      expect(result.value.analysisErrors).toBeDefined();
      expect(result.value.analysisErrors!.join('\n')).toContain(
        'Parser typescript is not available'
      );
      // And it must not masquerade as a finding.
      expect(result.value.layerViolations).toHaveLength(0);
    });

    it('fails and records the error when detectCircularDepsInFiles returns Err', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(okDeps() as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(Err(CYCLE_ENGINE_ERROR) as never);

      const result = await runCheckDeps({
        cwd: cleanWithLayers,
        configPath: path.join(cleanWithLayers, 'harness.config.json'),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.valid).toBe(false);
      expect(result.value.analysisErrors).toBeDefined();
      expect(result.value.analysisErrors!.join('\n')).toContain(
        'walker failed to enumerate module graph'
      );
      expect(result.value.circularDeps).toHaveLength(0);
    });

    it('leaves analysisErrors unset on a genuinely clean analysis', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(okDeps() as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(okCycles() as never);

      const result = await runCheckDeps({
        cwd: cleanWithLayers,
        configPath: path.join(cleanWithLayers, 'harness.config.json'),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.valid).toBe(true);
      expect(result.value.analysisErrors).toBeUndefined();
    });
  });

  describe('process exit code', () => {
    let logs: string[];
    let exitCode: number | null;
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errSpy: ReturnType<typeof vi.spyOn>;
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logs = [];
      exitCode = null;
      logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
        logs.push(a.map(String).join(' '));
      });
      errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      exitSpy = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
        exitCode = c ?? 0;
        throw new Error(`__exit__:${exitCode}`);
      }) as never);
    });

    afterEach(() => {
      logSpy.mockRestore();
      errSpy.mockRestore();
      exitSpy.mockRestore();
    });

    async function runAction(globals: string[] = [], localAfter: string[] = []) {
      // The action resolves rootDir against process.cwd(); point it at the
      // fixture so discovery actually sees the fixture's modules.
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(cleanWithLayers);
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
            path.join(cleanWithLayers, 'harness.config.json'),
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

    it('exits with the operational-failure code (not 0, not VALIDATION_FAILED) when validateDependencies Errs', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(Err(DEPS_ENGINE_ERROR) as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(okCycles() as never);

      await runAction();

      expect(exitCode).not.toBe(ExitCode.SUCCESS);
      expect(exitCode).not.toBe(ExitCode.VALIDATION_FAILED);
      expect(exitCode).toBe(ExitCode.ERROR);
      expect(logs.join('\n')).toContain('Parser typescript is not available');
    });

    it('exits with the operational-failure code when detectCircularDepsInFiles Errs', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(okDeps() as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(Err(CYCLE_ENGINE_ERROR) as never);

      await runAction();

      expect(exitCode).not.toBe(ExitCode.SUCCESS);
      expect(exitCode).not.toBe(ExitCode.VALIDATION_FAILED);
      expect(exitCode).toBe(ExitCode.ERROR);
      expect(logs.join('\n')).toContain('walker failed to enumerate module graph');
    });

    it('reports the analysis error in the --json payload rather than an empty clean result', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(Err(DEPS_ENGINE_ERROR) as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(okCycles() as never);

      await runAction(['--json']);

      expect(exitCode).toBe(ExitCode.ERROR);
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
      expect(JSON.stringify(payload)).toContain('Parser typescript is not available');
    });

    it('counts the analysis error in the --findings-json maintenance contract', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(Err(DEPS_ENGINE_ERROR) as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(okCycles() as never);

      await runAction([], ['--findings-json']);

      const contractLine = logs.find((l) => l.includes('"findings"'));
      expect(contractLine).toBeDefined();
      // A failed analysis must never render as `{ "findings": 0 }`.
      expect(contractLine).not.toContain('"findings": 0');
      expect(contractLine).not.toContain('"findings":0');
    });

    // Regression guard: the genuinely-clean path must be untouched by this fix.
    it('still exits 0 with unchanged output when the analysis is genuinely clean', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(okDeps() as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(okCycles() as never);

      await runAction();

      expect(exitCode).toBe(ExitCode.SUCCESS);
      const out = logs.join('\n');
      // Shape, not an exact count: `findFiles` also yields the `src` directory
      // itself, a pre-existing quirk this change deliberately does not touch.
      expect(out).toMatch(/^Analyzed \d+ module\(s\) across 1 layer\(s\)\.$/m);
      expect(out).toContain('validation passed');
      expect(out).not.toMatch(/could not run/i);
    });

    it('clean --json payload carries no analysisErrors key', async () => {
      vi.mocked(validateDependencies).mockResolvedValue(okDeps() as never);
      vi.mocked(detectCircularDepsInFiles).mockResolvedValue(okCycles() as never);

      await runAction(['--json']);

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
      expect(payload).not.toHaveProperty('analysisErrors');
      expect(payload).not.toHaveProperty('unavailableChecks');
    });
  });
});
