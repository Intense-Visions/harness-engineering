import { describe, it, expect } from 'vitest';
import type { Issue } from '@harness-engineering/types';
import { buildTaskText } from './complexity-request.js';

function makeIssue(over: Partial<Issue>): Issue {
  return {
    id: 'i1',
    identifier: 'CORE-1',
    title: 'title',
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
    ...over,
  };
}

describe('buildTaskText — pre-diff text signals (S3-001)', () => {
  it('descriptionLength counts title + description', () => {
    const t = buildTaskText(makeIssue({ title: 'abc', description: 'defg' }));
    // "abc\ndefg" trimmed = 8 chars.
    expect(t.descriptionLength).toBe(8);
    expect(t.prompt).toBe('abc\ndefg');
  });

  it('specExists reflects an attached spec path', () => {
    expect(buildTaskText(makeIssue({ spec: 'docs/spec.md' })).specExists).toBe(true);
    expect(buildTaskText(makeIssue({ spec: null })).specExists).toBe(false);
    expect(buildTaskText(makeIssue({ spec: '' })).specExists).toBe(false);
  });

  it('does NOT fabricate diff signals (no blast-radius / filesTouched pre-diff)', () => {
    const t = buildTaskText(makeIssue({ title: 'x' }));
    // RoutingTaskText carries ONLY text-phase fields; there is no diff field to leak.
    expect(Object.keys(t).sort()).toEqual(
      ['acceptanceMeasurable', 'descriptionLength', 'prompt', 'specExists'].sort()
    );
  });

  it('acceptanceMeasurable: section + enumerated items ⇒ true', () => {
    const t = buildTaskText(
      makeIssue({
        title: 'Fix thing',
        description: 'Acceptance criteria:\n- returns 200\n- logs the request',
      })
    );
    expect(t.acceptanceMeasurable).toBe(true);
  });

  it('acceptanceMeasurable: prose with no acceptance section ⇒ false', () => {
    const t = buildTaskText(
      makeIssue({
        title: 'Rework the whole subsystem',
        description: 'It should be better somehow.',
      })
    );
    expect(t.acceptanceMeasurable).toBe(false);
  });

  it('null title/description ⇒ empty prompt, zero length, no throw', () => {
    const t = buildTaskText(makeIssue({ title: '', description: null }));
    expect(t.descriptionLength).toBe(0);
    expect(t.prompt).toBe('');
    expect(t.acceptanceMeasurable).toBe(false);
  });
});
