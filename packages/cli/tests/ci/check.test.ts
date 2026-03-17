import { describe, it, expect, vi } from 'vitest';
import type { CICheckReport } from '@harness-engineering/types';

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    runCIChecks: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        version: 1,
        project: 'test',
        timestamp: new Date().toISOString(),
        checks: [
          { name: 'validate', status: 'pass', issues: [], durationMs: 10 },
          { name: 'deps', status: 'pass', issues: [], durationMs: 5 },
          { name: 'docs', status: 'pass', issues: [], durationMs: 8 },
          { name: 'entropy', status: 'pass', issues: [], durationMs: 12 },
          { name: 'phase-gate', status: 'pass', issues: [], durationMs: 3 },
        ],
        summary: { total: 5, passed: 5, failed: 0, warnings: 0, skipped: 0 },
        exitCode: 0,
      } satisfies CICheckReport,
    }),
  };
});

vi.mock('../../src/config/loader', () => ({
  resolveConfig: vi.fn().mockReturnValue({
    ok: true,
    value: { version: 1, rootDir: '.', agentsMapPath: './AGENTS.md', docsDir: './docs' },
  }),
}));

import { runCICheck } from '../../src/commands/ci/check';
import { runCIChecks } from '@harness-engineering/core';

describe('runCICheck', () => {
  it('returns a CICheckReport result', async () => {
    const result = await runCICheck({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version).toBe(1);
    expect(result.value.checks).toHaveLength(5);
  });

  it('passes skip option through to core', async () => {
    const result = await runCICheck({ skip: ['entropy', 'docs'] });
    expect(result.ok).toBe(true);
    expect(runCIChecks).toHaveBeenCalledWith(
      expect.objectContaining({ skip: ['entropy', 'docs'] })
    );
  });

  it('passes failOn option through to core', async () => {
    const result = await runCICheck({ failOn: 'warning' });
    expect(result.ok).toBe(true);
    expect(runCIChecks).toHaveBeenCalledWith(expect.objectContaining({ failOn: 'warning' }));
  });
});
