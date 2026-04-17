// packages/cli/tests/commands/cleanup.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const defaultAnalyzeResult = {
  ok: true as const,
  value: {
    drift: {
      drifts: [{ docFile: 'docs/api.md', issue: 'outdated', details: 'missing new endpoints' }],
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

    it('filters by patterns type', async () => {
      const result = await runCleanup({ cwd: '/tmp/test', type: 'patterns' });
      expect(result.ok).toBe(true);
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
