// packages/cli/tests/commands/fix-drift.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    Ok: actual.Ok,
    Err: actual.Err,
    buildSnapshot: vi.fn().mockResolvedValue({
      ok: true,
      value: { files: [], docs: [] },
    }),
    detectDocDrift: vi.fn().mockResolvedValue({
      ok: true,
      value: { drifts: [] },
    }),
    detectDeadCode: vi.fn().mockResolvedValue({
      ok: true,
      value: { deadFiles: [], deadExports: [], unusedImports: [] },
    }),
    createFixes: vi.fn().mockReturnValue([]),
    applyFixes: vi.fn().mockResolvedValue({
      ok: true,
      value: { applied: [], skipped: [], errors: [] },
    }),
    generateSuggestions: vi.fn().mockReturnValue({ suggestions: [] }),
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

import { createFixDriftCommand, runFixDrift } from '../../src/commands/fix-drift';
import {
  buildSnapshot,
  detectDocDrift,
  detectDeadCode,
  createFixes,
  applyFixes,
  generateSuggestions,
} from '@harness-engineering/core';
import { resolveConfig } from '../../src/config/loader';

describe('fix-drift command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runFixDrift', () => {
    it('runs in dry-run mode by default', async () => {
      const result = await runFixDrift({ cwd: '/tmp/test' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.dryRun).toBe(true);
      }
    });

    it('respects dryRun=false option', async () => {
      const result = await runFixDrift({ cwd: '/tmp/test', dryRun: false });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.dryRun).toBe(false);
      }
    });

    it('returns fixes and suggestions arrays', async () => {
      const result = await runFixDrift({ cwd: '/tmp/test' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveProperty('fixes');
        expect(result.value).toHaveProperty('suggestions');
        expect(Array.isArray(result.value.fixes)).toBe(true);
        expect(Array.isArray(result.value.suggestions)).toBe(true);
      }
    });

    it('returns error when config loading fails', async () => {
      vi.mocked(resolveConfig).mockReturnValueOnce({
        ok: false,
        error: { message: 'Config not found', exitCode: 2 },
      } as never);

      const result = await runFixDrift({ cwd: '/tmp/test' });
      expect(result.ok).toBe(false);
    });

    it('returns error when snapshot building fails', async () => {
      vi.mocked(buildSnapshot).mockResolvedValueOnce({
        ok: false,
        error: new Error('Snapshot failed'),
      });

      const result = await runFixDrift({ cwd: '/tmp/test' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Failed to build snapshot');
      }
    });

    it('returns error when drift detection fails', async () => {
      vi.mocked(detectDocDrift).mockResolvedValueOnce({
        ok: false,
        error: new Error('Drift detection failed'),
      });

      const result = await runFixDrift({ cwd: '/tmp/test' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Failed to detect drift');
      }
    });

    it('returns error when dead code detection fails', async () => {
      vi.mocked(detectDeadCode).mockResolvedValueOnce({
        ok: false,
        error: new Error('Dead code detection failed'),
      });

      const result = await runFixDrift({ cwd: '/tmp/test' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Failed to detect dead code');
      }
    });

    it('applies fixes when not in dry-run mode and fixes exist', async () => {
      vi.mocked(createFixes).mockReturnValueOnce([
        { file: 'src/old.ts', action: 'remove-dead-file' },
      ] as never);
      vi.mocked(applyFixes).mockResolvedValueOnce({
        ok: true,
        value: {
          applied: [{ file: 'src/old.ts', action: 'remove-dead-file' }],
          skipped: [],
          errors: [],
        },
      });

      const result = await runFixDrift({ cwd: '/tmp/test', dryRun: false });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.dryRun).toBe(false);
        expect(result.value.fixes).toHaveLength(1);
        expect(result.value.fixes[0].applied).toBe(true);
      }
      expect(applyFixes).toHaveBeenCalledWith(expect.any(Array), { dryRun: false });
    });

    it('handles skipped and errored fixes', async () => {
      vi.mocked(createFixes).mockReturnValueOnce([
        { file: 'src/a.ts', action: 'remove-dead-file' },
        { file: 'src/b.ts', action: 'remove-dead-export' },
        { file: 'src/c.ts', action: 'remove-unused-import' },
      ] as never);
      vi.mocked(applyFixes).mockResolvedValueOnce({
        ok: true,
        value: {
          applied: [{ file: 'src/a.ts', action: 'remove-dead-file' }],
          skipped: [{ file: 'src/b.ts', action: 'remove-dead-export' }],
          errors: [
            { fix: { file: 'src/c.ts', action: 'remove-unused-import' }, error: new Error('oops') },
          ],
        },
      });

      const result = await runFixDrift({ cwd: '/tmp/test', dryRun: false });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.fixes).toHaveLength(3);
        expect(result.value.fixes[0].applied).toBe(true);
        expect(result.value.fixes[1].applied).toBe(false);
        expect(result.value.fixes[2].applied).toBe(false);
      }
    });

    it('returns error when applyFixes fails', async () => {
      vi.mocked(createFixes).mockReturnValueOnce([
        { file: 'src/old.ts', action: 'remove' },
      ] as never);
      vi.mocked(applyFixes).mockResolvedValueOnce({
        ok: false,
        error: new Error('Apply failed'),
      });

      const result = await runFixDrift({ cwd: '/tmp/test', dryRun: false });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Failed to apply fixes');
      }
    });

    it('lists fixes as not applied in dry-run mode', async () => {
      vi.mocked(createFixes).mockReturnValueOnce([
        { file: 'src/old.ts', action: 'remove-dead-file' },
      ] as never);

      const result = await runFixDrift({ cwd: '/tmp/test', dryRun: true });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.dryRun).toBe(true);
        expect(result.value.fixes).toHaveLength(1);
        expect(result.value.fixes[0].applied).toBe(false);
      }
      expect(applyFixes).not.toHaveBeenCalled();
    });

    it('maps suggestions from multiple files', async () => {
      vi.mocked(generateSuggestions).mockReturnValueOnce({
        suggestions: [
          { title: 'Remove unused dep', files: ['package.json', 'yarn.lock'] },
          { title: 'Update docs', files: ['README.md'] },
        ],
      } as never);

      const result = await runFixDrift({ cwd: '/tmp/test' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.suggestions).toHaveLength(3);
        expect(result.value.suggestions[0].suggestion).toBe('Remove unused dep');
        expect(result.value.suggestions[2].suggestion).toBe('Update docs');
      }
    });

    it('uses process.cwd() when cwd not provided', async () => {
      const result = await runFixDrift({});
      expect(result.ok).toBe(true);
    });

    it('passes configured entryPoints to buildSnapshot (#169)', async () => {
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

      await runFixDrift({ cwd: '/tmp/test' });
      expect(buildSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          entryPoints: ['playwright.config.ts', 'tests/global.setup.ts'],
        })
      );
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

      await runFixDrift({ cwd: '/tmp/test' });
      expect(buildSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          entryPoints: undefined,
        })
      );
    });
  });

  describe('createFixDriftCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createFixDriftCommand();
      expect(cmd.name()).toBe('fix-drift');
    });

    it('has correct description', () => {
      const cmd = createFixDriftCommand();
      expect(cmd.description()).toContain('entropy');
    });

    it('has no-dry-run option', () => {
      const cmd = createFixDriftCommand();
      const dryRunOption = cmd.options.find((opt) => opt.long === '--no-dry-run');
      expect(dryRunOption).toBeDefined();
    });
  });
});
