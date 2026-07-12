import type {
  AgentBackend,
  AgentEvent,
  WorkflowExecutionPlan,
  StageRun,
  RoutingRequest,
  RoutingDecision,
  CapabilityTier,
} from '@harness-engineering/types';
import type { StreamRecorder } from '../core/stream-recorder';
import type { StructuredLogger } from '../logging/logger';

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
        usage: { inputTokens: number; outputTokens: number; totalTokens: number };
      },
      void
    >;
  };
  /** Phase 1 stub: resolve the single backend for a stage (Phase 2 replaces with route()). */
  resolveStageBackend(step: WorkflowExecutionPlan['stages'][number]): AgentBackend;
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
 */
export function stageAttemptKey(stageIndex: number, attempt: number): number {
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
  _floor?: CapabilityTier
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
  _priorOutputs: Record<string, unknown>
): Promise<StageRun> {
  const key = stageAttemptKey(index, attempt);
  const abort = new AbortController(); // C1: per-stage abort, NOT ctx-level abortControllers
  const startedAt = Date.now();
  let input = 0;
  let output = 0;
  let total = 0;

  ctx.recorder.startRecording(
    ctx.issueId,
    ctx.externalId,
    ctx.identifier,
    backend.name,
    key,
    step.skill
  );

  const runner = ctx.makeRunner(backend);
  // Phase 1: prompt is a stub derived from the step; Phase 2/4 render real per-stage prompts.
  const gen = runner.runSession(undefined, ctx.workspacePath, step.skill);

  let ret:
    | {
        sessionId: string;
        usage: { inputTokens: number; outputTokens: number; totalTokens: number };
      }
    | undefined;
  for (;;) {
    const n = await gen.next();
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
    // C1: if this stage's abort fired, stop draining events. `ret` stays unset
    // (no generator return) → the stage carries no sessionId for the aborted run.
    if (abort.signal.aborted) break;
  }

  ctx.recorder.finishRecording(ctx.issueId, key, 'normal', {
    inputTokens: input,
    outputTokens: output,
    turnCount: 0,
  });

  const run: StageRun = {
    index,
    step,
    tokens: { input, output, total },
    outcome: 'pass', // Phase 1: no gates/routing — every stage passes (Phase 3 adds gate eval)
    attempt,
    durationMs: Date.now() - startedAt,
  };
  // C1: capture THIS stage's own sessionId (from the generator return), never
  // the issue-level session. Omitted (not `undefined`) if the stage aborted
  // before returning — exactOptionalPropertyTypes forbids an explicit undefined.
  if (ret) run.sessionId = ret.sessionId;
  return run;
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
      let run: StageRun;
      if (ctx.adaptiveRouter) {
        // Phase 2: route this stage under the shared coherenceUnit. `floor` is
        // omitted (Phase 3 supplies the bumped required floor on engine retry).
        const req = buildStageRequest(step, plan.coherenceUnit, runs);
        const { decision } = await ctx.adaptiveRouter.route(req);
        // route() returns def:BackendDef (no `name`); the backend name is
        // decision.backendName. Pass a name-only surface — real def→runner is Phase 4.
        const backend = { name: decision.backendName } as AgentBackend;
        run = await runStageSession(
          ctx,
          plan.coherenceUnit,
          index,
          0,
          step,
          backend,
          priorOutputs(runs)
        );
        run.decision = decision;
        // exactOptionalPropertyTypes: assign `tier` only when tierRequired is defined.
        if (decision.tierRequired !== undefined) run.tier = decision.tierRequired;
      } else {
        // Phase-1 identity fallback (byte-unchanged): no decision/tier, no recordOutcome.
        const backend = ctx.resolveStageBackend(step);
        run = await runStageSession(
          ctx,
          plan.coherenceUnit,
          index,
          0,
          step,
          backend,
          priorOutputs(runs)
        );
      }
      runs.push(run);
      // Phase 1 has no gates → runs never fail; Phase 3 adds:
      //   if (run.outcome !== 'pass') return finalizeWorkflowTerminal(...)
    }
    await ctx.emitWorkflowSuccess(plan.coherenceUnit, runs); // D6: one success exit
  } catch (err) {
    // I1 safety net: any throw in the loop (or in emitWorkflowSuccess) → exactly
    // one terminal transition, no orphaned running/claimed. Swallowed, not rethrown.
    await ctx.finalizeWorkflowTerminal(plan.coherenceUnit, runs, undefined, err);
  }
}

function priorOutputs(_runs: StageRun[]): Record<string, unknown> {
  // Phase 1 stub; Phase 2/D4 threads produces→expects across the shared worktree.
  return {};
}
