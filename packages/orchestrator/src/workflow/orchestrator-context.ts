import type {
  AgentBackend,
  AgentEvent,
  CapabilityTier,
  Issue,
  RoutingDecision,
  RoutingRequest,
  RoutingUseCase,
  StageRun,
  TurnResult,
  WorkflowExecutionPlan,
} from '@harness-engineering/types';
import { AgentRunner } from '../agent/runner.js';
import type { OrchestratorBackendFactory } from '../agent/orchestrator-backend-factory.js';
import type { StreamRecorder } from '../core/stream-recorder.js';
import type { StructuredLogger } from '../logging/logger.js';
import type { WorkflowEngineContext } from './execute-workflow.js';

/**
 * split-routing Phase 4 — the narrow adaptive-router surface the workflow engine
 * consumes (`route` + `recordOutcome`). Structurally identical to
 * `WorkflowEngineContext.adaptiveRouter` and to the real `AdaptiveRouter`'s public
 * methods; typed here so the dep bag never depends on the concrete router class
 * (and never on `orchestrator.ts`).
 */
export interface WorkflowRouterDep {
  route(req: RoutingRequest): Promise<{ decision: RoutingDecision }>;
  recordOutcome(coherenceUnit: string, tier: CapabilityTier, ok: boolean): void;
}

/**
 * The dependency bag `buildWorkflowContext` composes the real
 * `WorkflowEngineContext` from. It is passed IN by `dispatchIssue` (Task 8) rather
 * than read off `this`, so this module imports only same-layer siblings
 * (`agent/runner`, `agent/orchestrator-backend-factory` types, `core/stream-recorder`)
 * and NEVER `orchestrator.ts` — the layer-cycle guard the context surface exists
 * for (concern #3). The two terminal seams are supplied as `settleSuccess` /
 * `settleTerminal` callbacks the orchestrator binds to its private methods (Task 7).
 */
export interface BuildWorkflowContextDeps {
  recorder: StreamRecorder;
  logger: StructuredLogger;
  /** The dispatch unit; issueId/identifier/externalId flow from here. */
  issue: Issue;
  /** The unit's ONE worktree (from the single `ensureWorkspace` in dispatchIssue). */
  workspacePath: string;
  /** `this.config.agent.maxTurns` — the per-stage runner turn cap. */
  maxTurns: number;
  /**
   * The orchestrator's backend factory. Used to materialize the real routed
   * backend for a stage: `forUseCase(useCase, { invocationOverride: name })`
   * mirrors the AMR dispatch swap (orchestrator.ts:2062-2064). `null` when
   * migration failed (legacy-only config) — then the identity fallback uses the
   * name-only `routingDefault` backend.
   */
  backendFactory: OrchestratorBackendFactory | null;
  /**
   * The real `AdaptiveRouter` (narrowed) when `routing.policy` is set
   * (orchestrator.ts:698), else `null` ⇒ the engine takes the identity fallback
   * (D5). Only `route`/`recordOutcome` are consumed.
   */
  adaptiveRouter: WorkflowRouterDep | null;
  /** `this.config.agent.routing?.default` — the identity-fallback backend name. */
  routingDefault: string | undefined;
  /** D12 override; absent ⇒ engine default DEFAULT_STAGE_DEADLINE_MS. */
  stageDeadlineMs?: number;
  /** Terminal-success seam (Task 6/7): bound to `settleWorkflowSuccess`. */
  settleSuccess: (unit: string, runs: StageRun[]) => Promise<void>;
  /** Terminal-failure/safety-net seam (Task 6/7): bound to `settleWorkflowTerminal`. */
  settleTerminal: (
    unit: string,
    runs: StageRun[],
    failingStep?: WorkflowExecutionPlan['stages'][number],
    err?: unknown
  ) => Promise<void>;
}

/**
 * Build the per-stage `RoutingUseCase` for a step. Mirrors the engine's own
 * `buildStageRequest` useCase derivation (execute-workflow.ts:135-139): a skill
 * use-case named by the step, with the optional cognitiveMode. Local so the
 * factory materialization (`forUseCase`) has a real use-case to resolve against.
 */
function buildStageUseCase(step: WorkflowExecutionPlan['stages'][number]): RoutingUseCase {
  return {
    kind: 'skill' as const,
    skillName: step.skill,
    ...(step.cognitiveMode !== undefined ? { cognitiveMode: step.cognitiveMode } : {}),
  };
}

/**
 * split-routing Phase 4 — compose the REAL `WorkflowEngineContext` (minus the two
 * terminal seams, which Task 6 completes) from orchestrator machinery.
 *
 * Seam → real code:
 *  - `recorder`/`logger`/`issueId`/`identifier`/`externalId`/`workspacePath` → the deps.
 *  - `stageDeadlineMs` → `deps.stageDeadlineMs` (conditional; engine defaults when absent).
 *  - `makeRunner(backend)` → `new AgentRunner(realBackend, { maxTurns })`. The engine
 *    passes a name-only backend for the routed path (execute-workflow.ts:320); we
 *    re-materialize the real backend from that name via
 *    `backendFactory.forUseCase(useCase, { invocationOverride: backend.name })`
 *    (same swap as orchestrator.ts:2062-2064). Its `runSession` returns a
 *    `TurnResult` (runner.ts:112) — the seam is already typed against it
 *    (carry-forward #9), confirmed self-documenting by the explicit annotation below.
 *  - `resolveStageBackend(step)` → identity fallback: `backendFactory.forUseCase(useCase)`
 *    when the factory exists, else a name-only backend from `routingDefault`.
 *  - `adaptiveRouter` → present iff `deps.adaptiveRouter !== null` (D5).
 *
 * The two TERMINAL seams (`emitWorkflowSuccess` / `finalizeWorkflowTerminal`,
 * SC5) are thin forwarders to the orchestrator's `settleSuccess` / `settleTerminal`
 * callbacks. They are NOT routed through `emitWorkerExit`/`handleWorkerExit`
 * (which fire the ISSUE-keyed `finishRecording(attempt)` + `recordAmrOutcome` — a
 * DOUBLE-fire, since the engine already ran PER-STAGE recorders + per-stage
 * `recordOutcome`). The reducer-reproduction (running.delete → completed.set →
 * claimed.delete → cleanWorkspace → persist → emit for success; and the
 * finalizeRoutingTerminal + needs-human + cleanWorkspace sequence for terminal)
 * lives in the orchestrator's private methods (Task 7) the callbacks bind to.
 */
export function buildWorkflowContext(deps: BuildWorkflowContextDeps): WorkflowEngineContext {
  const {
    recorder,
    logger,
    issue,
    workspacePath,
    maxTurns,
    backendFactory,
    adaptiveRouter,
    routingDefault,
  } = deps;

  /**
   * Materialize a real `AgentBackend` for `name`. The routed path yields a
   * name-only backend (`{ name: decision.backendName }`); we force that name
   * through the factory with an `invocationOverride`, exactly as the AMR dispatch
   * swap does, so local/pi resolvers + container wrapping still apply. When the
   * factory is absent (legacy-only config) the name-only backend is used as-is
   * (there is nothing to materialize).
   */
  const materialize = (useCase: RoutingUseCase, name: string): AgentBackend => {
    if (backendFactory === null) return { name } as AgentBackend;
    return backendFactory.forUseCase(useCase, { invocationOverride: name });
  };

  const ctx: WorkflowEngineContext = {
    recorder,
    logger,
    issueId: issue.id,
    identifier: issue.identifier,
    externalId: issue.externalId,
    workspacePath,
    ...(deps.stageDeadlineMs !== undefined ? { stageDeadlineMs: deps.stageDeadlineMs } : {}),

    makeRunner(backend: AgentBackend) {
      // The engine hands us either the identity backend (already real) or a
      // name-only routed backend; re-materialize by name so the runner always
      // drives a real, resolver/container-wrapped backend. A generic skill
      // use-case is sufficient because the name override pins the target
      // deterministically (the factory re-resolves the overridden name).
      const real = materialize({ kind: 'skill', skillName: 'workflow-stage' }, backend.name);
      const runner = new AgentRunner(real, { maxTurns });
      return {
        // The seam types `issue` as `unknown`; the real runner ignores its first
        // arg. Return type is annotated so the TurnResult seam is self-documenting
        // (carry-forward #9): runSession resolves to the runner's `TurnResult`.
        runSession: (
          _issue: unknown,
          ws: string,
          prompt: string
        ): AsyncGenerator<AgentEvent, TurnResult, void> =>
          runner.runSession(undefined as never, ws, prompt),
      };
    },

    resolveStageBackend(step) {
      const useCase = buildStageUseCase(step);
      if (backendFactory !== null) return backendFactory.forUseCase(useCase);
      // Legacy fallback (no factory): a name-only backend from routing.default.
      return { name: routingDefault ?? 'unknown' } as AgentBackend;
    },

    // SC5 terminal seams — thin forwarders to the orchestrator's settle methods
    // (Task 7). The reducer-reproduction lives THERE (running/completed/claimed
    // mutation + cleanWorkspace + lane persist + emit); crucially the SUCCESS path
    // must NOT re-enter emitWorkerExit (that double-fires the issue-keyed recorder
    // + AMR outcome the engine already owns per-stage). Exactly one settle per
    // terminal transition (D6/I1) — the engine's total try/catch guarantees the
    // single call; these forwarders never add a second.
    emitWorkflowSuccess(unit: string, runs: StageRun[]): Promise<void> {
      return deps.settleSuccess(unit, runs);
    },
    finalizeWorkflowTerminal(
      unit: string,
      runs: StageRun[],
      failingStep?: WorkflowExecutionPlan['stages'][number],
      err?: unknown
    ): Promise<void> {
      return deps.settleTerminal(unit, runs, failingStep, err);
    },

    ...(adaptiveRouter !== null
      ? {
          adaptiveRouter: {
            route: (req: RoutingRequest) => adaptiveRouter.route(req),
            recordOutcome: (unit: string, tier: CapabilityTier, ok: boolean) =>
              adaptiveRouter.recordOutcome(unit, tier, ok),
          },
        }
      : {}),
  };

  return ctx;
}
