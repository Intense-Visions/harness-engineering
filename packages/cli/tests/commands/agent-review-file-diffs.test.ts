import { describe, it, expect, vi } from 'vitest';

// Real core parseDiff (only the pipeline is stubbed) so the per-file split is
// exercised end to end. #2454: every file used to map to '', so the pipeline
// was handed an empty diff to review — the #2213 defect in a second caller.
const RAW = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 1111111..2222222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1 +1 @@',
  '-export const a = 1;',
  '+export const a = 2;',
  'diff --git a/src/b.ts b/src/b.ts',
  'index 3333333..4444444 100644',
  '--- a/src/b.ts',
  '+++ b/src/b.ts',
  '@@ -1 +1 @@',
  '-export const b = 1;',
  '+export const b = 2;',
  '',
].join('\n');

const { execSync } = vi.hoisted(() => ({ execSync: vi.fn() }));
vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  execSync,
}));
vi.mock('../../src/config/loader', () => ({
  resolveConfig: () => ({ ok: true, value: { rootDir: '/proj' } }),
}));
vi.mock('../../src/utils/guardian-context', () => ({
  loadGuardianCoverage: async () => undefined,
}));
vi.mock('@harness-engineering/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@harness-engineering/core')>()),
  runReviewPipeline: vi.fn(async () => ({ passed: true, findings: [] })),
}));

import { runReviewPipeline } from '@harness-engineering/core';
import { runAgentReview } from '../../src/commands/agent/review';
import { GIT_MAX_BUFFER_BYTES } from '../../src/commands/review-ci';

describe('agent review → pipeline diff (#2454)', () => {
  it('hands the pipeline each file’s own diff text, read with a raised maxBuffer', async () => {
    execSync.mockImplementation((cmd: string) => (cmd === 'git diff --cached' ? RAW : ''));
    await runAgentReview({});

    const diff = vi.mocked(runReviewPipeline).mock.calls[0]![0].diff;
    expect(diff.changedFiles).toEqual(['src/a.ts', 'src/b.ts']);
    expect(diff.fileDiffs.get('src/a.ts')).toContain('+export const a = 2;');
    expect(diff.fileDiffs.get('src/a.ts')).not.toContain('src/b.ts');
    expect(diff.fileDiffs.get('src/b.ts')).toContain('+export const b = 2;');

    const diffCall = execSync.mock.calls.find((c) => c[0] === 'git diff --cached')!;
    expect((diffCall[1] as { maxBuffer?: number }).maxBuffer).toBe(GIT_MAX_BUFFER_BYTES);
  });
});
