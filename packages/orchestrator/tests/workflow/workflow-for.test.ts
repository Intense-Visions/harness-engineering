import { describe, it, expect } from 'vitest';
import { workflowFor } from '../../src/workflow/workflow-for.js';
import type { Issue, WorkflowConfig } from '@harness-engineering/types';

/** Minimal Issue fixture — workflowFor only reads id/identifier/labels. */
function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'issue-1',
    identifier: 'REV-42',
    title: 't',
    description: null,
    priority: null,
    state: 'planned',
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    spec: null,
    plans: [],
    createdAt: null,
    updatedAt: null,
    externalId: null,
    ...overrides,
  };
}

/** A config whose only relevant field for workflowFor is `workflows`. */
function makeConfig(workflows?: WorkflowConfig['workflows']): WorkflowConfig {
  return { workflows } as WorkflowConfig;
}

const twoStages = [
  { skill: 'review', produces: 'review-notes' },
  {
    skill: 'implement',
    produces: 'patch',
    expects: 'review-notes',
    gate: 'pass-required' as const,
  },
];
const oneStage = [{ skill: 'review', produces: 'review-notes' }];

describe('workflowFor (SC4 / D5 / D13)', () => {
  it('returns undefined when config declares no workflows', () => {
    expect(workflowFor(makeIssue(), makeConfig(undefined))).toBeUndefined();
    expect(workflowFor(makeIssue(), makeConfig([]))).toBeUndefined();
  });

  it('D5: returns a plan for the first matching decl with >= 2 stages', () => {
    const config = makeConfig([
      { name: 'w', match: { identifierPrefix: 'REV-' }, stages: twoStages },
    ]);
    const plan = workflowFor(makeIssue({ id: 'issue-1', identifier: 'REV-42' }), config);
    expect(plan).toEqual({ coherenceUnit: 'issue-1', stages: twoStages });
  });

  it('D13: a matching 1-stage decl returns undefined (single dispatch)', () => {
    const config = makeConfig([
      { name: 'w', match: { identifierPrefix: 'REV-' }, stages: oneStage },
    ]);
    expect(workflowFor(makeIssue({ identifier: 'REV-42' }), config)).toBeUndefined();
  });

  it('returns undefined when identifierPrefix does not match', () => {
    const config = makeConfig([
      { name: 'w', match: { identifierPrefix: 'BUG-' }, stages: twoStages },
    ]);
    expect(workflowFor(makeIssue({ identifier: 'REV-42' }), config)).toBeUndefined();
  });

  it('matches by labels (all declared labels must be present)', () => {
    const config = makeConfig([{ name: 'w', match: { labels: ['staged'] }, stages: twoStages }]);
    expect(workflowFor(makeIssue({ labels: ['staged', 'x'] }), config)).toEqual({
      coherenceUnit: 'issue-1',
      stages: twoStages,
    });
    // missing the required label ⇒ no match
    expect(workflowFor(makeIssue({ labels: ['x'] }), config)).toBeUndefined();
  });

  it('requires BOTH identifierPrefix AND labels when both are declared', () => {
    const config = makeConfig([
      { name: 'w', match: { identifierPrefix: 'REV-', labels: ['staged'] }, stages: twoStages },
    ]);
    // prefix matches but label missing ⇒ no match
    expect(workflowFor(makeIssue({ identifier: 'REV-1', labels: [] }), config)).toBeUndefined();
    // both match ⇒ plan
    expect(
      workflowFor(makeIssue({ identifier: 'REV-1', labels: ['staged'] }), config)
    ).toBeDefined();
  });

  it('SC4 purity: no throw, no mutation, deterministic on repeat calls', () => {
    const issue = makeIssue({ identifier: 'REV-9', labels: ['staged'] });
    const config = makeConfig([
      { name: 'w', match: { identifierPrefix: 'REV-', labels: ['staged'] }, stages: twoStages },
    ]);
    Object.freeze(issue);
    Object.freeze(issue.labels);
    Object.freeze(config);
    Object.freeze(config.workflows);

    const before = JSON.stringify({ issue, config });
    const first = workflowFor(issue, config);
    const second = workflowFor(issue, config);
    const after = JSON.stringify({ issue, config });

    expect(after).toBe(before); // no mutation of frozen inputs
    expect(first).toEqual(second); // deterministic
    expect(first).toBeDefined();
  });
});
