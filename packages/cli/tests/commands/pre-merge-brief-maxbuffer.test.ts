import { describe, it, expect, vi } from 'vitest';

// Capture the options the DEFAULT git runner hands execFileSync. Node's default
// maxBuffer is 1MB; a larger `git diff` throws ENOBUFS on exactly the large PRs
// a pre-merge brief matters most for (#2455, #2321's class).
const { execFileSync } = vi.hoisted(() => ({
  execFileSync: vi.fn(() => 'diff --git a/x b/x\n+x\n'),
}));
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync,
}));

import { runPreMergeBrief } from '../../src/commands/pre-merge-brief';
import { GIT_MAX_BUFFER_BYTES } from '../../src/commands/review-ci';

describe('pre-merge-brief default git runner — maxBuffer (#2455)', () => {
  it('reads the diff with review-ci’s bounded maxBuffer, not Node’s 1MB default', async () => {
    await runPreMergeBrief({
      cwd: '/proj',
      diffRange: 'main...HEAD',
      readFile: () => 'unused',
      gather: async () => ({ signals: [], generatedAt: '2026-11-10T00:00:00Z' }),
      store: undefined,
      log: () => {},
    });
    const diffCall = execFileSync.mock.calls.find(
      (c) => (c as unknown[])[0] === 'git' && ((c as unknown[])[1] as string[])[0] === 'diff'
    ) as unknown[] | undefined;
    expect(diffCall).toBeDefined();
    const opts = diffCall![2] as { maxBuffer?: number };
    expect(opts.maxBuffer).toBe(GIT_MAX_BUFFER_BYTES);
    expect(opts.maxBuffer).toBeGreaterThan(1024 * 1024);
  });
});
