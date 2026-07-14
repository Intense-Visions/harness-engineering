// packages/cli/src/commands/roadmap/triage-feature.ts
//
// Roadmap Auto-Triage — the shared LEAF for the triage command surface.
//
// This module holds the small feature/issue-mapping helpers and the brainstorm-row shape
// that BOTH `triage.ts` (the command + report cores) and `triage-approve.ts` (the pure
// go/no-go core) consume. Extracting them here breaks the former `triage.ts ↔ triage-approve.ts`
// value-import cycle: both siblings now import DOWNWARD from this leaf, and neither imports
// the other for these symbols. It is a genuine leaf — it imports only from external packages
// (`@harness-engineering/{types,orchestrator}`), never from a sibling command module.
//
// Pure move, NO behavior change: the definitions below are verbatim from the original
// `triage.ts` (re-exported there for compatibility).

import type { RoadmapFeature, Issue } from '@harness-engineering/types';
import type { TriageVerdict, WiredBrainstormResult } from '@harness-engineering/orchestrator';

/**
 * A feature is ACTIONABLE for triage when it is `planned` or `backlog` (the same eligible
 * lifecycle roadmap-pilot selects from). in-progress/done/blocked/needs-human are excluded —
 * they are not awaiting a triage decision.
 */
export function isActionable(feature: RoadmapFeature): boolean {
  return feature.status === 'planned' || feature.status === 'backlog';
}

/** Map a `RoadmapFeature` onto the unified `Issue` model the probe wiring consumes. */
export function featureToIssue(feature: RoadmapFeature): Issue {
  return {
    id: feature.name,
    identifier: feature.name,
    title: feature.name,
    description: feature.summary,
    priority: null,
    state: feature.status,
    branchName: null,
    url: null,
    labels: [],
    blockedBy: feature.blockedBy.map((b) => ({ id: b, identifier: b, state: null })),
    spec: feature.spec,
    plans: feature.plans,
    createdAt: null,
    updatedAt: feature.updatedAt ?? null,
    externalId: feature.externalId ?? null,
    assignee: feature.assignee ?? null,
  };
}

/** One brainstormed row: the item + its Phase-1 level + the wired brainstorm result. */
export interface BrainstormReportRow {
  externalId: string;
  name: string;
  status: string;
  /** The Phase-1 complexity level that scaled the brainstorm depth. */
  level: TriageVerdict['verdict']['level'];
  result: WiredBrainstormResult;
}
