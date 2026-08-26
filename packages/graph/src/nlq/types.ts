import type { GraphNode, NodeType } from '../types.js';

/**
 * All supported intent categories for natural language graph queries.
 * Runtime-accessible array mirroring NODE_TYPES / EDGE_TYPES pattern.
 */
export const INTENTS = [
  'impact',
  'find',
  'relationships',
  'explain',
  'anomaly',
  'staleness',
] as const;

/**
 * Intent categories for natural language graph queries.
 */
export type Intent = (typeof INTENTS)[number];

/**
 * Result of classifying a natural language question into an intent.
 */
export interface ClassificationResult {
  readonly intent: Intent;
  readonly confidence: number; // 0-1
  readonly signals: Readonly<Record<string, number>>; // signal name -> score
}

/**
 * An entity mention from the query resolved to a graph node.
 */
export interface ResolvedEntity {
  readonly raw: string; // original mention from query
  readonly nodeId: string; // resolved graph node ID
  readonly node: GraphNode;
  readonly confidence: number; // 0-1
  readonly method: 'exact' | 'fusion' | 'path'; // which cascade step matched
}

/**
 * One stale knowledge node in a `staleness` query result.
 */
export interface StaleNodeSummary {
  readonly nodeId: string;
  readonly type: NodeType;
  readonly name: string;
  readonly missingReferences: readonly string[];
  readonly detectedAt: string;
}

/**
 * Result of a `staleness` intent query: the flagged nodes plus the total number of
 * knowledge nodes (learning + execution_outcome) considered — the denominator, so an
 * empty `stale` list on a populated graph reads as "nothing stale" rather than
 * "nothing to inspect".
 */
export interface StalenessQueryResult {
  readonly stale: readonly StaleNodeSummary[];
  readonly evaluated: number;
}

/**
 * Complete result from askGraph, including intent, entities, summary, and raw data.
 */
export interface AskGraphResult {
  readonly intent: Intent;
  readonly intentConfidence: number;
  readonly entities: readonly ResolvedEntity[];
  readonly summary: string; // human-readable answer
  readonly data: unknown; // raw graph result (same shape as underlying tool)
  readonly suggestions?: readonly string[]; // if confidence is low, suggest rephrased queries
}
