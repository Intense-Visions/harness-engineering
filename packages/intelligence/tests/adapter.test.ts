import { describe, it, expect } from 'vitest';
import type { Issue } from '@harness-engineering/types';
import { toRawWorkItem } from '../src/adapter.js';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'issue-1',
    identifier: 'CORE-42',
    title: 'Implement adapter',
    description: 'Full description of the work item',
    priority: 2,
    state: 'in_progress',
    branchName: 'feat/adapter',
    url: 'https://tracker.example.com/CORE-42',
    labels: ['backend', 'pipeline'],
    blockedBy: [
      { id: 'blocker-1', identifier: 'CORE-10', state: 'done' },
      { id: 'blocker-2', identifier: 'CORE-11', state: 'in_progress' },
    ],
    spec: null,
    plans: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-04-14T12:00:00Z',
    externalId: null,
    ...overrides,
  };
}

describe('toRawWorkItem', () => {
  it('maps all Issue fields correctly', () => {
    const issue = makeIssue();
    const raw = toRawWorkItem(issue);

    expect(raw.id).toBe('issue-1');
    expect(raw.title).toBe('Implement adapter');
    expect(raw.description).toBe('Full description of the work item');
    expect(raw.labels).toEqual(['backend', 'pipeline']);
    expect(raw.source).toBe('roadmap');
    expect(raw.comments).toEqual([]);

    expect(raw.metadata).toEqual({
      identifier: 'CORE-42',
      priority: 2,
      state: 'in_progress',
      branchName: 'feat/adapter',
      url: 'https://tracker.example.com/CORE-42',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-04-14T12:00:00Z',
    });

    expect(raw.linkedItems).toEqual(['blocker-1', 'blocker-2']);
  });

  it('handles null description', () => {
    const issue = makeIssue({ description: null });
    const raw = toRawWorkItem(issue);

    expect(raw.description).toBeNull();
  });

  it('handles empty labels', () => {
    const issue = makeIssue({ labels: [] });
    const raw = toRawWorkItem(issue);

    expect(raw.labels).toEqual([]);
  });

  it('maps blockedBy to linkedItems filtering null IDs', () => {
    const issue = makeIssue({
      blockedBy: [
        { id: 'blocker-1', identifier: 'CORE-10', state: 'done' },
        { id: null, identifier: 'CORE-99', state: 'backlog' },
        { id: 'blocker-3', identifier: null, state: null },
      ],
    });
    const raw = toRawWorkItem(issue);

    expect(raw.linkedItems).toEqual(['blocker-1', 'blocker-3']);
  });

  it('empty blockedBy maps to empty linkedItems', () => {
    const issue = makeIssue({ blockedBy: [] });
    const raw = toRawWorkItem(issue);

    expect(raw.linkedItems).toEqual([]);
  });
});
