import type { LocalModelStatus, NamedLocalModelStatus } from '@harness-engineering/types';

export type { LocalModelStatus, NamedLocalModelStatus };

/** Minimal session info for display in the agent monitor. */
export interface AgentSession {
  backendName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  turnCount: number;
  lastMessage: string | null;
}

/** A running agent entry from the orchestrator snapshot. */
export interface RunningAgent {
  issueId: string;
  identifier: string;
  phase: string;
  startedAt: string;
  issue: {
    title: string;
    description: string | null;
  };
  session: AgentSession | null;
}

/** Token usage totals. */
export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  secondsRunning: number;
}

/** Timestamped token record for rate tracking. */
export interface TimestampedTokens {
  timestamp: number;
  tokens: number;
}

/** Retry queue entry. */
export interface RetryEntry {
  issueId: string;
  identifier: string;
  attempt: number;
  dueAtMs: number;
  error: string | null;
}

/** Current tick-cycle activity (intelligence pipeline, fetching, etc.). */
export interface TickActivity {
  phase: 'idle' | 'fetching' | 'analyzing' | 'dispatching';
  detail: string | null;
  progress: { current: number; total: number } | null;
}

/**
 * Point-in-time orchestrator state snapshot.
 * Shape matches the JSON returned by GET /api/v1/state
 * and broadcast via WebSocket state_change events.
 */
export interface OrchestratorSnapshot {
  running: Array<[string, RunningAgent]>;
  retryAttempts: Array<[string, RetryEntry]>;
  claimed: string[];
  tokenTotals: TokenTotals;
  maxConcurrentAgents: number;
  globalCooldownUntilMs: number | null;
  recentRequestTimestamps: number[];
  recentInputTokens: TimestampedTokens[];
  recentOutputTokens: TimestampedTokens[];
  maxRequestsPerMinute: number;
  maxRequestsPerSecond: number;
  maxInputTokensPerMinute: number;
  maxOutputTokensPerMinute: number;
  tickActivity?: TickActivity;
}

/** Enriched spec subset attached to escalated interactions. */
export interface InteractionEnrichedSpec {
  intent: string;
  summary: string;
  affectedSystems: Array<{
    name: string;
    graphNodeId: string | null;
    confidence: number;
    transitiveDeps: string[];
    testCoverage: number;
    owner: string | null;
  }>;
  unknowns: string[];
  ambiguities: string[];
  riskSignals: string[];
}

/** Complexity score subset attached to escalated interactions. */
export interface InteractionComplexityScore {
  overall: number;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  blastRadius: {
    services: number;
    modules: number;
    filesEstimated: number;
    testFilesAffected: number;
  };
  dimensions: {
    structural: number;
    semantic: number;
    historical: number;
  };
  reasoning: string[];
  recommendedRoute: 'local' | 'human' | 'simulation-required';
}

/** Interaction context provided for human review. */
export interface InteractionContext {
  issueTitle: string;
  issueDescription: string | null;
  specPath: string | null;
  planPath: string | null;
  relatedFiles: string[];
  enrichedSpec?: InteractionEnrichedSpec;
  complexityScore?: InteractionComplexityScore;
}

/** A pending human interaction from the interaction queue. */
export interface PendingInteraction {
  id: string;
  issueId: string;
  type: 'needs-human';
  reasons: string[];
  context: InteractionContext;
  createdAt: string;
  status: 'pending' | 'claimed' | 'resolved';
}

/** An event emitted by a running agent, forwarded via WebSocket. */
export interface AgentEventMessage {
  issueId: string;
  event: {
    type: string;
    timestamp: string;
    subtype?: string;
    content?: string;
    sessionId?: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Maintenance WebSocket event payloads                               */
/* ------------------------------------------------------------------ */

/** Payload for `maintenance:started` events. */
export interface MaintenanceStartedPayload {
  taskId: string;
  startedAt: string;
}

/** Payload for `maintenance:error` events. */
export interface MaintenanceErrorPayload {
  taskId: string;
  error?: string;
}

/** Payload for `maintenance:completed` events (full RunResult shape). */
export interface MaintenanceCompletedPayload {
  taskId: string;
  startedAt: string;
  completedAt: string;
  status: 'success' | 'failure' | 'skipped' | 'no-issues';
  findings: number;
  fixed: number;
  prUrl: string | null;
  prUpdated: boolean;
  error?: string;
}

/** Union of all maintenance event payloads for convenience. */
export type MaintenanceEvent =
  | { type: 'maintenance:started'; data: MaintenanceStartedPayload }
  | { type: 'maintenance:error'; data: MaintenanceErrorPayload }
  | { type: 'maintenance:completed'; data: MaintenanceCompletedPayload };

/** Discriminated union for WebSocket messages from the orchestrator server. */
export type WebSocketMessage =
  | { type: 'state_change'; data: OrchestratorSnapshot }
  | { type: 'interaction_new'; data: PendingInteraction }
  | { type: 'agent_event'; data: AgentEventMessage }
  | { type: 'maintenance:started'; data: MaintenanceStartedPayload }
  | { type: 'maintenance:error'; data: MaintenanceErrorPayload }
  | { type: 'maintenance:completed'; data: MaintenanceCompletedPayload }
  | { type: 'local-model:status'; data: NamedLocalModelStatus };

/** SSE event types from the chat proxy endpoint. */
export type ChatSSEEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; tool: string; args?: string }
  | { type: 'tool_args_delta'; text: string }
  | { type: 'tool_result'; content: string; isError?: boolean }
  | { type: 'status'; text: string }
  | { type: 'error'; error: string };

/** SSE event types from the /api/analyze endpoint. */
export type AnalyzeSSEEvent =
  | { type: 'status'; text: string }
  | { type: 'sel_result'; data: Record<string, unknown> }
  | { type: 'cml_result'; data: Record<string, unknown> }
  | { type: 'pesl_result'; data: Record<string, unknown> }
  | { type: 'signals'; data: Array<{ name: string; reason: string }> }
  | { type: 'error'; error: string };
