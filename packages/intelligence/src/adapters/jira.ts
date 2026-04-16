import type { RawWorkItem } from '../types.js';

/**
 * JIRA issue link reference.
 */
export interface JiraIssueLink {
  type: { name: string };
  inwardIssue?: { id: string; key: string };
  outwardIssue?: { id: string; key: string };
}

/**
 * JIRA comment entry.
 */
export interface JiraComment {
  body: string;
  author: { displayName: string };
}

/**
 * Minimal JIRA issue shape accepted by the adapter.
 * Represents pre-fetched data from the JIRA REST API.
 */
export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: string | null;
    labels: string[];
    priority: { id: string; name: string } | null;
    status: { id: string; name: string };
    issuetype: { id: string; name: string };
    created: string;
    updated: string;
    issuelinks: JiraIssueLink[];
    comment: { comments: JiraComment[] };
  };
}

/**
 * Convert a pre-fetched JIRA issue into a generic RawWorkItem.
 */
export function jiraToRawWorkItem(issue: JiraIssue): RawWorkItem {
  const linkedItems: string[] = [];
  for (const link of issue.fields.issuelinks) {
    if (link.inwardIssue) linkedItems.push(link.inwardIssue.id);
    if (link.outwardIssue) linkedItems.push(link.outwardIssue.id);
  }

  return {
    id: issue.id,
    title: issue.fields.summary,
    description: issue.fields.description,
    labels: issue.fields.labels,
    metadata: {
      key: issue.key,
      priority: issue.fields.priority,
      status: issue.fields.status,
      issuetype: issue.fields.issuetype,
      created: issue.fields.created,
      updated: issue.fields.updated,
    },
    linkedItems,
    comments: issue.fields.comment.comments.map((c) => c.body),
    source: 'jira',
  };
}
