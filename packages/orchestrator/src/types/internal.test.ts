import { describe, it, expect } from 'vitest';
import type { RunningEntry } from './internal';

describe('RunningEntry workflow fields (split-routing P1)', () => {
  it('accepts optional workflow/currentStageIndex/stageRuns; non-workflow entries omit them', () => {
    // Non-workflow entries simply omit the field (exactOptionalPropertyTypes:
    // true means `workflow?` does not accept an explicit `undefined`).
    const nonWorkflow: Partial<RunningEntry> = { issueId: 'i' };
    const workflowEntry: Partial<RunningEntry> = {
      issueId: 'i',
      currentStageIndex: 1,
      stageRuns: [{ index: 0, step: { skill: 's', produces: 'a' } }],
    };
    expect(nonWorkflow.workflow).toBeUndefined();
    expect(workflowEntry.stageRuns).toHaveLength(1);
  });
});
