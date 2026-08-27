import type { Issue, WorkflowExecutionPlan, StageRun } from '@harness-engineering/types';
import type { BudgetState } from '../core/budget-governor';

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
  | 'RateLimitSleeping'
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
  /**
   * AMR Phase 4 (D10/SC16): the tier the AdaptiveRouter resolved this dispatch
   * at (`decision.tierRequired`), captured so a later quality outcome can feed
   * `AdaptiveRouter.recordOutcome(issue.id, lastRoutedTier, ok)`. Absent when
   * AMR is off (no policy) or the dispatch used an override.
   */
  lastRoutedTier?: import('@harness-engineering/types').CapabilityTier;
  /** split-routing: the plan this unit is running staged, if any. Engine-owned. */
  workflow?: WorkflowExecutionPlan;
  /** split-routing: the stage index currently executing. Engine-owned. */
  currentStageIndex?: number;
  /**
   * split-routing: per-stage runs. The per-stage session/abort live HERE
   * (C1), never in the issue-level `session` field above.
   */
  stageRuns?: StageRun[];
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
  cacheReadTokens: number;
  cacheCreationTokens: number;
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
  recentInputTokens: { timestamp: number; tokens: number }[];
  recentOutputTokens: { timestamp: number; tokens: number }[];
  globalCooldownMs: number;
  maxRequestsPerMinute: number;
  maxRequestsPerSecond: number;
  maxInputTokensPerMinute: number;
  maxOutputTokensPerMinute: number;
  running: Map<string, RunningEntry>;
  claimed: Set<string>;
  retryAttempts: Map<string, RetryEntry>;
  /**
   * Tracks completed issue IDs mapped to the epoch-ms timestamp when the
   * completion was recorded. The timestamp enables a grace-period so that
   * issues manually re-activated in the roadmap can be re-dispatched, while
   * still guarding against duplicate dispatch on the tick immediately after
   * completion (when the tracker write-back may not have persisted yet).
   */
  completed: Map<string, number>;
  tokenTotals: TokenTotals;
  rateLimits: RateLimitSnapshot;
  /** Running count of claim rejections (another orchestrator won the race). */
  claimRejections: number;
  /**
   * Unattended-dispatch spend envelope accumulator (#1525), or `null` when no
   * `agent.budget` is configured (governor off — unbounded dispatch). When
   * present, `canDispatch` refuses a NEW lane once the period envelope is spent.
   */
  budget: BudgetState | null;
}
