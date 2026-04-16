import type { RawWorkItem } from '../types.js';

/**
 * Linear label shape.
 */
export interface LinearLabel {
  id: string;
  name: string;
}

/**
 * Linear comment shape.
 */
export interface LinearComment {
  body: string;
  user: { name: string };
}

/**
 * Linear relation shape (blocking/blocked-by/related).
 */
export interface LinearRelation {
  type: string;
  relatedIssue: { id: string; identifier: string };
}

/**
 * Minimal Linear issue shape accepted by the adapter.
 * Represents pre-fetched data from the Linear GraphQL API.
 */
export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number;
  state: { id: string; name: string };
  labels: { nodes: LinearLabel[] };
  createdAt: string;
  updatedAt: string;
  url: string;
  branchName: string | null;
  comments: { nodes: LinearComment[] };
  relations: { nodes: LinearRelation[] };
}

/**
 * Convert a pre-fetched Linear issue into a generic RawWorkItem.
 */
export function linearToRawWorkItem(issue: LinearIssue): RawWorkItem {
  return {
    id: issue.id,
    title: issue.title,
    description: issue.description,
    labels: issue.labels.nodes.map((l) => l.name),
    metadata: {
      identifier: issue.identifier,
      priority: issue.priority,
      state: issue.state,
      url: issue.url,
      branchName: issue.branchName,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    },
    linkedItems: issue.relations.nodes.map((r) => r.relatedIssue.id),
    comments: issue.comments.nodes.map((c) => c.body),
    source: 'linear',
  };
}
