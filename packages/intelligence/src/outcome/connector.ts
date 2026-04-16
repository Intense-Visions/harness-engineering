import type { GraphStore } from '@harness-engineering/graph';
import type { ExecutionOutcome } from './types.js';

export interface OutcomeIngestResult {
  nodesAdded: number;
  edgesAdded: number;
  errors: string[];
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
        issueId: outcome.issueId,
        identifier: outcome.identifier,
        result: outcome.result,
        retryCount: outcome.retryCount,
        failureReasons: outcome.failureReasons,
        durationMs: outcome.durationMs,
        linkedSpecId: outcome.linkedSpecId,
        timestamp: outcome.timestamp,
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
