// THE PROPERTY: every production caller of `runReviewPipeline` hands it the
// project's config.
//
// `runReviewPipeline` reads `config` for the review seam's clump policy (Phase
// 6 of docs/changes/clumping/proposal.md), so a caller that omits it silently
// disables the documented `clumping.floorEnabled: false` escape hatch for
// everything reached through that caller. Two of the three callers omitted it,
// and the goal read as met because the one that passed it was the one anybody
// checked.
//
// This file covers the CI caller. Its omission is INERT today — `runCiReview`
// hardcodes `comment: false` and the clump policy is only read on the comment
// path — which is exactly why it needs a test: an inert defect is invisible
// until the day the flag flips, and then it is a silent behaviour change.
//
// The pipeline is mocked rather than run, because what is under test is the
// ARGUMENT, not the review. Mocking the thing being measured would be a defect;
// mocking the thing being CALLED is the only way to observe a call.

import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { DiffInfo } from '../../../src/review/types';

const runReviewPipeline = vi.fn();

vi.mock('../../../src/review/pipeline-orchestrator', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runReviewPipeline,
}));

const { runCiReview } = await import('../../../src/review/ci/orchestrator');

const diff: DiffInfo = { files: [], changedFiles: [], additions: 0, deletions: 0, fileDiffs: {} };

/** A floor result shaped enough for `runCiReview` to return without branching. */
function floorResult() {
  return {
    skipped: false,
    stoppedByMechanical: false,
    assessment: 'approve',
    findings: [],
    strengths: [],
    terminalOutput: '',
    githubComments: [],
    exitCode: 0,
  };
}

describe('runCiReview forwards the harness config to the floor pipeline', () => {
  beforeEach(() => {
    runReviewPipeline.mockReset();
    runReviewPipeline.mockResolvedValue(floorResult());
  });

  it('passes `config` straight through when the caller supplies one', async () => {
    const config = { clumping: { floorEnabled: false } };
    await runCiReview({ projectRoot: '/p', diff, config });
    expect(runReviewPipeline).toHaveBeenCalledTimes(1);
    expect(runReviewPipeline.mock.calls[0]![0]).toMatchObject({ config });
  });

  it('POSITIVE CONTROL: omits the key entirely when the caller has no config', async () => {
    // Not `config: undefined`. The pipeline defaults `config = {}` in its own
    // destructuring, and an explicitly-undefined key is the exact shape the
    // clumping config layer documents as able to clobber a default.
    await runCiReview({ projectRoot: '/p', diff });
    const passed = runReviewPipeline.mock.calls[0]![0] as Record<string, unknown>;
    expect('config' in passed).toBe(false);
  });
});
