import type { GraphStore } from '@harness-engineering/graph';
import type { ExecutionOutcome } from './types.js';

export interface OutcomeIngestResult {
  nodesAdded: number;
  edgesAdded: number;
  errors: string[];
}

/**
 * Keys the connector writes itself, the keys the effectiveness scorer reads
 * (agentPersona, result), and the structural fields carried on the
 * ExecutionOutcome contract. Caller-supplied metadata is stripped of ALL of
 * these before merge so it can never shadow a core/reserved field — including
 * conditionally-written ones like agentPersona/taskType.
 */
const RESERVED_METADATA_KEYS: ReadonlySet<string> = new Set([
  'id',
  'identifier',
  'type',
  'name',
  'result',
  'retryCount',
  'failureReasons',
  'durationMs',
  'linkedSpecId',
  'timestamp',
  'issueId',
  'agentPersona',
  'taskType',
  'affectedSystemNodeIds',
  'edges',
]);

/** Remove reserved/core keys so caller metadata can never shadow them. */
function stripReservedKeys(metadata: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!RESERVED_METADATA_KEYS.has(key)) safe[key] = value;
  }
  return safe;
}

/**
 * Ingests execution outcomes into the knowledge graph.
 *
 * Creates an 'execution_outcome' node for each outcome with metadata
 * containing result, retry count, failure reasons, duration, and linked
 * spec ID. Creates 'outcome_of' edges to each affected system node
 * that exists in the graph.
 */
export class ExecutionOutcomeConnector {
  constructor(private readonly store: GraphStore) {}

  ingest(outcome: ExecutionOutcome): OutcomeIngestResult {
    const errors: string[] = [];

    // 1. Create the outcome node
    this.store.addNode({
      id: outcome.id,
      type: 'execution_outcome',
      name: `${outcome.result}: ${outcome.identifier}`,
      metadata: {
        // Caller-supplied extras are STRIPPED of all reserved/core keys before
        // merge, so they can never shadow a core field — even conditionally-
        // written ones like agentPersona/taskType. Only genuinely additive
        // keys (e.g. verdict/confidence/source) survive.
        ...stripReservedKeys(outcome.metadata ?? {}),
        issueId: outcome.issueId,
        identifier: outcome.identifier,
        result: outcome.result,
        retryCount: outcome.retryCount,
        failureReasons: outcome.failureReasons,
        durationMs: outcome.durationMs,
        linkedSpecId: outcome.linkedSpecId,
        timestamp: outcome.timestamp,
        ...(outcome.agentPersona !== undefined && { agentPersona: outcome.agentPersona }),
        ...(outcome.taskType !== undefined && { taskType: outcome.taskType }),
      },
    });

    // 2. Create edges to affected system nodes
    let edgesAdded = 0;
    for (const systemNodeId of outcome.affectedSystemNodeIds) {
      const systemNode = this.store.getNode(systemNodeId);
      if (!systemNode) continue;
      this.store.addEdge({
        from: outcome.id,
        to: systemNodeId,
        type: 'outcome_of',
      });
      edgesAdded++;
    }

    return { nodesAdded: 1, edgesAdded, errors };
  }
}
