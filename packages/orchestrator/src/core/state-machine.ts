import type { Issue, WorkflowConfig, AgentEvent } from '@harness-engineering/types';
import type { OrchestratorState } from '../types/internal';
import type { OrchestratorEvent, SideEffect } from '../types/events';
import { selectCandidates } from './candidate-selection';
import { canDispatch } from './concurrency';
import { reconcile } from './reconciliation';
import { calculateRetryDelay } from './retry';

export interface ApplyEventResult {
  nextState: OrchestratorState;
  effects: SideEffect[];
}

/**
 * Clone the state for immutable transitions.
 * Maps and Sets are shallow-cloned; entries within them are not deeply copied
 * since we only add/remove entries, not mutate them in place.
 */
function cloneState(state: OrchestratorState): OrchestratorState {
  return {
    ...state,
    running: new Map(state.running),
    claimed: new Set(state.claimed),
    retryAttempts: new Map(state.retryAttempts),
    completed: new Set(state.completed),
    tokenTotals: { ...state.tokenTotals },
    rateLimits: { ...state.rateLimits },
  };
}

function handleTick(
  state: OrchestratorState,
  candidates: Issue[],
  runningStates: ReadonlyMap<string, Issue>,
  config: WorkflowConfig,
  nowMs: number
): ApplyEventResult {
  const next = cloneState(state);
  const effects: SideEffect[] = [];

  // Phase 1: Reconcile running issues against tracker state
  const reconcileEffects = reconcile(
    next,
    runningStates,
    config.tracker.activeStates,
    config.tracker.terminalStates
  );
  effects.push(...reconcileEffects);

  // Apply reconciliation to state: remove stopped issues from running and claimed
  for (const effect of reconcileEffects) {
    if (effect.type === 'stop') {
      next.running.delete(effect.issueId);
    }
    if (effect.type === 'releaseClaim') {
      next.claimed.delete(effect.issueId);
    }
  }

  // Phase 2: Select and dispatch eligible candidates
  const eligible = selectCandidates(
    candidates,
    next,
    config.tracker.activeStates,
    config.tracker.terminalStates
  );

  for (const issue of eligible) {
    if (!canDispatch(next, issue.state, config.agent.maxConcurrentAgentsByState)) {
      break; // No more slots available
    }

    next.claimed.add(issue.id);
    // Add a placeholder RunningEntry so canDispatch sees the correct count
    next.running.set(issue.id, {
      issueId: issue.id,
      identifier: issue.identifier,
      issue,
      attempt: null,
      workspacePath: '',
      startedAt: new Date(nowMs).toISOString(),
      phase: 'PreparingWorkspace',
      session: null,
    });
    effects.push({
      type: 'dispatch',
      issue,
      attempt: null,
    });
  }

  return { nextState: next, effects };
}

function handleWorkerExit(
  state: OrchestratorState,
  issueId: string,
  reason: 'normal' | 'error',
  error: string | undefined,
  attempt: number | null,
  config: WorkflowConfig
): ApplyEventResult {
  const next = cloneState(state);
  const effects: SideEffect[] = [];

  const entry = next.running.get(issueId);
  next.running.delete(issueId);

  if (reason === 'normal') {
    next.completed.add(issueId);
    const delayMs = calculateRetryDelay(1, 'continuation');
    effects.push({
      type: 'scheduleRetry',
      issueId,
      identifier: entry?.identifier ?? issueId,
      attempt: 1,
      delayMs,
      error: null,
    });
  } else {
    const nextAttempt = (attempt ?? 0) + 1;
    const delayMs = calculateRetryDelay(nextAttempt, 'failure', config.agent.maxRetryBackoffMs);
    effects.push({
      type: 'scheduleRetry',
      issueId,
      identifier: entry?.identifier ?? issueId,
      attempt: nextAttempt,
      delayMs,
      error: error ?? 'unknown error',
    });
  }

  return { nextState: next, effects };
}

function handleAgentUpdate(
  state: OrchestratorState,
  issueId: string,
  event: AgentEvent
): ApplyEventResult {
  const next = cloneState(state);
  const effects: SideEffect[] = [];

  const entry = next.running.get(issueId);
  if (entry && entry.session) {
    const updatedSession = { ...entry.session };
    updatedSession.lastEvent = event.type;
    updatedSession.lastTimestamp = event.timestamp;

    if (event.usage) {
      updatedSession.inputTokens += event.usage.inputTokens;
      updatedSession.outputTokens += event.usage.outputTokens;
      updatedSession.totalTokens += event.usage.totalTokens;

      effects.push({
        type: 'updateTokens',
        issueId,
        usage: event.usage,
      });
    }

    if (event.sessionId) {
      updatedSession.sessionId = event.sessionId;
    }

    next.running.set(issueId, { ...entry, session: updatedSession });
  }

  return { nextState: next, effects };
}

function handleRetryFired(
  state: OrchestratorState,
  issueId: string,
  candidates: Issue[],
  config: WorkflowConfig,
  nowMs: number
): ApplyEventResult {
  const next = cloneState(state);
  const effects: SideEffect[] = [];

  const retryEntry = next.retryAttempts.get(issueId);
  next.retryAttempts.delete(issueId);

  if (!retryEntry) {
    return { nextState: next, effects };
  }

  // Find the issue in candidates
  const issue = candidates.find((c) => c.id === issueId);
  if (!issue) {
    // Not found -> release claim
    next.claimed.delete(issueId);
    effects.push({ type: 'releaseClaim', issueId });
    return { nextState: next, effects };
  }

  // Check if still active
  const normalizedState = issue.state.toLowerCase();
  const normalizedActive = config.tracker.activeStates.map((s) => s.toLowerCase());
  if (!normalizedActive.includes(normalizedState)) {
    next.claimed.delete(issueId);
    effects.push({ type: 'releaseClaim', issueId });
    return { nextState: next, effects };
  }

  // Check slots
  if (!canDispatch(next, issue.state, config.agent.maxConcurrentAgentsByState)) {
    // Requeue with incremented attempt
    const nextAttempt = retryEntry.attempt + 1;
    const delayMs = calculateRetryDelay(nextAttempt, 'failure', config.agent.maxRetryBackoffMs);
    next.retryAttempts.set(issueId, {
      issueId,
      identifier: retryEntry.identifier,
      attempt: nextAttempt,
      dueAtMs: nowMs + delayMs,
      error: 'no available orchestrator slots',
    });
    effects.push({
      type: 'scheduleRetry',
      issueId,
      identifier: retryEntry.identifier,
      attempt: nextAttempt,
      delayMs,
      error: 'no available orchestrator slots',
    });
    return { nextState: next, effects };
  }

  // Dispatch
  effects.push({
    type: 'dispatch',
    issue,
    attempt: retryEntry.attempt,
  });

  return { nextState: next, effects };
}

function handleStallDetected(
  state: OrchestratorState,
  issueId: string,
  config: WorkflowConfig
): ApplyEventResult {
  const next = cloneState(state);
  const effects: SideEffect[] = [];

  const entry = next.running.get(issueId);
  next.running.delete(issueId);

  const attempt = (entry?.attempt ?? 0) + 1;
  const delayMs = calculateRetryDelay(attempt, 'failure', config.agent.maxRetryBackoffMs);

  effects.push({
    type: 'stop',
    issueId,
    reason: 'stall_detected',
  });

  effects.push({
    type: 'scheduleRetry',
    issueId,
    identifier: entry?.identifier ?? issueId,
    attempt,
    delayMs,
    error: 'stall detected',
  });

  return { nextState: next, effects };
}

/**
 * Pure state machine transition function.
 *
 * Takes the current state, an event, and config.
 * Returns the next state and a list of side effects to execute.
 * No I/O is performed -- all side effects are returned as data.
 */
export function applyEvent(
  state: OrchestratorState,
  event: OrchestratorEvent,
  config: WorkflowConfig
): ApplyEventResult {
  switch (event.type) {
    case 'tick':
      return handleTick(state, event.candidates, event.runningStates, config, event.nowMs);
    case 'worker_exit':
      return handleWorkerExit(
        state,
        event.issueId,
        event.reason,
        event.error,
        event.attempt,
        config
      );
    case 'agent_update':
      return handleAgentUpdate(state, event.issueId, event.event);
    case 'retry_fired':
      return handleRetryFired(state, event.issueId, event.candidates, config, event.nowMs);
    case 'stall_detected':
      return handleStallDetected(state, event.issueId, config);
  }
}
