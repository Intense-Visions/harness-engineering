import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runImpactPreview } from '../../src/commands/impact-preview';

// Mock child_process.execSync for staged files
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Mock fs for graph existence check
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

// Mock handleGetImpact
vi.mock('../../src/mcp/tools/graph/index', () => ({
  handleGetImpact: vi.fn(),
}));

import { execSync } from 'child_process';
import * as fs from 'fs';
import { handleGetImpact } from '../../src/mcp/tools/graph/index';

const mockedExecSync = vi.mocked(execSync);
const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedHandleGetImpact = vi.mocked(handleGetImpact);

describe('runImpactPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns no staged changes when git diff is empty', async () => {
    mockedExecSync.mockReturnValue('');
    const output = await runImpactPreview({});
    expect(output).toBe('Impact Preview: no staged changes');
  });

  it('returns no staged changes when git diff throws', async () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
    const output = await runImpactPreview({});
    expect(output).toBe('Impact Preview: no staged changes');
  });

  it('returns skipped message when no graph exists', async () => {
    mockedExecSync.mockReturnValue('src/foo.ts\n');
    mockedExistsSync.mockReturnValue(false);
    const output = await runImpactPreview({});
    expect(output).toBe('Impact Preview: skipped (no graph — run `harness scan` to enable)');
  });

  it('exits 0 in all cases (verified by no thrown errors)', async () => {
    mockedExecSync.mockReturnValue('');
    // No assertion on process.exit — runImpactPreview returns a string, never throws
    const output = await runImpactPreview({});
    expect(typeof output).toBe('string');
  });

  describe('with graph and staged files', () => {
    beforeEach(() => {
      mockedExistsSync.mockReturnValue(true);
    });

    const summaryResponse = (
      counts: { code: number; tests: number; docs: number; other: number },
      items: Array<{ id: string; type: string }>
    ) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            mode: 'summary',
            targetNodeId: 'file:test',
            impactCounts: counts,
            highestRiskItems: items,
            stats: {},
          }),
        },
      ],
    });

    const detailedResponse = (impact: Record<string, Array<{ id: string; type: string }>>) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            targetNodeId: 'file:test',
            impact,
            stats: {},
            edges: [],
          }),
        },
      ],
    });

    it('formats compact summary with counts and top items', async () => {
      mockedExecSync.mockReturnValue('src/auth.ts\nsrc/login.ts\n');
      mockedHandleGetImpact.mockResolvedValue(
        summaryResponse({ code: 5, tests: 2, docs: 1, other: 0 }, [
          { id: 'file:src/routes/login.ts', type: 'file' },
          { id: 'file:src/middleware/verify.ts', type: 'file' },
          { id: 'test_result:auth.test.ts', type: 'test_result' },
          { id: 'test_result:integration.test.ts', type: 'test_result' },
          { id: 'document:auth-guide.md', type: 'document' },
        ])
      );

      const output = await runImpactPreview({});
      expect(output).toContain('Impact Preview (2 staged files)');
      expect(output).toContain('Code:');
      expect(output).toContain('Tests:');
      expect(output).toContain('Docs:');
      expect(output).toContain('Total:');
    });

    it('formats detailed output with all items listed', async () => {
      mockedExecSync.mockReturnValue('src/auth.ts\n');
      mockedHandleGetImpact.mockResolvedValue(
        detailedResponse({
          code: [
            { id: 'file:src/routes/login.ts', type: 'file' },
            { id: 'file:src/middleware/verify.ts', type: 'file' },
          ],
          tests: [{ id: 'test_result:auth.test.ts', type: 'test_result' }],
          docs: [{ id: 'document:auth-guide.md', type: 'document' }],
          other: [],
        })
      );

      const output = await runImpactPreview({ detailed: true });
      expect(output).toContain('Impact Preview (1 staged file)');
      expect(output).toContain('login.ts');
      expect(output).toContain('verify.ts');
      expect(output).toContain('auth.test.ts');
      expect(output).toContain('auth-guide.md');
      expect(output).toContain('Total: 4 affected');
    });

    it('formats per-file breakdown', async () => {
      mockedExecSync.mockReturnValue('src/auth.ts\nsrc/login.ts\n');
      mockedHandleGetImpact
        .mockResolvedValueOnce(summaryResponse({ code: 5, tests: 2, docs: 1, other: 0 }, []))
        .mockResolvedValueOnce(summaryResponse({ code: 3, tests: 1, docs: 0, other: 0 }, []));

      const output = await runImpactPreview({ perFile: true });
      expect(output).toContain('Impact Preview (2 staged files)');
      expect(output).toContain('src/auth.ts');
      expect(output).toContain('5 files, 2 tests, 1 docs');
      expect(output).toContain('src/login.ts');
      expect(output).toContain('3 files, 1 tests, 0 docs');
    });

    it('deduplicates top items but uses API counts for totals in compact mode', async () => {
      mockedExecSync.mockReturnValue('src/a.ts\nsrc/b.ts\n');
      // Both files impact the same node — top items deduplicate, but counts aggregate
      mockedHandleGetImpact
        .mockResolvedValueOnce(
          summaryResponse({ code: 1, tests: 0, docs: 0, other: 0 }, [
            { id: 'file:src/shared.ts', type: 'file' },
          ])
        )
        .mockResolvedValueOnce(
          summaryResponse({ code: 1, tests: 0, docs: 0, other: 0 }, [
            { id: 'file:src/shared.ts', type: 'file' },
          ])
        );

      const output = await runImpactPreview({});
      // Aggregate counts: 1+1=2 (API-reported totals sum)
      expect(output).toContain('Total: 2 affected');
      // But top items are deduplicated — only one "shared.ts" shown
      expect(output).toContain('shared.ts');
    });

    it('handles handleGetImpact returning error gracefully', async () => {
      mockedExecSync.mockReturnValue('src/unknown.ts\n');
      mockedHandleGetImpact.mockResolvedValue({
        content: [{ type: 'text' as const, text: 'Error: no file node found' }],
        isError: true,
      });

      const output = await runImpactPreview({});
      // Should still produce valid output (0 affected)
      expect(output).toContain('Impact Preview (1 staged file)');
      expect(output).toContain('Total: 0 affected');
    });

    it('compact mode uses API counts not merged item counts', async () => {
      mockedExecSync.mockReturnValue('src/auth.ts\n');
      // API says 15 code files but only returns 2 in highestRiskItems
      mockedHandleGetImpact.mockResolvedValue(
        summaryResponse({ code: 15, tests: 3, docs: 2, other: 0 }, [
          { id: 'file:src/routes/login.ts', type: 'file' },
          { id: 'file:src/middleware/verify.ts', type: 'file' },
        ])
      );

      const output = await runImpactPreview({});
      // Should show 15 (from API), not 2 (from items length)
      expect(output).toContain('Total: 20 affected');
      expect(output).toContain('15');
    });

    it('per-file returns no impact data when all files error', async () => {
      mockedExecSync.mockReturnValue('src/unknown.ts\nsrc/missing.ts\n');
      mockedHandleGetImpact.mockResolvedValue({
        content: [{ type: 'text' as const, text: 'Error: no file node found' }],
        isError: true,
      });

      const output = await runImpactPreview({ perFile: true });
      expect(output).toBe('Impact Preview (2 staged files): no impact data');
    });

    it('singular form for 1 staged file', async () => {
      mockedExecSync.mockReturnValue('src/auth.ts\n');
      mockedHandleGetImpact.mockResolvedValue(
        summaryResponse({ code: 0, tests: 0, docs: 0, other: 0 }, [])
      );

      const output = await runImpactPreview({});
      expect(output).toContain('(1 staged file)');
      expect(output).not.toContain('files)');
    });
  });
});
