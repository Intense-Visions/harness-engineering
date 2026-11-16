// #2476 §2: `harness agent review --json` carries the comment-grouping report.
//
// With `--comment`, Phase 7 groups sub-floor suggestions, so the comment count
// can sit far below the finding count. The report that explains the drop used
// to be computed and discarded; the JSON payload must carry it.

import { describe, expect, it } from 'vitest';

import { toReviewJson } from '../../../src/commands/agent/review';

const REPORT = {
  findings: 5,
  comments: 2,
  individual: 1,
  clumps: 1,
  grouped: 4,
  act: 4,
  file: 0,
  committable: 0,
  overCapFindings: 0,
};

function value(extra: Record<string, unknown>) {
  return {
    passed: true,
    checklist: [],
    pipelineResult: {
      skipped: false,
      stoppedByMechanical: false,
      findings: [],
      strengths: [],
      terminalOutput: '',
      githubComments: [{ path: 'a.ts', line: 1, side: 'RIGHT' as const, body: 'b' }],
      exitCode: 0,
      ...extra,
    },
  };
}

describe('toReviewJson', () => {
  it('carries githubComments and the githubCommentReport', () => {
    const json = toReviewJson(value({ githubCommentReport: REPORT }) as never) as {
      pipelineResult: Record<string, unknown>;
    };
    expect(json.pipelineResult.githubCommentReport).toEqual(REPORT);
    expect(json.pipelineResult.githubComments).toHaveLength(1);
  });

  it('POSITIVE CONTROL: omits the report key when the pipeline formed none', () => {
    const json = toReviewJson(value({}) as never) as { pipelineResult: Record<string, unknown> };
    expect('githubCommentReport' in json.pipelineResult).toBe(false);
  });
});
