/**
 * Execution outcome -- result of a worker running an issue.
 * Ingested into the graph as an 'execution_outcome' node.
 */
export interface ExecutionOutcome {
  /** Unique ID for this outcome (e.g., `outcome:<issueId>:<attempt>`) */
  id: string;
  /** ID of the issue that was executed */
  issueId: string;
  /** Human-readable identifier (e.g., 'PROJ-123') */
  identifier: string;
  /** Execution result */
  result: 'success' | 'failure';
  /** Number of retry attempts before this outcome */
  retryCount: number;
  /** Failure reasons (empty for success) */
  failureReasons: string[];
  /** Execution duration in milliseconds */
  durationMs: number;
  /** ID of the linked EnrichedSpec, if one was produced */
  linkedSpecId: string | null;
  /** Affected system graph node IDs from the enriched spec */
  affectedSystemNodeIds: string[];
  /** ISO timestamp of when the outcome was recorded */
  timestamp: string;
}
