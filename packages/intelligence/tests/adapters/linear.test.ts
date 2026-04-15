import { describe, it, expect } from 'vitest';
import { linearToRawWorkItem } from '../../src/adapters/linear.js';
import type { LinearIssue } from '../../src/adapters/linear.js';

function makeLinearIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: 'lin-abc-123',
    identifier: 'ENG-42',
    title: 'Refactor auth module',
    description: 'Refactor the auth module for better testability',
    priority: 2,
    state: { id: 'state-1', name: 'In Progress' },
    labels: {
      nodes: [
        { id: 'l1', name: 'backend' },
        { id: 'l2', name: 'tech-debt' },
      ],
    },
    createdAt: '2026-04-10T10:00:00Z',
    updatedAt: '2026-04-12T14:00:00Z',
    url: 'https://linear.app/team/issue/ENG-42',
    branchName: 'eng-42-refactor-auth',
    comments: { nodes: [{ body: 'Looking good', user: { name: 'Alice' } }] },
    relations: {
      nodes: [{ type: 'blocks', relatedIssue: { id: 'lin-def-456', identifier: 'ENG-43' } }],
    },
    ...overrides,
  };
}

describe('linearToRawWorkItem', () => {
  it('maps all Linear issue fields correctly', () => {
    const result = linearToRawWorkItem(makeLinearIssue());

    expect(result.id).toBe('lin-abc-123');
    expect(result.title).toBe('Refactor auth module');
    expect(result.description).toBe('Refactor the auth module for better testability');
    expect(result.labels).toEqual(['backend', 'tech-debt']);
    expect(result.source).toBe('linear');
    expect(result.comments).toEqual(['Looking good']);
    expect(result.linkedItems).toEqual(['lin-def-456']);
    expect(result.metadata).toEqual({
      identifier: 'ENG-42',
      priority: 2,
      state: { id: 'state-1', name: 'In Progress' },
      url: 'https://linear.app/team/issue/ENG-42',
      branchName: 'eng-42-refactor-auth',
      createdAt: '2026-04-10T10:00:00Z',
      updatedAt: '2026-04-12T14:00:00Z',
    });
  });

  it('handles null description', () => {
    const result = linearToRawWorkItem(makeLinearIssue({ description: null }));
    expect(result.description).toBeNull();
  });

  it('handles empty labels', () => {
    const result = linearToRawWorkItem(makeLinearIssue({ labels: { nodes: [] } }));
    expect(result.labels).toEqual([]);
  });

  it('handles empty relations', () => {
    const result = linearToRawWorkItem(makeLinearIssue({ relations: { nodes: [] } }));
    expect(result.linkedItems).toEqual([]);
  });

  it('handles null branchName', () => {
    const result = linearToRawWorkItem(makeLinearIssue({ branchName: null }));
    expect(result.metadata.branchName).toBeNull();
  });

  it('maps multiple relations', () => {
    const result = linearToRawWorkItem(
      makeLinearIssue({
        relations: {
          nodes: [
            { type: 'blocks', relatedIssue: { id: 'a', identifier: 'A-1' } },
            { type: 'related', relatedIssue: { id: 'b', identifier: 'B-2' } },
          ],
        },
      })
    );
    expect(result.linkedItems).toEqual(['a', 'b']);
  });
});
