import { randomUUID } from 'node:crypto';
import type { GraphStore } from '@harness-engineering/graph';
import { ExecutionOutcomeConnector } from '../outcome/connector.js';
import type { OutcomeIngestResult } from '../outcome/connector.js';
import type { ExecutionOutcome } from '../outcome/types.js';
import type { UatSignoffInput } from './types.js';

/**
 * The source tag stamped on every node this recorder writes. The eval-fail-rate
 * signal and effectiveness scorer key off `metadata.result` + `metadata.timestamp`
 * only; `source` lets a consumer distinguish a HUMAN UAT sign-off from an
 * LLM-judged outcome-eval verdict.
 */
export const UAT_SIGNOFF_SOURCE = 'uat-signoff' as const;

/**
 * Map a human UAT sign-off onto the shared `execution_outcome` contract. Pure —
 * no I/O, no LLM.
 *
 * UNLIKE outcome-eval there is NO derived authority: the human IS the authority,
 * so `result` is read straight from the human's overall decision
 * (`ACCEPTED` -> success; `REJECTED` / `CHANGES_REQUESTED` -> failure). Nothing
 * here blocks a merge or ship — the record is advisory.
 *
 * - `id`: one node per sign-off; a collision-free `randomUUID()` means two
 *   sign-offs in the same millisecond can never overwrite each other.
 * - `affectedSystemNodeIds`: `[]` — a sign-off records intent-vs-reality
 *   acceptance, not a code-node blast radius, so it seeds no `outcome_of` edges.
 * - `failureReasons`: the ids of items the human did NOT accept, so a downstream
 *   reader sees what blocked acceptance without re-reading `signoff.md`.
 * - `metadata`: the human decision carried additively (decision / signedOffBy /
 *   brdRefs / items / source). Reserved core keys (result / timestamp / …) are
 *   written by the connector and can never be shadowed by this metadata.
 */
export function toUatExecutionOutcome(input: UatSignoffInput): ExecutionOutcome {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const rejectedItemIds = input.items
    .filter((item) => item.disposition !== 'ACCEPT')
    .map((item) => item.id);
  return {
    id: `outcome:uat-signoff:${input.engagement}:${randomUUID()}`,
    issueId: 'uat-signoff',
    identifier: `uat-signoff:${input.engagement}`,
    result: input.decision === 'ACCEPTED' ? 'success' : 'failure',
    retryCount: 0,
    failureReasons: rejectedItemIds,
    // 0 means "not applicable" — a human sign-off does not time work.
    durationMs: 0,
    linkedSpecId: null,
    affectedSystemNodeIds: [],
    timestamp,
    metadata: {
      source: UAT_SIGNOFF_SOURCE,
      decision: input.decision,
      signedOffBy: input.signedOffBy,
      brdRefs: input.brdRefs ?? [],
      items: input.items,
    },
  };
}

/**
 * Records a human UAT sign-off as a single `execution_outcome` node via the
 * shared `ExecutionOutcomeConnector`. Record-only / advisory: it never blocks
 * and never derives a verdict — it durably captures the decision the human
 * already made so signals and effectiveness baselines can consume it.
 */
export class UatSignoffRecorder {
  constructor(private readonly store: GraphStore) {}

  record(input: UatSignoffInput): { outcomeId: string; ingest: OutcomeIngestResult } {
    const outcome = toUatExecutionOutcome(input);
    const ingest = new ExecutionOutcomeConnector(this.store).ingest(outcome);
    return { outcomeId: outcome.id, ingest };
  }
}
