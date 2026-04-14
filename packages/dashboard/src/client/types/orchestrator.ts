/** Minimal session info for display in the agent monitor. */
export interface AgentSession {
  backendName: string;
  totalTokens: number;
  turnCount: number;
  lastMessage: string | null;
}

/** A running agent entry from the orchestrator snapshot. */
export interface RunningAgent {
  issueId: string;
  identifier: string;
  phase: string;
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
}

/** Interaction context provided for human review. */
export interface InteractionContext {
  issueTitle: string;
  issueDescription: string | null;
  specPath: string | null;
  planPath: string | null;
  relatedFiles: string[];
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

/** Discriminated union for WebSocket messages from the orchestrator server. */
export type WebSocketMessage =
  | { type: 'state_change'; data: OrchestratorSnapshot }
  | { type: 'interaction_new'; data: PendingInteraction }
  | { type: 'agent_event'; data: unknown };

/** SSE event types from the chat proxy endpoint. */
export type ChatSSEEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; tool: string; args?: string }
  | { type: 'tool_result'; content: string; isError?: boolean }
  | { type: 'status'; text: string }
  | { type: 'error'; error: string };
