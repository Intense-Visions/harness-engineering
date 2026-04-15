import type {
  Issue,
  WorkflowConfig,
  AgentEvent,
  EscalationConfig,
} from '@harness-engineering/types';
import type { OrchestratorState } from '../types/internal';
import type { OrchestratorEvent, SideEffect, EscalateEffect, TickEvent } from '../types/events';
import { selectCandidates } from './candidate-selection';
import { canDispatch } from './concurrency';
import { reconcile } from './reconciliation';
import { calculateRetryDelay } from './retry';
import { detectScopeTier, routeIssue, artifactPresenceFromIssue } from './model-router';

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
    recentRequestTimestamps: [...state.recentRequestTimestamps],
    recentInputTokens: [...state.recentInputTokens],
    recentOutputTokens: [...state.recentOutputTokens],
    running: new Map(state.running),
    claimed: new Set(state.claimed),
    retryAttempts: new Map(state.retryAttempts),
    completed: new Set(state.completed),
    tokenTotals: { ...state.tokenTotals },
    rateLimits: { ...state.rateLimits },
  };
}

export function resolveEscalationConfig(config: WorkflowConfig): EscalationConfig {
  const partial = config.agent.escalation;
  return {
    alwaysHuman: partial?.alwaysHuman ?? ['full-exploration'],
    autoExecute: partial?.autoExecute ?? ['quick-fix', 'diagnostic'],
    signalGated: partial?.signalGated ?? ['guided-change'],
    diagnosticRetryBudget: partial?.diagnosticRetryBudget ?? 1,
  };
}

function tryEscalate(
  issue: Issue,
  event: TickEvent,
  config: WorkflowConfig,
  escalationConfig: import('@harness-engineering/types').EscalationConfig
): EscalateEffect | null {
  if (!config.agent.localBackend) return null;
  const scopeTier = detectScopeTier(issue, artifactPresenceFromIssue(issue));
  const signals = event.concernSignals?.get(issue.id) ?? [];
  const decision = routeIssue(scopeTier, signals, escalationConfig);
  if (decision.action !== 'needs-human') return null;

  const enrichedSpec = event.enrichedSpecs?.get(issue.id);
  const complexityScore = event.complexityScores?.get(issue.id);
  return {
    type: 'escalate',
    issueId: issue.id,
    identifier: issue.identifier,
    reasons: decision.reasons,
    issueTitle: issue.title,
    issueDescription: issue.description,
    ...(enrichedSpec !== undefined && { enrichedSpec }),
    ...(complexityScore !== undefined && { complexityScore }),
  };
}

function tryPeslAbort(issue: Issue, event: TickEvent): EscalateEffect | null {
  const simulation = event.simulationResults?.get(issue.id);
  if (!simulation?.abort) return null;

  const enrichedSpec = event.enrichedSpecs?.get(issue.id);
  const complexityScore = event.complexityScores?.get(issue.id);
  return {
    type: 'escalate',
    issueId: issue.id,
    identifier: issue.identifier,
    reasons: [
      `PESL simulation recommends abort (confidence: ${simulation.executionConfidence.toFixed(2)})`,
      ...simulation.predictedFailures.slice(0, 3).map((f) => `Predicted failure: ${f}`),
      ...simulation.testGaps.slice(0, 2).map((g) => `Test gap: ${g}`),
    ],
    issueTitle: issue.title,
    issueDescription: issue.description,
    ...(enrichedSpec !== undefined && { enrichedSpec }),
    ...(complexityScore !== undefined && { complexityScore }),
  };
}

function handleTick(
  state: OrchestratorState,
  event: TickEvent,
  config: WorkflowConfig
): ApplyEventResult {
  const { candidates, runningStates, nowMs } = event;
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

  const escalationConfig = resolveEscalationConfig(config);

  for (const issue of eligible) {
    if (!canDispatch(next, issue.state, config.agent.maxConcurrentAgentsByState)) {
      break; // No more slots available
    }

    const escalation = tryEscalate(issue, event, config, escalationConfig);
    if (escalation) {
      next.claimed.add(issue.id);
      effects.push(escalation);
      continue;
    }

    // Check PESL simulation result for abort recommendation
    const peslAbort = tryPeslAbort(issue, event);
    if (peslAbort) {
      next.claimed.add(issue.id);
      effects.push(peslAbort);
      continue;
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
      backend: config.agent.localBackend ? 'local' : 'primary',
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

  const nowMs = Date.now();

  if (reason === 'normal') {
    next.completed.add(issueId);
    const delayMs = calculateRetryDelay(1, 'continuation');
    next.retryAttempts.set(issueId, {
      issueId,
      identifier: entry?.identifier ?? issueId,
      attempt: 1,
      dueAtMs: nowMs + delayMs,
      error: null,
    });
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
    const escalationConfig = resolveEscalationConfig(config);
    const maxRetries = config.agent.maxRetries ?? 5;

    // Check if this is a diagnostic issue that has exceeded its retry budget
    const scopeLabel = entry?.issue.labels.find((l) => l.startsWith('scope:'));
    const isDiagnostic = scopeLabel === 'scope:diagnostic';
    const retryBudget = isDiagnostic ? escalationConfig.diagnosticRetryBudget : maxRetries;
    if (maxRetries > 0 && nextAttempt > retryBudget) {
      const reason = isDiagnostic
        ? `diagnostic exceeded retry budget (${escalationConfig.diagnosticRetryBudget})`
        : `exceeded max retries (${maxRetries})`;
      const escalateEffect: SideEffect = {
        type: 'escalate',
        issueId,
        identifier: entry?.identifier ?? issueId,
        reasons: [reason],
      };
      if (entry?.issue.title) (escalateEffect as EscalateEffect).issueTitle = entry.issue.title;
      if (entry?.issue.description)
        (escalateEffect as EscalateEffect).issueDescription = entry.issue.description;
      effects.push(escalateEffect);
      return { nextState: next, effects };
    }

    const delayMs = calculateRetryDelay(nextAttempt, 'failure', config.agent.maxRetryBackoffMs);
    next.retryAttempts.set(issueId, {
      issueId,
      identifier: entry?.identifier ?? issueId,
      attempt: nextAttempt,
      dueAtMs: nowMs + delayMs,
      error: error ?? 'unknown error',
    });
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

  if (event.type === 'rate_limit') {
    next.globalCooldownUntilMs = Date.now() + next.globalCooldownMs;
  } else if (event.type === 'turn_start') {
    const now = Date.now();
    next.recentRequestTimestamps.push(now);
    next.recentRequestTimestamps = next.recentRequestTimestamps.filter((ts) => now - ts < 60000);
  }

  const entry = next.running.get(issueId);
  if (entry && entry.session) {
    const updatedSession = { ...entry.session };
    updatedSession.lastEvent = event.type;
    updatedSession.lastTimestamp = event.timestamp;

    let nextPhase = entry.phase;

    if (
      event.type === 'thought' ||
      event.type === 'call' ||
      event.type === 'status' ||
      event.type === 'rate_limit'
    ) {
      nextPhase = 'StreamingTurn';
      updatedSession.lastMessage =
        typeof event.content === 'string' ? event.content : JSON.stringify(event.content);
    } else if (event.type === 'result') {
      updatedSession.lastMessage =
        typeof event.content === 'string'
          ? event.content
          : // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (event.content as any)?.result || JSON.stringify(event.content);
    }

    if (event.usage) {
      updatedSession.inputTokens += event.usage.inputTokens;
      updatedSession.outputTokens += event.usage.outputTokens;
      updatedSession.totalTokens += event.usage.totalTokens;

      const now = Date.now();
      next.recentInputTokens.push({ timestamp: now, tokens: event.usage.inputTokens });
      next.recentOutputTokens.push({ timestamp: now, tokens: event.usage.outputTokens });

      // Prune
      next.recentInputTokens = next.recentInputTokens.filter((t) => now - t.timestamp < 60000);
      next.recentOutputTokens = next.recentOutputTokens.filter((t) => now - t.timestamp < 60000);

      effects.push({
        type: 'updateTokens',
        issueId,
        usage: event.usage,
      });
    }

    if (event.sessionId) {
      updatedSession.sessionId = event.sessionId;
    }

    next.running.set(issueId, { ...entry, phase: nextPhase, session: updatedSession });
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
    const maxRetries = config.agent.maxRetries ?? 5;
    if (maxRetries > 0 && nextAttempt > maxRetries) {
      effects.push({
        type: 'escalate',
        issueId,
        identifier: retryEntry.identifier,
        reasons: [`exceeded max retries (${maxRetries}) while waiting for slots`],
        issueTitle: issue.title,
        issueDescription: issue.description,
      });
      return { nextState: next, effects };
    }
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

  // Re-route through model router to preserve backend assignment (only when local backend is configured)
  // Note: retry path does not have intelligence pipeline signals — retries use empty signals
  // (retries are diagnostic-tier which is autoExecute, so signals wouldn't affect routing)
  if (config.agent.localBackend) {
    const escalationConfig = resolveEscalationConfig(config);
    const scopeTier = detectScopeTier(issue, artifactPresenceFromIssue(issue));
    const decision = routeIssue(scopeTier, [], escalationConfig);

    if (decision.action === 'needs-human') {
      effects.push({
        type: 'escalate',
        issueId: issue.id,
        identifier: issue.identifier,
        reasons: decision.reasons,
        issueTitle: issue.title,
        issueDescription: issue.description,
      });
    } else {
      effects.push({
        type: 'dispatch',
        issue,
        attempt: retryEntry.attempt,
        backend: 'local',
      });
    }
  } else {
    effects.push({
      type: 'dispatch',
      issue,
      attempt: retryEntry.attempt,
    });
  }

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

  effects.push({
    type: 'stop',
    issueId,
    reason: 'stall_detected',
  });

  const attempt = (entry?.attempt ?? 0) + 1;
  const maxRetries = config.agent.maxRetries ?? 5;
  if (maxRetries > 0 && attempt > maxRetries) {
    const escalateEffect: SideEffect = {
      type: 'escalate',
      issueId,
      identifier: entry?.identifier ?? issueId,
      reasons: [`exceeded max retries (${maxRetries}) after stall`],
    };
    if (entry?.issue.title) (escalateEffect as EscalateEffect).issueTitle = entry.issue.title;
    if (entry?.issue.description)
      (escalateEffect as EscalateEffect).issueDescription = entry.issue.description;
    effects.push(escalateEffect);
    return { nextState: next, effects };
  }

  const delayMs = calculateRetryDelay(attempt, 'failure', config.agent.maxRetryBackoffMs);
  const nowMs = Date.now();

  next.retryAttempts.set(issueId, {
    issueId,
    identifier: entry?.identifier ?? issueId,
    attempt,
    dueAtMs: nowMs + delayMs,
    error: 'stall detected',
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
      return handleTick(state, event, config);
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
