import type {
  AgentBackend,
  AgentEvent,
  WorkflowExecutionPlan,
  WorkflowStep,
  StageRun,
  RoutingRequest,
  RoutingDecision,
  CapabilityTier,
} from '@harness-engineering/types';
import { TIER_RANK, RANK_TIER } from '@harness-engineering/intelligence';
import type { StreamRecorder } from '../core/stream-recorder';
import type { StructuredLogger } from '../logging/logger';

/**
 * D8(a): bump one capability tier, clamped at `strong`. Pure; reuses the guarded
 * TIER_RANK/RANK_TIER tables from `@harness-engineering/intelligence` (the same
 * source escalation-state.ts uses) — it never re-implements them, so derive-tier
 * stays the single tier-ordering authority (SC8).
 */
export function nextTier(t: CapabilityTier): CapabilityTier {
  const next = Math.min(TIER_RANK[t] + 1, TIER_RANK.strong);
  return RANK_TIER[next]!;
}

/**
 * D12 default per-stage wall-clock deadline (ms). Mirrors the runner request
 * timeout / maintenance.ts:80. `WorkflowEngineContext.stageDeadlineMs` overrides
 * it; per-stage config is Phase 4.
 */
export const DEFAULT_STAGE_DEADLINE_MS = 120_000;

/**
 * Narrow surface the stage-execution engine needs. The Orchestrator will
 * implement this in Phase 4 when dispatchIssue wires the branch; the engine
 * must NOT import orchestrator.ts (layer cycle). Phase 1 tests inject a fake.
 */
export interface WorkflowEngineContext {
  recorder: StreamRecorder;
  logger: StructuredLogger;
  /** issueId of the coherence unit — used for recorder keys + terminal transitions. */
  issueId: string;
  identifier: string;
  externalId: string | null;
  workspacePath: string;
  /**
   * D12 (SC7): per-stage wall-clock deadline in ms. If a stage does not finish
   * within it, the engine fires the per-stage abort (running the runner's
   * `finally { stopSession }` via `gen.return()`) and treats the stage as
   * `passed:false` → feeds the D8 retry/terminal path (never an unbounded hang).
   * Absent ⇒ the engine default (`DEFAULT_STAGE_DEADLINE_MS`). Per-stage/config
   * override is Phase 4.
   */
  stageDeadlineMs?: number;
  /** Build a runner for a stage's routed backend. Phase 1: single stubbed backend. */
  makeRunner(backend: AgentBackend): {
    runSession: (
      issue: unknown,
      ws: string,
      prompt: string
    ) => AsyncGenerator<
      AgentEvent,
      {
        sessionId: string;
        success: boolean; // Phase 3: the runner's TurnResult.success — quality signal for gate eval
        usage: { inputTokens: number; outputTokens: number; totalTokens: number };
      },
      void
    >;
  };
  /** Phase 1 stub: resolve the single backend for a stage (Phase 2 replaces with route()). */
  resolveStageBackend(step: WorkflowExecutionPlan['stages'][number]): AgentBackend;
  /**
   * Per-phase routing (identity path): synthesize THIS stage's RoutingDecision when
   * it was resolved via the identity fallback (no adaptiveRouter). The adaptive path
   * attaches `run.decision` from the router; the identity path had none, leaving
   * `run.decision` unset. That silently broke every downstream consumer of the last
   * stage's decision — critically `settleWorkflowSuccess`'s `isLocal` gate, which
   * derives locality from `runs[last].decision?.backendName`: with no decision the
   * gate+ship block is skipped, so a fully-local (no-`routing.policy`, i.e. AMR-off,
   * i.e. the DEFAULT) staged unit completes but never ships and loops via
   * `in_review` re-dispatch. This fills the same slot from the resolved backend's
   * name + type. ABSENT (fake/legacy contexts) ⇒ decision stays unset (byte-identical).
   */
  stageDecisionFor?(
    step: WorkflowExecutionPlan['stages'][number],
    backend: AgentBackend
  ): RoutingDecision | undefined;
  /**
   * split-routing 4b: render the REAL per-stage prompt (issue + stage role +
   * prior-stage outputs), replacing the Phase-1 bare skill-name stub. Bound by
   * `buildWorkflowContext` via a `PromptRenderer` (never imports orchestrator).
   * `priorOutputs` maps each prior stage's `produces` label → its captured output.
   * Optional so fake contexts that don't exercise prompt content fall back to the
   * skill name (byte-identical to the old stub).
   *
   * CONTRACT: must be non-blocking (CPU-bound). It runs BEFORE the per-stage
   * deadline timer is armed, so an I/O-bound renderer that hangs would stall the
   * stage with no wall-clock bound. The shipped renderer is synchronous LiquidJS.
   *
   * `isLocalBackend` (per-phase routing) is the routed backend's locality: when
   * `true` the renderer selects the LOCAL-indirection stage template
   * (`harness skill run <skill> --autonomous`); when `false` OR OMITTED it renders
   * the byte-identical default `STAGE_PROMPT_TEMPLATE` (SC3 — a fake/legacy
   * context that passes no locality behaves exactly as before).
   */
  renderStagePrompt?(
    step: WorkflowExecutionPlan['stages'][number],
    index: number,
    priorOutputs: Record<string, string>,
    isLocalBackend?: boolean
  ): string | Promise<string>;
  /**
   * Per-phase routing: resolve whether a routed `AgentBackend` is a local-endpoint
   * backend (`local`/`pi`/`ollama` via `isLocalEndpointBackend`). The routed path
   * only has a name-only `AgentBackend`, so it cannot call `isLocalEndpointBackend`
   * (that needs the `BackendDef`); this resolver maps the name → its def in the
   * real context. ABSENT (fake/legacy contexts) ⇒ treated as non-local ⇒ default
   * template (SC3, byte-identical).
   */
  isLocalBackend?(backend: AgentBackend): boolean;
  /**
   * split-routing Phase 2: per-stage adaptive router. Present ⇒ each stage is
   * routed via `route(buildStageRequest(...))`; ABSENT ⇒ identity fallback via
   * `resolveStageBackend` (no `routing.policy`). Narrow surface only (route +
   * recordOutcome) so the engine stays off the orchestrator import cycle.
   *
   * `route()` returns `{ decision }` only — the engine derives the backend name
   * from `decision.backendName` (a `BackendDef` carries no `name`; the name is
   * the router map key), so `def` is deliberately not part of this surface.
   */
  adaptiveRouter?: {
    route(req: RoutingRequest): Promise<{ decision: RoutingDecision }>;
    recordOutcome(coherenceUnit: string, tier: CapabilityTier, ok: boolean): void;
  };
  /** Terminal success — exactly one running/claimed delete + one lane persist (D6). */
  emitWorkflowSuccess(unit: string, runs: StageRun[]): Promise<void>;
  /** Terminal failure/safety-net — exactly one running/claimed delete + one lane persist (D6/I1). */
  finalizeWorkflowTerminal(
    unit: string,
    runs: StageRun[],
    failingStep?: WorkflowExecutionPlan['stages'][number],
    err?: unknown
  ): Promise<void>;
}

/**
 * Derive a StreamRecorder attempt key from (stageIndex, attempt). The recorder
 * is keyed by (issueId, attempt) only (stream-recorder.ts:99,164,190,386) — it
 * has NO stageIndex parameter — so we encode the stage into the attempt integer
 * to keep N stages' recordings from clobbering, WITHOUT modifying StreamRecorder.
 * attempt is 0 in Phase 1; Phase 3 uses 0|1 for the engine retry cap.
 *
 * INVARIANT (carry-forward b): the `stageIndex * 1000 + attempt` encoding is
 * collision-free ONLY while `0 <= attempt < 1000` (else `attempt` would spill
 * into the next stage's key band and silently clobber its recordings). We assert
 * it here so a future retry-cap change that raised `attempt` past 999 fails loud
 * instead of corrupting stream recordings.
 */
export function stageAttemptKey(stageIndex: number, attempt: number): number {
  if (attempt < 0 || attempt >= 1000) {
    throw new RangeError(`stageAttemptKey: attempt must be 0..999 (got ${attempt})`);
  }
  return stageIndex * 1000 + attempt;
}

/**
 * Build the per-stage RoutingRequest. The useCase is derived from the step
 * (skill + optional cognitiveMode); the shared `coherenceUnit` pins all stages
 * to one escalation floor (D2). When `step.routingHint` is present we seed
 * `complexity`/`risk` so `route()` short-circuits live classification
 * (adaptive-router.ts:118) and the stage resolves DETERMINISTICALLY (S3) — a
 * `complex`-hinted stage → `strong`, a `trivial`-hinted stage → `fast`, without
 * depending on the LLM/text classifier. `floor` is plumbed for Phase 3's engine
 * retry (a bumped required floor); it is always `undefined` in Phase 2 (Phase 3
 * threads it into the request). exactOptionalPropertyTypes ⇒ conditional
 * spreads, never explicit `undefined`.
 */
export function buildStageRequest(
  step: WorkflowExecutionPlan['stages'][number],
  coherenceUnit: string,
  _priorRuns: StageRun[],
  floor?: CapabilityTier
): RoutingRequest {
  const useCase = {
    kind: 'skill' as const,
    skillName: step.skill,
    ...(step.cognitiveMode !== undefined ? { cognitiveMode: step.cognitiveMode } : {}),
  };
  return {
    useCase,
    coherenceUnit,
    ...(step.routingHint?.complexity !== undefined
      ? { complexity: step.routingHint.complexity }
      : {}),
    ...(step.routingHint?.risk !== undefined ? { risk: step.routingHint.risk } : {}),
    // Phase 3 D8(a): thread the engine's one-shot bumped floor into route().
    // exactOptionalPropertyTypes ⇒ conditional spread, never an explicit undefined
    // (so a Phase-2 no-floor request stays byte-identical — SC8).
    ...(floor !== undefined ? { floor } : {}),
  };
}

/**
 * Run ONE stage through its routed backend. The engine drives `runSession`
 * DIRECTLY (never `runAgentInBackgroundTask`, which is issue-keyed and discards
 * the return value — orchestrator.ts:2135-2208) and owns per-stage state:
 *   - a per-stage `AbortController` (NOT `this.abortControllers`), so stages
 *     never clobber a shared issue-level abort (C1/D3);
 *   - per-stage token accrual summed off the yielded `usage` events (mirrors
 *     accrueUsage, state-machine.ts:567-591), written to `StageRun.tokens`;
 *   - a per-stage recorder attempt key `stageAttemptKey(index, attempt)` so N
 *     stages produce N distinct `streams/{issueId}/{key}.jsonl` recordings.
 * It captures the generator's RETURN value for this stage's `sessionId`. It
 * NEVER writes the issue-level `RunningEntry.session` field (C1/SC1-c).
 */
export async function runStageSession(
  ctx: WorkflowEngineContext,
  _unit: string,
  index: number,
  attempt: number,
  step: WorkflowExecutionPlan['stages'][number],
  backend: AgentBackend,
  priorOutputs: Record<string, string>
): Promise<StageRun> {
  const key = stageAttemptKey(index, attempt);
  const abort = new AbortController(); // C1: per-stage abort, NOT ctx-level abortControllers
  const startedAt = Date.now();
  let input = 0;
  let output = 0;
  let total = 0;
  // split-routing 4b: capture the stage's final assistant message (the last
  // `result` event's content) so it can thread to later stages. Mirrors the
  // single-agent lastMessage extraction (core/state-machine.ts result branch).
  let stageOutput: string | undefined;

  ctx.recorder.startRecording(
    ctx.issueId,
    ctx.externalId,
    ctx.identifier,
    backend.name,
    key,
    step.skill
  );

  const runner = ctx.makeRunner(backend);
  // split-routing 4b: render the REAL per-stage prompt (issue + stage role + prior
  // outputs) when the context provides a renderer; fall back to the bare skill
  // name only when it does not (fake contexts) — byte-identical to the old stub.
  // Per-phase routing: resolve the routed backend's locality (default non-local
  // when no resolver is present — SC3) and thread it so a local-endpoint stage
  // renders the `harness skill run --autonomous` indirection template.
  const local = ctx.isLocalBackend?.(backend) ?? false;
  const prompt = ctx.renderStagePrompt
    ? await ctx.renderStagePrompt(step, index, priorOutputs, local)
    : step.skill;
  const gen = runner.runSession(undefined, ctx.workspacePath, prompt);

  // D12 (SC7): arm a per-stage wall-clock deadline that fires `abort` if the stage
  // runs too long. A pending `abort` is resolved through `abortWaiter` so the drain
  // loop's `await` never blocks unboundedly even when the generator never yields
  // and never returns (an unbounded hang). Always cleared in `finally`.
  const deadlineMs = ctx.stageDeadlineMs ?? DEFAULT_STAGE_DEADLINE_MS;
  let onAbort: (() => void) | undefined;
  const abortWaiter = new Promise<'aborted'>((resolve) => {
    onAbort = () => resolve('aborted');
    abort.signal.addEventListener('abort', onAbort, { once: true });
  });
  const timer = setTimeout(() => abort.abort(), deadlineMs);

  let ret:
    | {
        sessionId: string;
        success: boolean;
        usage: { inputTokens: number; outputTokens: number; totalTokens: number };
      }
    | undefined;
  try {
    for (;;) {
      // Race the next event against the deadline abort so a never-yielding stage
      // cannot hang the loop (SC7). `Promise.race` returns 'aborted' the moment the
      // deadline fires; the still-pending gen.next() is discarded and cleaned up
      // via gen.return() below.
      const raced = await Promise.race([gen.next(), abortWaiter]);
      if (raced === 'aborted') {
        // carry-forward (a): drive the runner generator's `finally { stopSession }`
        // (runner.ts:108-110) so an aborted/deadlined stage never leaks a session.
        // `ret` stays unset → `passed=false` → feeds D8 (retry once → terminal).
        await gen.return(undefined as never);
        break;
      }
      const n = raced;
      if (n.done) {
        ret = n.value;
        break;
      }
      const ev = n.value;
      ctx.recorder.recordEvent(ctx.issueId, key, ev);
      if (ev.usage) {
        input += ev.usage.inputTokens;
        output += ev.usage.outputTokens;
        total += ev.usage.totalTokens;
      }
      // split-routing 4b: harvest the final assistant text from the `result`
      // event (last one wins). `resultEventText` never throws on the `unknown`
      // content shape, so a malformed/non-serializable result cannot turn a stage
      // into a terminal error — it just threads nothing.
      if (ev.type === 'result') {
        const captured = resultEventText(ev.content);
        if (captured !== undefined) stageOutput = captured;
      }
      // C1: if this stage's abort fired between events, stop draining and run the
      // runner's finally via gen.return() (same cleanup as the deadline path).
      if (abort.signal.aborted) {
        await gen.return(undefined as never);
        break;
      }
    }
  } finally {
    clearTimeout(timer);
    if (onAbort) abort.signal.removeEventListener('abort', onAbort);
  }

  ctx.recorder.finishRecording(ctx.issueId, key, 'normal', {
    inputTokens: input,
    outputTokens: output,
    turnCount: 0,
  });

  // Phase 3 gate evaluation (SC6-c): `passed` is the runner's own TurnResult.success
  // (v1). An aborted/deadlined stage leaves `ret` unset → `passed=false` (the
  // deadline path, Task 11). Only a `pass-required` gate can FAIL the unit;
  // `advisory` (or an absent gate) always passes regardless of `passed`.
  const passed = ret?.success ?? false;
  const outcome: StageRun['outcome'] = step.gate === 'pass-required' && !passed ? 'fail' : 'pass';

  const run: StageRun = {
    index,
    step,
    tokens: { input, output, total },
    outcome,
    attempt,
    durationMs: Date.now() - startedAt,
  };
  // C1: capture THIS stage's own sessionId (from the generator return), never
  // the issue-level session. Omitted (not `undefined`) if the stage aborted
  // before returning — exactOptionalPropertyTypes forbids an explicit undefined.
  if (ret) run.sessionId = ret.sessionId;
  // split-routing 4b: attach the captured final message so later stages can
  // thread it (omitted, not explicit-undefined, per exactOptionalPropertyTypes).
  if (stageOutput !== undefined) run.output = stageOutput;
  return run;
}

/**
 * D8(a): run ONE stage with the engine-owned retry cap of 1. Attempt 0 routes
 * normally; if a `pass-required` stage's quality gate fails (`outcome === 'fail'`)
 * the engine retries it EXACTLY ONCE at a bumped required floor
 * `nextTier(attempt-0 decision.tierRequired)`, threaded to `route()` via
 * `RoutingRequest.floor` (Task-5 Option A). A 2nd `pass-required` failure returns
 * `outcome:'fail'` with `attempt === 1` (no 3rd attempt). `advisory`/absent-gate
 * stages never fail the gate, so they never retry (`attempt === 0`).
 *
 * The engine retry is SEPARATE from the cumulative floor feed (D8b, Task 7): the
 * retry decision here is driven solely by THIS stage's `outcome`, never by
 * `recordOutcome`'s threshold climb (that was the rev-1 C3 conflation bug).
 *
 * Identity fallback (no `adaptiveRouter`) has no tier to bump, so it runs a single
 * attempt — its gate outcome still applies but no retry is possible.
 */
export async function runStageWithRetry(
  ctx: WorkflowEngineContext,
  unit: string,
  index: number,
  step: WorkflowExecutionPlan['stages'][number],
  priorRuns: StageRun[]
): Promise<StageRun> {
  let priorDecision: RoutingDecision | undefined;
  let run: StageRun | undefined;

  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      if (ctx.adaptiveRouter) {
        // attempt 0 → no engine floor; attempt 1 → bump to nextTier(prior tier).
        // This bump is a FLOOR derived from the prior attempt's tier, not an absolute
        // tier: route()'s max-by-rank makes it safe — if the unit's active escalation
        // floor is already higher, route() keeps the higher one, so we never route
        // below the active escalation floor.
        const floor: CapabilityTier | undefined =
          attempt >= 1 && priorDecision?.tierRequired !== undefined
            ? nextTier(priorDecision.tierRequired)
            : undefined;
        const req = buildStageRequest(step, unit, priorRuns, floor);
        const { decision } = await ctx.adaptiveRouter.route(req);
        priorDecision = decision;
        // route() returns def:BackendDef (no `name`); the backend name is
        // decision.backendName. Pass a name-only surface — real def→runner is Phase 4.
        const backend = { name: decision.backendName } as AgentBackend;
        run = await runStageSession(
          ctx,
          unit,
          index,
          attempt,
          step,
          backend,
          priorOutputs(priorRuns, step)
        );
        run.decision = decision;
        // One narrowed binding shared by the run.tier assign and the recordOutcome
        // guard below (readability; behavior identical).
        const tier = decision.tierRequired;
        if (tier !== undefined) run.tier = tier;
        // D8(b)/SC3 — the C3 fix: feed the CUMULATIVE unit floor once per ATTEMPT
        // with the REAL quality outcome. `ok` is false only on a `pass-required`
        // gate failure (advisory/absent gates always report `ok=true` — they never
        // climb the floor). This call is UNCONDITIONAL on quality and INSIDE the
        // attempt loop, so a failing attempt climbs the floor per EscalationState's
        // threshold INDEPENDENTLY of the engine's own retry decision below.
        if (tier !== undefined) {
          const ok = step.gate !== 'pass-required' || run.outcome === 'pass';
          ctx.adaptiveRouter.recordOutcome(unit, tier, ok);
        }
      } else {
        // Phase-1 identity fallback: no adaptive tier/retry (single attempt). Still
        // record THIS stage's routing decision (backend name + type) so downstream
        // locality detection works WITHOUT the adaptive router — notably the local
        // staged settle gate's `isLocal` check (settleWorkflowSuccess), which reads
        // `runs[last].decision?.backendName`. Without this a fully-local (no-AMR) unit
        // completes but its gate+ship is skipped (isLocal underivable) → it never
        // ships and loops via in_review re-dispatch. `stageDecisionFor` is absent on
        // fake/legacy contexts ⇒ decision stays unset (byte-identical legacy).
        const backend = ctx.resolveStageBackend(step);
        run = await runStageSession(
          ctx,
          unit,
          index,
          attempt,
          step,
          backend,
          priorOutputs(priorRuns, step)
        );
        const identityDecision = ctx.stageDecisionFor?.(step, backend);
        if (identityDecision !== undefined) run.decision = identityDecision;
      }
    } catch (err) {
      // D10 (SC6-b): a runner THROW mid-stage (transport/runner error) is TERMINAL
      // for the unit, NOT a retry. We attribute the error to THIS stage with
      // `outcome:'error'` and return it so executeWorkflow's `outcome !== 'pass'`
      // branch drives finalizeWorkflowTerminal(unit, runs, step) exactly once —
      // without re-entering the loop, re-running from stage 0, or calling
      // ensureWorkspace (prior-stage artifacts on the shared worktree are preserved).
      ctx.logger.error('workflow stage runner threw — terminal (D10)', {
        unit,
        stageIndex: index,
        attempt,
        skill: step.skill,
        err: err instanceof Error ? err.message : String(err),
      });
      return {
        index,
        step,
        tokens: { input: 0, output: 0, total: 0 },
        outcome: 'error',
        attempt,
        durationMs: 0,
      };
    }

    // A `pass-required` quality failure on attempt 0 triggers the single retry;
    // otherwise (pass, advisory, or the retry already ran) this run is final.
    const gateFailed = step.gate === 'pass-required' && run.outcome === 'fail';
    if (!gateFailed || attempt >= 1) return run;
  }

  // Unreachable in practice (the loop returns on attempt 1). Fail loud on the
  // invariant break rather than silently non-null-asserting — mirrors the
  // stageAttemptKey range guard.
  throw new Error('runStageWithRetry: loop exited without a run');
}

/**
 * Execute a multi-stage workflow's stages sequentially on one worktree. The
 * whole body is inside a `try` so EVERY exit path — all-pass, or any throw
 * between/within stages, or a throw from `emitWorkflowSuccess` itself — drives
 * EXACTLY ONE terminal transition (D6/I1/SC5). Reconciliation cannot clear an
 * orphaned `running` (state-machine.ts:288-303), so this single-exit guarantee
 * is load-bearing: the `catch` must be total and must never rethrow.
 */
export async function executeWorkflow(
  ctx: WorkflowEngineContext,
  plan: WorkflowExecutionPlan
): Promise<void> {
  const runs: StageRun[] = [];
  try {
    for (const [index, step] of plan.stages.entries()) {
      const run = await runStageWithRetry(ctx, plan.coherenceUnit, index, step, runs);
      runs.push(run);
      // D8(c)/D10 (SC6): a non-pass stage outcome (a `pass-required` quality
      // failure that survived the single engine retry, or a mid-stage runner
      // error) terminates the unit exactly once via finalizeWorkflowTerminal —
      // running/claimed delete + persistLaneSafe('abandon') + one needs-human +
      // cleanWorkspace — and downstream stages never run.
      if (run.outcome !== 'pass') {
        return await ctx.finalizeWorkflowTerminal(plan.coherenceUnit, runs, step);
      }
    }
    await ctx.emitWorkflowSuccess(plan.coherenceUnit, runs); // D6: one success exit
  } catch (err) {
    // I1 safety net: any throw in the loop (or in emitWorkflowSuccess) → exactly
    // one terminal transition, no orphaned running/claimed. Swallowed, not rethrown.
    await ctx.finalizeWorkflowTerminal(plan.coherenceUnit, runs, undefined, err);
  }
}

/**
 * split-routing 4b: extract a stage's final assistant text from a `result`
 * event's `content` (typed `unknown`). Mirrors the single-agent lastMessage
 * shape (core/state-machine.ts): a raw string, or a `{ result: string }`, else a
 * JSON stringification. NEVER throws — a circular/non-serializable payload yields
 * `undefined` (thread nothing) rather than propagating out of the stage and
 * turning it into a terminal error.
 */
function resultEventText(content: unknown): string | undefined {
  if (typeof content === 'string') return content;
  if (content !== null && typeof content === 'object') {
    const r = (content as { result?: unknown }).result;
    if (typeof r === 'string') return r;
  }
  try {
    return JSON.stringify(content);
  } catch {
    return undefined; // non-serializable → thread nothing (never crash the stage)
  }
}

/**
 * split-routing 4b (D4): thread prior stages' captured outputs to the next stage,
 * keyed by each stage's `produces` label (schema-required, non-empty). A stage
 * with no captured output (aborted / produced no `result` event) is skipped, so
 * the map only carries real artifacts. NOTE: if two stages declare the SAME
 * `produces` label the later one wins (last-write) — a downstream stage sees only
 * the most recent output for a given label. This is the TEXT channel (the common
 * case); file-artifact threading via `produces`/`expects` as paths is a separate
 * contract.
 *
 * `expects` (opt-in per stage) NARROWS the channel: when a stage declares
 * `expects: <label>`, only that one prior artifact is threaded — the operator
 * states exactly which upstream output this stage consumes, instead of every
 * prior output landing in every prompt (which bloats the prompt and widens the
 * injection surface). Absent `expects`, the FULL prior-output map is returned —
 * byte-identical to the pre-`expects` default. A schema-time refinement
 * (`schema.ts`) guarantees `expects` names a `produces` from an EARLIER stage, so
 * at runtime a set `expects` that misses the map means the producing stage simply
 * emitted no output (aborted / no `result` event) ⇒ nothing to thread.
 */
function priorOutputs(runs: StageRun[], step: WorkflowStep): Record<string, string> {
  const all: Record<string, string> = {};
  for (const run of runs) {
    if (run.output !== undefined) all[run.step.produces] = run.output;
  }
  if (step.expects === undefined) return all;
  // `hasOwnProperty`, not `all[step.expects] !== undefined`: a label that collides
  // with an Object.prototype member (`constructor`, `toString`, `__proto__`, …) is
  // schema-valid, and if its producer emitted no output a bare bracket lookup would
  // return the INHERITED prototype value (a function) instead of falling through to
  // the empty map. Guard on own-key presence so a no-output producer always threads
  // nothing, exactly as intended.
  return Object.prototype.hasOwnProperty.call(all, step.expects)
    ? { [step.expects]: all[step.expects]! }
    : {};
}
