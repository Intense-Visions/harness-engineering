import type {
  Issue,
  WorkflowConfig,
  AgentEvent,
  EscalationConfig,
  ConcernSignal,
} from '@harness-engineering/types';
import type { OrchestratorState, LiveSession, RunAttemptPhase } from '../types/internal';
import type {
  OrchestratorEvent,
  SideEffect,
  EscalateEffect,
  ClaimEffect,
  TickEvent,
} from '../types/events';
import { selectCandidates } from './candidate-selection';
import { canDispatch } from './concurrency';
import { reconcile } from './reconciliation';
import { calculateRetryDelay } from './retry';
import { detectScopeTier, routeIssue, artifactPresenceFromIssue } from './model-router';
import { extractRateLimitReset } from './rate-limit-events';

/**
 * Bound on retained completion records. Without this, `state.completed`
 * grows unbounded across the orchestrator's lifetime. The pruning logic in
 * handleTick uses the same threshold to decide when to drop entries that
 * also have no pending claim/run/retry activity.
 */
const COMPLETED_PRUNE_THRESHOLD = 100;

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
    completed: new Map(state.completed),
    tokenTotals: { ...state.tokenTotals },
    rateLimits: { ...state.rateLimits },
  };
}

const ESCALATION_DEFAULTS: EscalationConfig = {
  alwaysHuman: ['full-exploration'],
  autoExecute: ['quick-fix', 'diagnostic'],
  primaryExecute: [],
  signalGated: ['guided-change'],
  diagnosticRetryBudget: 1,
};

export function resolveEscalationConfig(config: WorkflowConfig): EscalationConfig {
  const partial = config.agent.escalation;
  if (!partial) return { ...ESCALATION_DEFAULTS };
  return {
    ...ESCALATION_DEFAULTS,
    ...stripUndefinedFields(partial),
  };
}

function stripUndefinedFields<T extends Record<string, unknown>>(obj: Partial<T>): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) result[key] = val;
  }
  return result as Partial<T>;
}

/** Optional fields carried on an escalation effect. */
interface EscalateExtras {
  issueTitle?: string;
  issueDescription?: string | null;
  enrichedSpec?: EscalateEffect['enrichedSpec'];
  complexityScore?: EscalateEffect['complexityScore'];
}

/**
 * Build an escalation side-effect, optionally attaching issue title,
 * description, enrichedSpec, and complexityScore when present.
 */
function buildEscalateEffect(
  issueId: string,
  identifier: string,
  reasons: string[],
  extras?: EscalateExtras
): EscalateEffect {
  const effect: EscalateEffect = {
    type: 'escalate',
    issueId,
    identifier,
    reasons,
  };
  if (extras?.issueTitle) effect.issueTitle = extras.issueTitle;
  if (extras?.issueDescription) effect.issueDescription = extras.issueDescription;
  if (extras?.enrichedSpec !== undefined) effect.enrichedSpec = extras.enrichedSpec;
  if (extras?.complexityScore !== undefined) effect.complexityScore = extras.complexityScore;
  return effect;
}

function claimAndDispatch(
  next: OrchestratorState,
  issue: Issue,
  backend: 'local' | 'primary',
  nowMs: number,
  effects: SideEffect[]
): void {
  next.claimed.add(issue.id);
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
  effects.push({ type: 'claim', issue, backend, attempt: null });
}

function entryIdentifier(entry: { identifier: string } | undefined, issueId: string): string {
  return entry?.identifier ?? issueId;
}

/**
 * Determine whether retries are exhausted and, if so, push an escalation
 * effect. Returns true when the caller should stop (budget exceeded).
 */
function checkRetryBudget(
  attempt: number,
  budget: number,
  issueId: string,
  identifier: string,
  reasonSuffix: string,
  effects: SideEffect[],
  extras?: EscalateExtras
): boolean {
  if (budget > 0 && attempt > budget) {
    effects.push(buildEscalateEffect(issueId, identifier, [`exceeded ${reasonSuffix}`], extras));
    return true;
  }
  return false;
}

/**
 * Push a retry entry into state and emit a scheduleRetry effect.
 */
function enqueueRetry(
  next: OrchestratorState,
  issueId: string,
  identifier: string,
  attempt: number,
  nowMs: number,
  error: string,
  effects: SideEffect[],
  maxRetryBackoffMs: number | undefined
): void {
  const delayMs = calculateRetryDelay(attempt, 'failure', maxRetryBackoffMs);
  next.retryAttempts.set(issueId, {
    issueId,
    identifier,
    attempt,
    dueAtMs: nowMs + delayMs,
    error,
  });
  effects.push({
    type: 'scheduleRetry',
    issueId,
    identifier,
    attempt,
    delayMs,
    error,
  });
}

function tryPeslAbort(issue: Issue, event: TickEvent): EscalateEffect | null {
  const simulation = event.simulationResults?.get(issue.id);
  if (!simulation?.abort) return null;

  return buildEscalateEffect(
    issue.id,
    issue.identifier,
    [
      `PESL simulation recommends abort (confidence: ${simulation.executionConfidence.toFixed(2)})`,
      ...simulation.predictedFailures.slice(0, 3).map((f) => `Predicted failure: ${f}`),
      ...simulation.testGaps.slice(0, 2).map((g) => `Test gap: ${g}`),
    ],
    {
      issueTitle: issue.title,
      issueDescription: issue.description,
      enrichedSpec: event.enrichedSpecs?.get(issue.id),
      complexityScore: event.complexityScores?.get(issue.id),
    }
  );
}

/**
 * Apply reconciliation side-effects to state: remove stopped issues
 * from running and release claims.
 */
function applyReconcileEffects(next: OrchestratorState, effects: SideEffect[]): void {
  for (const effect of effects) {
    if (effect.type === 'stop') {
      next.running.delete(effect.issueId);
    }
    if (effect.type === 'releaseClaim') {
      next.claimed.delete(effect.issueId);
    }
  }
}

/**
 * Determine the backend to use for dispatching an issue based on the
 * routing decision and config.
 */
function resolveBackend(action: string, hasLocalBackend: boolean): 'local' | 'primary' {
  if (action === 'dispatch-primary') return 'primary';
  return hasLocalBackend ? 'local' : 'primary';
}

/**
 * Prune completed entries that no longer have pending retries, running
 * tasks, or active claims. Only runs when the set exceeds the threshold.
 */
function pruneCompleted(next: OrchestratorState): void {
  if (next.completed.size <= COMPLETED_PRUNE_THRESHOLD) return;
  for (const [id] of next.completed) {
    const hasPending = next.retryAttempts.has(id) || next.running.has(id) || next.claimed.has(id);
    if (!hasPending) {
      next.completed.delete(id);
    }
  }
}

/**
 * Default grace period multiplier applied to pollIntervalMs.
 * A completed issue must be older than `pollIntervalMs * GRACE_MULTIPLIER`
 * before it can be released from `completed` when it reappears in active
 * candidates. This prevents duplicate dispatch on the tick immediately
 * after completion when the tracker write-back may not have persisted.
 */
const COMPLETED_GRACE_MULTIPLIER = 2;

/**
 * Reconcile the `completed` set against current active candidates.
 *
 * If a completed issue reappears as an active candidate after the grace
 * period, it means someone manually re-activated it in the roadmap. Release
 * it from `completed` so it can be re-dispatched.
 *
 * Also reconciles orphaned `claimed` entries: issues that are claimed but
 * not running and not retrying (e.g., from escalation) and whose roadmap
 * status has changed from active to non-active — release the stale claim.
 */
function reconcileCompletedAndClaimed(
  next: OrchestratorState,
  candidates: readonly Issue[],
  nowMs: number,
  effects: SideEffect[]
): void {
  const gracePeriodMs = next.pollIntervalMs * COMPLETED_GRACE_MULTIPLIER;
  const candidateIds = new Set(candidates.map((c) => c.id));

  // Release completed entries that have been re-activated after the grace period
  for (const [id, completedAtMs] of next.completed) {
    if (candidateIds.has(id) && nowMs - completedAtMs > gracePeriodMs) {
      next.completed.delete(id);
      effects.push({
        type: 'emitLog',
        level: 'info',
        message: `Released completed lock for ${id}: reappeared as active candidate after grace period`,
      });
    }
  }

  // Release orphaned claims: claimed but not running/retrying.
  // Only release if the issue is NOT in the current candidate list — meaning
  // its status was changed to non-active (e.g., user changed it to "blocked"
  // or "backlog" after escalation). This avoids re-escalation loops for issues
  // that are still in an active state.
  for (const id of next.claimed) {
    if (next.running.has(id) || next.retryAttempts.has(id)) continue;
    if (!candidateIds.has(id)) {
      next.claimed.delete(id);
      effects.push({
        type: 'emitLog',
        level: 'info',
        message: `Released orphaned claim for ${id}: no longer in active candidates`,
      });
    }
  }
}

/**
 * Build the concernSignals list for an issue, augmenting with
 * persona/specialization scoring signals when available. Returns the
 * top-recommended persona (when present) so the caller can attach it to
 * the claim effect.
 *
 * Persona scoring augmentation is non-fatal — failures fall through and
 * the caller proceeds with whatever signals were already gathered.
 */
function gatherSignalsAndPersona(
  issue: Issue,
  event: TickEvent
): { signals: ConcernSignal[]; suggestedPersona: string | undefined } {
  const signals = [...(event.concernSignals?.get(issue.id) ?? [])];
  let suggestedPersona: string | undefined;

  try {
    const personaRecs = event.personaRecommendations?.get(issue.id);
    if (personaRecs && personaRecs.length > 0) {
      suggestedPersona = personaRecs[0]!.persona;
      if (personaRecs[0]!.weightedScore < 0.3) {
        signals.push({
          name: 'lowExpertise',
          reason: `Top persona "${suggestedPersona}" scored ${personaRecs[0]!.weightedScore.toFixed(2)} (below 0.3 threshold)`,
        });
      }
    } else if (personaRecs && personaRecs.length === 0) {
      signals.push({
        name: 'noPersonaMatch',
        reason: "No persona recommendations available for this issue's systems",
      });
    }
  } catch {
    // Persona scoring augmentation is non-fatal — proceed with existing signals
  }

  return { signals, suggestedPersona };
}

function attachPersonaToLastClaim(
  effects: SideEffect[],
  suggestedPersona: string | undefined
): void {
  if (!suggestedPersona) return;
  const lastEffect = effects[effects.length - 1];
  if (lastEffect && lastEffect.type === 'claim') {
    (lastEffect as ClaimEffect).suggestedPersona = suggestedPersona;
  }
}

/**
 * Route a single eligible candidate: detect scope tier, gather signals,
 * and either escalate to a human or dispatch to local/primary backend.
 */
function dispatchEligibleIssue(
  next: OrchestratorState,
  issue: Issue,
  event: TickEvent,
  escalationConfig: EscalationConfig,
  config: WorkflowConfig,
  effects: SideEffect[]
): void {
  const scopeTier = detectScopeTier(issue, artifactPresenceFromIssue(issue));
  const { signals, suggestedPersona } = gatherSignalsAndPersona(issue, event);
  const decision = routeIssue(scopeTier, signals, escalationConfig);

  if (decision.action === 'needs-human') {
    next.claimed.add(issue.id);
    effects.push(
      buildEscalateEffect(issue.id, issue.identifier, decision.reasons, {
        issueTitle: issue.title,
        issueDescription: issue.description,
        enrichedSpec: event.enrichedSpecs?.get(issue.id),
        complexityScore: event.complexityScores?.get(issue.id),
      })
    );
    return;
  }

  const backend = resolveBackend(decision.action, !!config.agent.localBackend);
  claimAndDispatch(next, issue, backend, event.nowMs, effects);
  attachPersonaToLastClaim(effects, suggestedPersona);
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
  applyReconcileEffects(next, reconcileEffects);

  // Phase 1.5: Reconcile completed/claimed against current candidates
  reconcileCompletedAndClaimed(next, candidates, nowMs, effects);

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

    const peslAbort = tryPeslAbort(issue, event);
    if (peslAbort) {
      next.claimed.add(issue.id);
      effects.push(peslAbort);
      continue;
    }

    dispatchEligibleIssue(next, issue, event, escalationConfig, config, effects);
  }

  pruneCompleted(next);

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
    // Successful completion is terminal. Record it in `completed` and release
    // the dispatch claim so the slot frees up. Previously this path also
    // scheduled a 1000ms "continuation retry" which, combined with the lack
    // of a `completed` check in handleRetryFired/isEligible, caused completed
    // issues to be re-dispatched as soon as a slot reopened.
    next.completed.set(issueId, nowMs);
    next.claimed.delete(issueId);
    // Clean up the worktree now that the agent has finished and shipped a PR.
    effects.push({
      type: 'cleanWorkspace',
      issueId,
      identifier: entry?.identifier ?? issueId,
    });
    return { nextState: next, effects };
  } else {
    const nextAttempt = (attempt ?? 0) + 1;
    const escalationConfig = resolveEscalationConfig(config);
    const maxRetries = config.agent.maxRetries ?? 5;

    // Check if this is a diagnostic issue that has exceeded its retry budget
    const scopeLabel = entry?.issue.labels.find((l) => l.startsWith('scope:'));
    const isDiagnostic = scopeLabel === 'scope:diagnostic';
    const retryBudget = isDiagnostic ? escalationConfig.diagnosticRetryBudget : maxRetries;
    const identifier = entryIdentifier(entry, issueId);
    const budgetLabel = isDiagnostic
      ? `diagnostic exceeded retry budget (${escalationConfig.diagnosticRetryBudget})`
      : `max retries (${maxRetries})`;

    const entryExtras: EscalateExtras = {};
    if (entry?.issue.title) entryExtras.issueTitle = entry.issue.title;
    if (entry?.issue.description) entryExtras.issueDescription = entry.issue.description;

    if (
      checkRetryBudget(
        nextAttempt,
        retryBudget,
        issueId,
        identifier,
        budgetLabel,
        effects,
        entryExtras
      )
    ) {
      return { nextState: next, effects };
    }

    enqueueRetry(
      next,
      issueId,
      identifier,
      nextAttempt,
      nowMs,
      error ?? 'unknown error',
      effects,
      config.agent.maxRetryBackoffMs
    );
  }

  return { nextState: next, effects };
}

function deriveSessionPatch(
  session: LiveSession,
  event: AgentEvent
): { session: LiveSession; nextPhase: RunAttemptPhase | null } {
  const updated = { ...session };
  updated.lastEvent = event.type;
  updated.lastTimestamp = event.timestamp;

  let nextPhase: RunAttemptPhase | null = null;

  // Hoist the lastMessage assignment so we don't restate it in every
  // streaming branch below. Only the result branch uses a different shape.
  const streamingTypes = new Set(['thought', 'call', 'status', 'rate_limit', 'rate_limit_sleep']);
  if (streamingTypes.has(event.type)) {
    updated.lastMessage =
      typeof event.content === 'string' ? event.content : JSON.stringify(event.content);
  }

  if (event.type === 'turn_start') {
    updated.turnCount += 1;
  } else if (event.type === 'thought' || event.type === 'call' || event.type === 'status') {
    nextPhase = 'StreamingTurn';
  } else if (event.type === 'rate_limit') {
    // Subscription-level rate limits include resetsAtMs in their content.
    // Per-request limits carry only a message — treat those as streaming.
    nextPhase = extractRateLimitReset(event) !== null ? 'RateLimitSleeping' : 'StreamingTurn';
  } else if (event.type === 'rate_limit_sleep') {
    // Runner is sleeping until the subscription limit resets
    nextPhase = 'RateLimitSleeping';
  } else if (event.type === 'result') {
    updated.lastMessage =
      typeof event.content === 'string'
        ? event.content
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (event.content as any)?.result || JSON.stringify(event.content);
  }

  if (event.sessionId) {
    updated.sessionId = event.sessionId;
  }

  return { session: updated, nextPhase };
}

function accrueUsage(
  next: OrchestratorState,
  session: LiveSession,
  issueId: string,
  usage: NonNullable<AgentEvent['usage']>,
  effects: SideEffect[]
): void {
  session.inputTokens += usage.inputTokens;
  session.outputTokens += usage.outputTokens;
  session.totalTokens += usage.totalTokens;

  next.tokenTotals.inputTokens += usage.inputTokens;
  next.tokenTotals.outputTokens += usage.outputTokens;
  next.tokenTotals.totalTokens += usage.totalTokens;
  next.tokenTotals.cacheReadTokens += usage.cacheReadTokens ?? 0;
  next.tokenTotals.cacheCreationTokens += usage.cacheCreationTokens ?? 0;

  const now = Date.now();
  next.recentInputTokens.push({ timestamp: now, tokens: usage.inputTokens });
  next.recentOutputTokens.push({ timestamp: now, tokens: usage.outputTokens });
  next.recentInputTokens = next.recentInputTokens.filter((t) => now - t.timestamp < 60000);
  next.recentOutputTokens = next.recentOutputTokens.filter((t) => now - t.timestamp < 60000);

  effects.push({ type: 'updateTokens', issueId, usage });
}

function handleAgentUpdate(
  state: OrchestratorState,
  issueId: string,
  event: AgentEvent
): ApplyEventResult {
  const next = cloneState(state);
  const effects: SideEffect[] = [];

  if (event.type === 'rate_limit') {
    // Subscription-level limits include resetsAtMs — use that for global cooldown.
    // Per-request limits use the configured globalCooldownMs fallback.
    const resetsAtMs = extractRateLimitReset(event);
    if (resetsAtMs !== null && resetsAtMs > Date.now()) {
      next.globalCooldownUntilMs = resetsAtMs;
    } else {
      next.globalCooldownUntilMs = Date.now() + next.globalCooldownMs;
    }
  } else if (event.type === 'turn_start') {
    const now = Date.now();
    next.recentRequestTimestamps.push(now);
    next.recentRequestTimestamps = next.recentRequestTimestamps.filter((ts) => now - ts < 60000);
  }

  const entry = next.running.get(issueId);
  if (entry && entry.session) {
    const { session: updatedSession, nextPhase } = deriveSessionPatch(entry.session, event);
    if (event.usage) accrueUsage(next, updatedSession, issueId, event.usage, effects);
    next.running.set(issueId, {
      ...entry,
      phase: nextPhase ?? entry.phase,
      session: updatedSession,
    });
  }

  return { nextState: next, effects };
}

function handleRetryFired(
  state: OrchestratorState,
  issueId: string,
  candidates: Issue[],
  config: WorkflowConfig,
  nowMs: number,
  concernSignals?: Map<string, ConcernSignal[]>
): ApplyEventResult {
  const next = cloneState(state);
  const effects: SideEffect[] = [];

  const retryEntry = next.retryAttempts.get(issueId);
  next.retryAttempts.delete(issueId);

  if (!retryEntry) {
    return { nextState: next, effects };
  }

  // Defense-in-depth: if a successful run already marked this issue completed,
  // do not re-dispatch even if a stale retry entry survived. Release the claim
  // so the tracker state can advance.
  if (next.completed.has(issueId)) {
    next.claimed.delete(issueId);
    effects.push({ type: 'releaseClaim', issueId });
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

    if (
      checkRetryBudget(
        nextAttempt,
        maxRetries,
        issueId,
        retryEntry.identifier,
        `max retries (${maxRetries}) while waiting for slots`,
        effects,
        {
          issueTitle: issue.title,
          issueDescription: issue.description,
        }
      )
    ) {
      return { nextState: next, effects };
    }

    enqueueRetry(
      next,
      issueId,
      retryEntry.identifier,
      nextAttempt,
      nowMs,
      'no available orchestrator slots',
      effects,
      config.agent.maxRetryBackoffMs
    );
    return { nextState: next, effects };
  }

  // Re-route through model router to preserve backend assignment
  const escalationConfig = resolveEscalationConfig(config);
  const scopeTier = detectScopeTier(issue, artifactPresenceFromIssue(issue));
  const signals = [...(concernSignals?.get(issue.id) ?? [])];
  const decision = routeIssue(scopeTier, signals, escalationConfig);

  if (decision.action === 'needs-human') {
    effects.push(
      buildEscalateEffect(issue.id, issue.identifier, decision.reasons, {
        issueTitle: issue.title,
        issueDescription: issue.description,
      })
    );
  } else {
    effects.push({
      type: 'claim',
      issue,
      backend: resolveBackend(decision.action, !!config.agent.localBackend),
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
  const identifier = entryIdentifier(entry, issueId);

  const stallExtras: EscalateExtras = {};
  if (entry?.issue.title) stallExtras.issueTitle = entry.issue.title;
  if (entry?.issue.description) stallExtras.issueDescription = entry.issue.description;

  if (
    checkRetryBudget(
      attempt,
      maxRetries,
      issueId,
      identifier,
      `max retries (${maxRetries}) after stall`,
      effects,
      stallExtras
    )
  ) {
    return { nextState: next, effects };
  }

  enqueueRetry(
    next,
    issueId,
    identifier,
    attempt,
    Date.now(),
    'stall detected',
    effects,
    config.agent.maxRetryBackoffMs
  );

  return { nextState: next, effects };
}

function handleClaimRejected(state: OrchestratorState, issueId: string): ApplyEventResult {
  const next = cloneState(state);
  next.claimed.delete(issueId);
  next.running.delete(issueId);
  next.claimRejections += 1;
  return { nextState: next, effects: [] };
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
      return handleRetryFired(
        state,
        event.issueId,
        event.candidates,
        config,
        event.nowMs,
        event.concernSignals
      );
    case 'stall_detected':
      return handleStallDetected(state, event.issueId, config);
    case 'claim_rejected':
      return handleClaimRejected(state, event.issueId);
  }
}
