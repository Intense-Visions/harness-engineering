import type { Issue } from '@harness-engineering/types';
import type { RawWorkItem } from './types.js';

/**
 * Convert an orchestrator Issue into a generic RawWorkItem for the intelligence pipeline.
 */
export function toRawWorkItem(issue: Issue): RawWorkItem {
  return {
    id: issue.id,
    title: issue.title,
    description: issue.description,
    labels: issue.labels,
    metadata: {
      identifier: issue.identifier,
      priority: issue.priority,
      state: issue.state,
      branchName: issue.branchName,
      url: issue.url,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    },
    linkedItems: issue.blockedBy.filter((b) => b.id != null).map((b) => b.id!),
    comments: [],
    source: 'roadmap',
  };
}
