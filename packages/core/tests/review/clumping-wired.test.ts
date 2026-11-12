// The review creation seam, proved at the PIPELINE, not at the formatter
// (docs/changes/clumping/proposal.md, Phase 3, success criterion 8 — one of the
// THREE `formClumps`-forming seams: craft creation, review creation, intake.
// The execution seam forms nothing and is wired as a consumer instead).
//
// `clump-comments.test.ts` pins the formatter in isolation. This suite drives
// the real `runReviewPipeline` with a stubbed FAN-OUT and asserts the comments
// it RETURNS are grouped. A formatter that groups correctly and a Phase 7 that
// never calls it are indistinguishable from the formatter's own tests — which
// is exactly how Phase 1 of this spec shipped green with zero live callers.

import { describe, expect, it, vi } from 'vitest';

import type { DiffInfo, PipelineFlags, ReviewFinding } from '../../src/review/types';

const CHANGED_FILES = ['src/auth/a.ts', 'src/auth/b.ts', 'src/auth/c.ts', 'src/auth/d.ts'];

function suggestion(id: string, file: string, line: number): ReviewFinding {
  return {
    id,
    file,
    lineRange: [line, line],
    domain: 'security',
    severity: 'suggestion',
    title: `suggestion#${id}#`,
    rationale: 'a small, like-kinded nit',
    evidence: [],
    validatedBy: 'heuristic',
  };
}

const CRITICAL: ReviewFinding = {
  id: 'crit-1',
  file: 'src/auth/a.ts',
  lineRange: [99, 99],
  domain: 'bug',
  severity: 'critical',
  title: 'critical#1#',
  rationale: 'this one needs its own line anchor',
  evidence: [],
  validatedBy: 'heuristic',
};

const SUGGESTIONS = CHANGED_FILES.map((f, i) => suggestion(`s${i}`, f, i + 1));

vi.mock('../../src/review/fan-out', () => ({
  fanOutReview: vi.fn(async () => [
    { domain: 'security', findings: [...SUGGESTIONS, CRITICAL], strengths: [] },
  ]),
  fanOutConditionalSubagents: vi.fn(async () => []),
}));

// VALIDATE reads the real filesystem for `harness-ignore` annotations; the
// stubbed findings cite paths that do not exist, so let it see empty content
// rather than fail the run for a reason unrelated to grouping.
vi.mock('../../src/review/validate-findings', () => ({
  validateFindings: vi.fn(async ({ findings }: { findings: ReviewFinding[] }) => findings),
}));

const { runReviewPipeline } = await import('../../src/review/pipeline-orchestrator');

const DIFF: DiffInfo = {
  changedFiles: CHANGED_FILES,
  newFiles: [],
  deletedFiles: [],
  totalDiffLines: 20,
  fileDiffs: new Map(CHANGED_FILES.map((f) => [f, '+const x = 1;'])),
};

const FLAGS: PipelineFlags = { comment: true, ci: false, deep: false, noMechanical: true };

async function run(config?: Record<string, unknown>) {
  return runReviewPipeline({
    projectRoot: '/tmp/clumping-wired',
    diff: DIFF,
    commitMessage: 'feat: wired',
    flags: FLAGS,
    ...(config === undefined ? {} : { config }),
  });
}

describe('runReviewPipeline groups sub-floor comments at Phase 7', () => {
  it(`returns ${SUGGESTIONS.length} suggestions + 1 critical as 2 comments, not ${SUGGESTIONS.length + 1}`, async () => {
    const result = await run();

    expect(result.findings).toHaveLength(SUGGESTIONS.length + 1);
    expect(result.githubComments).toHaveLength(2);

    const grouped = result.githubComments.find((c) => c.body.includes('harness-clump:'));
    const anchored = result.githubComments.find((c) => c.body.includes('critical#1#'));
    expect(grouped).toBeDefined();
    expect(anchored).toBeDefined();

    // The critical keeps its own line anchor.
    expect(anchored!.path).toBe('src/auth/a.ts');
    expect(anchored!.line).toBe(99);

    // The grouped comment names every member with its own file and line.
    for (const s of SUGGESTIONS) {
      expect(grouped!.body).toContain(`${s.file}:${s.lineRange[0]}`);
      expect(grouped!.body).toContain(s.title);
    }
  });

  it("the diff's changed files reach the floor: the resolution is 'act', not 'file'", async () => {
    // This is what makes D4's `'act'` reachable at the review seam and
    // structurally unreachable at the craft seam. If Phase 7 stopped passing
    // `diff.changedFiles`, the body would read `file:` and this fails.
    const result = await run();
    const grouped = result.githubComments.find((c) => c.body.includes('harness-clump:'));
    expect(grouped!.body).toContain('act: severity is suggestion');
    expect(grouped!.body).not.toContain('file: severity is suggestion');
  });

  it('POSITIVE CONTROL: no comments at all when the comment flag is off', async () => {
    // Proves "2 comments" above is the grouping, not a pipeline that produced
    // nothing for an unrelated reason.
    const result = await runReviewPipeline({
      projectRoot: '/tmp/clumping-wired',
      diff: DIFF,
      commitMessage: 'feat: wired',
      flags: { ...FLAGS, comment: false },
    });
    expect(result.findings).toHaveLength(SUGGESTIONS.length + 1);
    expect(result.githubComments).toEqual([]);
  });

  it('LAW: every deduped finding is represented in exactly one returned comment', async () => {
    const result = await run();
    for (const f of result.findings) {
      const hits = result.githubComments.filter((c) => c.body.includes(f.title));
      expect(hits).toHaveLength(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6: the `clumping` block of harness.config.json, proved AT THE PIPELINE.
//
// THE PROPERTY: an adopter tunes the review seam from `harness.config.json`
// without a code change, and a project with no block behaves exactly as it did
// before the block existed.
//
// Both halves must be asserted together on the SAME code path. "No config ⇒ 2
// comments" is true of a pipeline that never looks at the config at all, so it
// is paired here with a run that differs ONLY in the config object.
// ─────────────────────────────────────────────────────────────────────────────

describe('the clumping config block reaches the review seam', () => {
  it('CRITERION 13: no `clumping` block ⇒ the pre-Phase-6 behaviour, and no error', async () => {
    const absent = await run();
    const emptyConfig = await run({ version: 1, name: 'adopter' });
    const emptyBlock = await run({ clumping: {} });

    for (const result of [absent, emptyConfig, emptyBlock]) {
      expect(result.githubComments).toHaveLength(2);
      expect(result.githubComments.some((c) => c.body.includes('harness-clump:'))).toBe(true);
    }
  });

  it('POSITIVE CONTROL: a `clumping` block CHANGES the comments the pipeline returns', async () => {
    // `minToClump: 5` over 4 sub-floor suggestions means no group forms, so
    // each keeps its own anchored comment: 4 + 1 critical = 5 comments, and no
    // clump marker anywhere. Nothing is lost — the conservation law one
    // describe up still holds, which is what makes this a tuning knob rather
    // than a drop switch.
    const tuned = await run({ clumping: { minToClump: 5 } });

    expect(tuned.githubComments).toHaveLength(SUGGESTIONS.length + 1);
    expect(tuned.githubComments.some((c) => c.body.includes('harness-clump:'))).toBe(false);

    // The SAME pipeline with no block groups them. Asserted here, in the same
    // test, so the two cannot drift apart.
    const untuned = await run();
    expect(untuned.githubComments).toHaveLength(2);

    // …and every finding is still represented exactly once under the override.
    for (const f of tuned.findings) {
      expect(tuned.githubComments.filter((c) => c.body.includes(f.title))).toHaveLength(1);
    }
  });

  it('a `seams.review` override wins over the top-level field', async () => {
    const result = await run({
      clumping: { minToClump: 2, seams: { review: { minToClump: 5 } } },
    });
    expect(result.githubComments).toHaveLength(SUGGESTIONS.length + 1);
  });

  it('a `seams.intake` override does NOT reach the review seam', async () => {
    // The negative half of the per-seam law: if `seams` leaked, this would
    // read 5 comments instead of 2.
    const result = await run({ clumping: { seams: { intake: { minToClump: 5 } } } });
    expect(result.githubComments).toHaveLength(2);
  });

  it('a MALFORMED block degrades to the defaults rather than failing the review', async () => {
    const result = await run({ clumping: { minToClump: 'five' } });
    expect(result.githubComments).toHaveLength(2);
  });
});
