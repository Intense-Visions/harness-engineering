import type { RawWorkItem } from '../types.js';

/**
 * GitHub label shape.
 */
export interface GitHubLabel {
  id: number;
  name: string;
}

/**
 * GitHub comment shape.
 */
export interface GitHubComment {
  body: string;
  user: { login: string };
}

/**
 * Minimal GitHub issue/PR shape accepted by the adapter.
 * Represents pre-fetched data from the GitHub REST or GraphQL API.
 */
export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  labels: GitHubLabel[];
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  pull_request: { url: string } | null;
  milestone: { id: number; title: string } | null;
  assignees: { login: string }[];
  comments_data: GitHubComment[];
  linked_issues: number[];
}

/**
 * Convert a pre-fetched GitHub issue or PR into a generic RawWorkItem.
 */
export function githubToRawWorkItem(issue: GitHubIssue): RawWorkItem {
  return {
    id: String(issue.id),
    title: issue.title,
    description: issue.body,
    labels: issue.labels.map((l) => l.name),
    metadata: {
      number: issue.number,
      state: issue.state,
      html_url: issue.html_url,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      isPullRequest: issue.pull_request != null,
      milestone: issue.milestone,
      assignees: issue.assignees.map((a) => a.login),
    },
    linkedItems: issue.linked_issues.map(String),
    comments: issue.comments_data.map((c) => c.body),
    source: 'github',
  };
}
