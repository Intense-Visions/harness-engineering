import { describe, it, expect } from 'vitest';
import { strength006AutoapproveBaseline } from './strength-006-autoapprove-baseline';
import type { ProjectContext } from '../types';

function ctx(partial: Partial<ProjectContext>): ProjectContext {
  return {
    root: '/r',
    mode: 'adopter',
    config: null,
    preCommit: null,
    hookFiles: [],
    workflows: [],
    healthSnapshot: null,
    ...partial,
  };
}

const FAILING_WF = `name: auto-approve baseline
on: pull_request
jobs:
  approve:
    runs-on: ubuntu-latest
    steps:
      - uses: hmarr/auto-approve-action@v3
        with:
          token: \${{ secrets.BASELINE_AUTOAPPROVE_PAT }}
      - run: gh pr merge --auto
`;

const PASSING_WF_GATED = `name: gated automerge
on: pull_request_review
jobs:
  merge:
    runs-on: ubuntu-latest
    if: github.event.review.state == 'approved'
    steps:
      - run: gh pr merge --auto
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;

const PASSING_WF_NO_AUTO = `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`;

describe('STRENGTH-006 auto-approve baseline PR', () => {
  it('flags a PAT-gated auto-approve with no independent review', () => {
    const findings = strength006AutoapproveBaseline.detect(
      ctx({ workflows: [{ path: '.github/workflows/auto.yml', text: FAILING_WF }] })
    );
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.id).toBe('STRENGTH-006');
    expect(f.file).toBe('.github/workflows/auto.yml');
    expect(f.line).toBeGreaterThan(0);
    expect('severity' in f).toBe(false);
  });

  it('passes when auto-merge is gated on an approved review', () => {
    expect(
      strength006AutoapproveBaseline.detect(
        ctx({ workflows: [{ path: '.github/workflows/merge.yml', text: PASSING_WF_GATED }] })
      )
    ).toEqual([]);
  });

  it('passes a workflow with no auto-approve/merge', () => {
    expect(
      strength006AutoapproveBaseline.detect(
        ctx({ workflows: [{ path: '.github/workflows/ci.yml', text: PASSING_WF_NO_AUTO }] })
      )
    ).toEqual([]);
  });

  it('does not flag automerge that uses only the default GITHUB_TOKEN (not a PAT)', () => {
    const GITHUB_TOKEN_WF = `name: automerge
on: pull_request
jobs:
  merge:
    runs-on: ubuntu-latest
    steps:
      - run: gh pr merge --auto
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;
    expect(
      strength006AutoapproveBaseline.detect(
        ctx({ workflows: [{ path: '.github/workflows/automerge.yml', text: GITHUB_TOKEN_WF }] })
      )
    ).toEqual([]);
  });

  it('flags a real PAT-gated auto-approve even when a comment merely mentions review', () => {
    // REVIEW_SIGNAL must key on an actual review mechanism, not arbitrary comment
    // text — a `# once review is approved` note must NOT suppress the finding.
    const PAT_WITH_REVIEW_COMMENT = `name: auto-approve
on: pull_request
jobs:
  approve:
    runs-on: ubuntu-latest
    steps:
      # once review is approved this will be safe (it is not)
      - uses: hmarr/auto-approve-action@v3
        with:
          token: \${{ secrets.BASELINE_AUTOAPPROVE_PAT }}
      - run: gh pr merge --auto
`;
    const findings = strength006AutoapproveBaseline.detect(
      ctx({ workflows: [{ path: '.github/workflows/auto.yml', text: PAT_WITH_REVIEW_COMMENT }] })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.id).toBe('STRENGTH-006');
  });

  it('is not evaluable when there are no workflows', () => {
    const c = ctx({ workflows: [] });
    expect(strength006AutoapproveBaseline.evaluable?.(c)).toBe(false);
    expect(strength006AutoapproveBaseline.detect(c)).toEqual([]);
  });
});
