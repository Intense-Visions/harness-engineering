import type {
  AgentBackend,
  AgentEvent,
  WorkflowExecutionPlan,
  StageRun,
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
