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
}

export interface WorkerExitEvent {
  type: 'worker_exit';
  issueId: string;
  reason: 'normal' | 'error';
  error?: string;
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
  | EmitLogEffect;

export interface DispatchEffect {
  type: 'dispatch';
  issue: Issue;
  attempt: number | null;
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
