// packages/cli/tests/commands/cleanup.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const defaultAnalyzeResult = {
  ok: true as const,
  value: {
    drift: {
      drifts: [
        {
          docFile: 'docs/api.md',
          line: 12,
          type: 'api-signature',
          issue: 'outdated',
          details: 'missing new endpoints',
        },
      ],
    },
    deadCode: {
      deadFiles: [{ path: 'src/old.ts' }],
      deadExports: [{ file: 'src/utils.ts', name: 'unusedHelper' }],
    },
    patterns: {
      violations: [{ file: 'src/hack.ts', pattern: 'no-any', message: 'Using any type' }],
    },
  },
};

const analyzeResultHolder = { current: defaultAnalyzeResult as unknown };
const capturedConfigs: unknown[] = [];

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    Ok: actual.Ok,
    Err: actual.Err,
    EntropyAnalyzer: class {
      config: unknown;
      constructor(config: unknown) {
        this.config = config;
        capturedConfigs.push(config);
      }
      async analyze() {
        return analyzeResultHolder.current;
      }
    },
  };
});

vi.mock('../../src/config/loader', () => ({
  resolveConfig: vi.fn().mockReturnValue({
    ok: true,
    value: {
      version: 1,
      rootDir: '.',
      docsDir: './docs',
      entropy: { excludePatterns: [] },
    },
  }),
}));

import { createCleanupCommand, runCleanup } from '../../src/commands/cleanup';
import { resolveConfig } from '../../src/config/loader';

describe('cleanup command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyzeResultHolder.current = defaultAnalyzeResult;
    capturedConfigs.length = 0;
  });

  describe('runCleanup', () => {
    it('returns entropy report with all issue types', async () => {
      const result = await runCleanup({ cwd: '/tmp/test' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.driftIssues).toHaveLength(1);
        expect(result.value.driftIssues[0].file).toBe('docs/api.md');
        expect(result.value.driftIssues[0].issue).toContain('outdated');

        expect(result.value.deadCode).toHaveLength(2);
        expect(result.value.deadCode[0].file).toBe('src/old.ts');
        expect(result.value.deadCode[1].file).toBe('src/utils.ts');
        expect(result.value.deadCode[1].symbol).toBe('unusedHelper');

        expect(result.value.patternViolations).toHaveLength(1);
        expect(result.value.patternViolations[0].pattern).toBe('no-any');

        expect(result.value.totalIssues).toBe(4);
      }
    });

    // Regression (#838): cleanup must expose the drift `type` (category) and
    // `line` for each finding, mirroring what `harness ci check` emits for the
    // same underlying drift. Without `type`, a category-based oracle (e.g.
    // filter for "api-signature") silently reads zero for cleanup while
    // matching ci check — the exact false discrepancy that produced #838.
    it('surfaces drift type and line so output is consistent with ci check (#838)', async () => {
      const result = await runCleanup({ cwd: '/tmp/test', type: 'drift' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.driftIssues).toHaveLength(1);
        const [drift] = result.value.driftIssues;
        expect(drift.type).toBe('api-signature');
        expect(drift.line).toBe(12);
        // `issue` retains its existing "<ENUM>: <details>" shape (additive change).
        expect(drift.issue).toContain('outdated');
      }
    });

    it('defaults to type all when not specified', async () => {
      const result = await runCleanup({ cwd: '/tmp/test' });
      expect(result.ok).toBe(true);
    });

    it('filters by drift type', async () => {
      const result = await runCleanup({ cwd: '/tmp/test', type: 'drift' });
      expect(result.ok).toBe(true);
    });

    it('filters by dead-code type', async () => {
      const result = await runCleanup({ cwd: '/tmp/test', type: 'dead-code' });
      expect(result.ok).toBe(true);
    });

    // Regression (#1760): `-t patterns` with no configured pattern rules used
    // to evaluate a hardcoded empty rule set and report "Entropy issues: 0"
    // (exit 0) — a false pass indistinguishable from a real check that found
    // nothing. It must now fail loudly instead of green-ticking zero rules.
    it('fails loudly when patterns check has no configured rules (#1760)', async () => {
      const result = await runCleanup({ cwd: '/tmp/test', type: 'patterns' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toMatch(/no pattern rules/i);
        // Non-success exit code so a real pattern check that found nothing
        // stays distinguishable from "checked zero rules".
        expect(result.error.exitCode).not.toBe(0);
      }
      // The empty-rule analyzer must never run for an explicit patterns check.
      expect(capturedConfigs).toHaveLength(0);
    });

    // Complement to the regression: when real rules ARE configured, the
    // patterns check wires them into the analyzer and runs normally (#1760).
    it('evaluates configured pattern rules when present (#1760)', async () => {
      const rule = {
        name: 'no-default-export',
        description: 'Barrels must use named exports',
        severity: 'error' as const,
        files: ['src/**/*.ts'],
        rule: { type: 'no-export' as const, names: ['default'] },
      };
      vi.mocked(resolveConfig).mockReturnValueOnce({
        ok: true,
        value: {
          version: 1,
          rootDir: '.',
          docsDir: './docs',
          entropy: { excludePatterns: [], patterns: { patterns: [rule] } },
        },
      } as never);

      const result = await runCleanup({ cwd: '/tmp/test', type: 'patterns' });
      expect(result.ok).toBe(true);
      expect(capturedConfigs).toHaveLength(1);
      const config = capturedConfigs[0] as {
        analyze: { patterns: { patterns: unknown[] } | false };
      };
      // The configured rule is threaded through, not a hardcoded empty set.
      expect(config.analyze.patterns).not.toBe(false);
      expect((config.analyze.patterns as { patterns: unknown[] }).patterns).toHaveLength(1);
    });

    it('returns error when config loading fails', async () => {
      vi.mocked(resolveConfig).mockReturnValueOnce({
        ok: false,
        error: { message: 'Config not found', exitCode: 2 },
      } as never);

      const result = await runCleanup({ cwd: '/tmp/test' });
      expect(result.ok).toBe(false);
    });

    it('returns error when analysis fails', async () => {
      analyzeResultHolder.current = {
        ok: false,
        error: new Error('Analysis failed'),
      };

      const result = await runCleanup({ cwd: '/tmp/test' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Entropy analysis failed');
      }
    });

    it('handles missing drift section in report', async () => {
      analyzeResultHolder.current = {
        ok: true,
        value: {
          // no drift, deadCode, or patterns keys
        },
      };

      const result = await runCleanup({ cwd: '/tmp/test' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.driftIssues).toHaveLength(0);
        expect(result.value.deadCode).toHaveLength(0);
        expect(result.value.patternViolations).toHaveLength(0);
        expect(result.value.totalIssues).toBe(0);
      }
    });

    it('uses process.cwd() when cwd not provided', async () => {
      const result = await runCleanup({});
      expect(result.ok).toBe(true);
    });

    it('passes configured entryPoints to EntropyAnalyzer (#169)', async () => {
      vi.mocked(resolveConfig).mockReturnValueOnce({
        ok: true,
        value: {
          version: 1,
          rootDir: '.',
          docsDir: './docs',
          entropy: {
            entryPoints: ['playwright.config.ts', 'tests/global.setup.ts'],
            excludePatterns: [],
          },
        },
      } as never);

      await runCleanup({ cwd: '/tmp/test' });
      expect(capturedConfigs).toHaveLength(1);
      const config = capturedConfigs[0] as { entryPoints?: string[] };
      expect(config.entryPoints).toEqual(['playwright.config.ts', 'tests/global.setup.ts']);
    });

    it('omits entryPoints when not configured, allowing auto-detection (#169)', async () => {
      vi.mocked(resolveConfig).mockReturnValueOnce({
        ok: true,
        value: {
          version: 1,
          rootDir: '.',
          docsDir: './docs',
          entropy: { excludePatterns: [] },
        },
      } as never);

      await runCleanup({ cwd: '/tmp/test' });
      expect(capturedConfigs).toHaveLength(1);
      expect(capturedConfigs[0]).not.toHaveProperty('entryPoints');
    });

    it('forwards entropy.drift.docPaths to the analyzer (#1819)', async () => {
      // `buildSnapshot` reads docPaths from the TOP LEVEL, so threading the
      // drift config through `analyze.drift` alone left this key inert.
      vi.mocked(resolveConfig).mockReturnValueOnce({
        ok: true,
        value: {
          version: 1,
          rootDir: '.',
          docsDir: './docs',
          entropy: {
            excludePatterns: [],
            drift: { docPaths: ['AGENTS.md', '**/SKILL.md', 'docs/**/*.md'] },
          },
        },
      } as never);

      await runCleanup({ cwd: '/tmp/test' });

      const config = capturedConfigs[0] as { docPaths: string[] };
      expect(config.docPaths).toEqual(['AGENTS.md', '**/SKILL.md', 'docs/**/*.md']);
    });

    it('does not silently narrow a configured docPaths to the docsDir glob (#1819)', async () => {
      // The failure mode is a SILENT narrowing: a clean drift check over a
      // denominator the project did not choose reads exactly like a real pass.
      vi.mocked(resolveConfig).mockReturnValueOnce({
        ok: true,
        value: {
          version: 1,
          rootDir: '.',
          docsDir: './docs',
          entropy: { excludePatterns: [], drift: { docPaths: ['AGENTS.md'] } },
        },
      } as never);

      await runCleanup({ cwd: '/tmp/test' });

      const config = capturedConfigs[0] as { docPaths: string[] };
      expect(config.docPaths).not.toContainEqual(expect.stringMatching(/\*\*[\\/]\*\.md$/));
      expect(config.docPaths).toHaveLength(1);
    });

    it('passes docPaths as a glob pattern, not a bare directory (#301 follow-up)', async () => {
      await runCleanup({ cwd: '/tmp/test' });
      expect(capturedConfigs).toHaveLength(1);
      const config = capturedConfigs[0] as { docPaths: string[] };
      expect(config.docPaths).toHaveLength(1);
      // A bare directory path produces zero matches from glob; the pattern must
      // include the **/*.md suffix so markdown files inside docsDir are scanned.
      expect(config.docPaths[0]).toMatch(/\*\*[\\/]\*\.md$/);
    });
  });

  describe('createCleanupCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createCleanupCommand();
      expect(cmd.name()).toBe('cleanup');
    });

    it('has type option', () => {
      const cmd = createCleanupCommand();
      const typeOption = cmd.options.find((opt) => opt.long === '--type');
      expect(typeOption).toBeDefined();
    });

    it('has correct description', () => {
      const cmd = createCleanupCommand();
      expect(cmd.description()).toContain('entropy');
    });

    it('type option defaults to all', () => {
      const cmd = createCleanupCommand();
      const typeOption = cmd.options.find((opt) => opt.long === '--type');
      expect(typeOption?.defaultValue).toBe('all');
    });
  });
});
