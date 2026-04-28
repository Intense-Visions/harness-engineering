import type { DashboardFeature } from '@shared/types';

/** Sentinel value used in roadmap markdown for empty fields. */
export const EM_DASH = '\u2014';

export type ClaimWorkflow = 'brainstorming' | 'planning' | 'execution';

/** A feature is workable if it's planned/backlog with no assignee. */
export function isWorkable(feature: DashboardFeature): boolean {
  return (
    (feature.status === 'planned' || feature.status === 'backlog') &&
    (!feature.assignee || feature.assignee === EM_DASH)
  );
}

/** Determine the harness workflow based on feature state. */
export function detectWorkflow(feature: DashboardFeature): ClaimWorkflow {
  if (!feature.spec || feature.spec === 'none' || feature.spec === EM_DASH) return 'brainstorming';
  if (
    !feature.plans ||
    feature.plans.length === 0 ||
    (feature.plans.length === 1 && feature.plans[0] === EM_DASH)
  )
    return 'planning';
  return 'execution';
}

/** Parse a github externalId like "github:owner/repo#42" into a URL. */
export function externalIdToUrl(externalId: string): string | null {
  const match = externalId.match(/^github:(.+?)#(\d+)$/);
  if (!match) return null;
  return `https://github.com/${match[1]}/issues/${match[2]}`;
}
