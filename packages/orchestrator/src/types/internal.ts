import type { Issue } from '@harness-engineering/types';

/**
 * Run attempt lifecycle phases (internal to orchestrator).
 * Tracks the current phase of a single run attempt.
 */
export type RunAttemptPhase =
  | 'PreparingWorkspace'
  | 'BuildingPrompt'
  | 'LaunchingAgent'
  | 'InitializingSession'
  | 'StreamingTurn'
  | 'Finishing'
  | 'Succeeded'
  | 'Failed'
  | 'TimedOut'
  | 'Stalled'
  | 'CanceledByReconciliation';

/**
 * Live session metadata tracked while an agent subprocess is running.
 */
export interface LiveSession {
  sessionId: string;
  backendName: string;
  agentPid: number | null;
  startedAt: string;
  lastEvent: string | null;
  lastTimestamp: string | null;
  lastMessage: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  lastReportedInputTokens: number;
  lastReportedOutputTokens: number;
  lastReportedTotalTokens: number;
  turnCount: number;
}

/**
 * Entry in the running map: one active worker.
 */
export interface RunningEntry {
  issueId: string;
  identifier: string;
  issue: Issue;
  attempt: number | null;
  workspacePath: string;
  startedAt: string;
  phase: RunAttemptPhase;
  session: LiveSession | null;
}

/**
 * Entry in the retry queue.
 */
export interface RetryEntry {
  issueId: string;
  identifier: string;
  attempt: number;
  dueAtMs: number;
  error: string | null;
}

/**
 * Token totals for observability.
 */
export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  secondsRunning: number;
}

/**
 * Rate limit snapshot (populated by agent events).
 */
export interface RateLimitSnapshot {
  requestsRemaining: number | null;
  requestsLimit: number | null;
  tokensRemaining: number | null;
  tokensLimit: number | null;
}

/**
 * Single authoritative in-memory orchestrator state.
 */
export interface OrchestratorState {
  pollIntervalMs: number;
  maxConcurrentAgents: number;
  globalCooldownUntilMs: number | null;
  recentRequestTimestamps: number[];
  globalCooldownMs: number;
  maxRequestsPerMinute: number;
  running: Map<string, RunningEntry>;
  claimed: Set<string>;
  retryAttempts: Map<string, RetryEntry>;
  completed: Set<string>;
  tokenTotals: TokenTotals;
  rateLimits: RateLimitSnapshot;
}
