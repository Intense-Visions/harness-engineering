import { describe, it, expect } from 'vitest';
import { githubToRawWorkItem, type GitHubIssue } from '../../src/adapters/github.js';

function makeGitHubIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    id: 123456,
    number: 42,
    title: 'Add dark mode support',
    body: 'Users have requested a dark mode option in the settings panel.',
    labels: [
      { id: 1, name: 'enhancement' },
      { id: 2, name: 'ui' },
    ],
    state: 'open',
    html_url: 'https://github.com/org/repo/issues/42',
    created_at: '2026-04-10T10:00:00Z',
    updated_at: '2026-04-14T12:00:00Z',
    pull_request: null,
    milestone: { id: 1, title: 'v2.0' },
    assignees: [{ login: 'alice' }, { login: 'bob' }],
    comments_data: [
      { body: 'Would love this feature!', user: { login: 'charlie' } },
      { body: 'I can work on this.', user: { login: 'alice' } },
    ],
    linked_issues: [101, 102],
    ...overrides,
  };
}

describe('githubToRawWorkItem', () => {
  it('maps all GitHub issue fields correctly', () => {
    const gh = makeGitHubIssue();
    const raw = githubToRawWorkItem(gh);

    expect(raw.id).toBe('123456');
    expect(raw.title).toBe('Add dark mode support');
    expect(raw.description).toBe('Users have requested a dark mode option in the settings panel.');
    expect(raw.labels).toEqual(['enhancement', 'ui']);
    expect(raw.source).toBe('github');
    expect(raw.comments).toEqual(['Would love this feature!', 'I can work on this.']);
    expect(raw.linkedItems).toEqual(['101', '102']);
    expect(raw.metadata).toEqual({
      number: 42,
      state: 'open',
      html_url: 'https://github.com/org/repo/issues/42',
      created_at: '2026-04-10T10:00:00Z',
      updated_at: '2026-04-14T12:00:00Z',
      isPullRequest: false,
      milestone: { id: 1, title: 'v2.0' },
      assignees: ['alice', 'bob'],
    });
  });

  it('handles null body', () => {
    const gh = makeGitHubIssue({ body: null });
    const raw = githubToRawWorkItem(gh);
    expect(raw.description).toBeNull();
  });

  it('handles empty labels', () => {
    const gh = makeGitHubIssue({ labels: [] });
    const raw = githubToRawWorkItem(gh);
    expect(raw.labels).toEqual([]);
  });

  it('handles empty comments', () => {
    const gh = makeGitHubIssue({ comments_data: [] });
    const raw = githubToRawWorkItem(gh);
    expect(raw.comments).toEqual([]);
  });

  it('handles empty linked issues', () => {
    const gh = makeGitHubIssue({ linked_issues: [] });
    const raw = githubToRawWorkItem(gh);
    expect(raw.linkedItems).toEqual([]);
  });

  it('detects pull requests via pull_request field', () => {
    const gh = makeGitHubIssue({
      pull_request: { url: 'https://api.github.com/repos/org/repo/pulls/42' },
    });
    const raw = githubToRawWorkItem(gh);
    expect(raw.metadata.isPullRequest).toBe(true);
  });

  it('handles null milestone', () => {
    const gh = makeGitHubIssue({ milestone: null });
    const raw = githubToRawWorkItem(gh);
    expect(raw.metadata.milestone).toBeNull();
  });
});
