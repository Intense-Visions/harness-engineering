import type { Issue, AgentEvent, TokenUsage } from '@harness-engineering/types';

/**
 * Discriminated union of events that drive the orchestrator state machine.
 * All events are data -- the caller constructs them from I/O results.
 */
export type OrchestratorEvent =
  | TickEvent
  | WorkerExitEvent
  | AgentUpdateEvent
  | RetryFiredEvent
  | StallDetectedEvent;

export interface TickEvent {
  type: 'tick';
  candidates: Issue[];
  runningStates: Map<string, Issue>;
  /** Caller-supplied wall clock (ms since epoch). Keeps state machine pure. */
  nowMs: number;
}

export interface WorkerExitEvent {
  type: 'worker_exit';
  issueId: string;
  reason: 'normal' | 'error';
  error?: string | undefined;
  attempt: number | null;
}

export interface AgentUpdateEvent {
  type: 'agent_update';
  issueId: string;
  event: AgentEvent;
}

export interface RetryFiredEvent {
  type: 'retry_fired';
  issueId: string;
  candidates: Issue[];
  /** Caller-supplied wall clock (ms since epoch). Keeps state machine pure. */
  nowMs: number;
}

export interface StallDetectedEvent {
  type: 'stall_detected';
  issueId: string;
}

/**
 * Discriminated union of side effects returned by the state machine.
 * These are data describing what to do -- the orchestrator loop executes them.
 */
export type SideEffect =
  | DispatchEffect
  | StopEffect
  | ScheduleRetryEffect
  | ReleaseClaimEffect
  | CleanWorkspaceEffect
  | UpdateTokensEffect
  | EmitLogEffect
  | EscalateEffect;

export interface DispatchEffect {
  type: 'dispatch';
  issue: Issue;
  attempt: number | null;
  /** Which backend to dispatch to. Defaults to 'primary' for backward compat. */
  backend?: 'local' | 'primary';
}

export interface StopEffect {
  type: 'stop';
  issueId: string;
  reason: string;
}

export interface ScheduleRetryEffect {
  type: 'scheduleRetry';
  issueId: string;
  identifier: string;
  attempt: number;
  delayMs: number;
  error: string | null;
}

export interface ReleaseClaimEffect {
  type: 'releaseClaim';
  issueId: string;
}

export interface CleanWorkspaceEffect {
  type: 'cleanWorkspace';
  issueId: string;
  identifier: string;
}

export interface UpdateTokensEffect {
  type: 'updateTokens';
  issueId: string;
  usage: TokenUsage;
}

export interface EmitLogEffect {
  type: 'emitLog';
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
}

export interface EscalateEffect {
  type: 'escalate';
  issueId: string;
  identifier: string;
  reasons: string[];
  /** Issue title for context in the interaction queue */
  issueTitle?: string;
  /** Issue description for context in the interaction queue */
  issueDescription?: string | null;
}
