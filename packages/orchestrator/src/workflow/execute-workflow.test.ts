import { describe, it, expect, vi } from 'vitest';
import type { AgentBackend, AgentEvent, StageRun, WorkflowStep } from '@harness-engineering/types';
import { stageAttemptKey, runStageSession } from './execute-workflow';
import type { WorkflowEngineContext } from './execute-workflow';

/** A minimal WorkflowStep for tests. */
function step(produces: string): WorkflowStep {
  return { skill: `skill-${produces}`, produces };
}

/** A fake backend that only needs a name (Phase 1 stub uses it for recorder keying). */
function fakeBackend(name = 'mock'): AgentBackend {
  return { name } as unknown as AgentBackend;
}

/**
 * Build a fake WorkflowEngineContext whose makeRunner returns a runSession
 * generator that yields one `usage` event then returns a per-stage sessionId.
 * `sessionIds` is indexed by the stage index the engine passes; `usagePerStage`
 * lets each stage surface distinct token usage. `runOrder` records the order in
 * which stages actually invoke runSession (proving sequential in-order execution).
 */
function makeFakeCtx(opts: {
  sessionIds: string[];
  usagePerStage?: { inputTokens: number; outputTokens: number; totalTokens: number }[];
  throwAtIndex?: number;
  onSuccess?: (unit: string, runs: StageRun[]) => void;
  onTerminal?: (unit: string, runs: StageRun[], err?: unknown) => void;
}): {
  ctx: WorkflowEngineContext;
  runOrder: number[];
  runWorkspaces: string[];
  startRecordingSpy: ReturnType<typeof vi.fn>;
  finishRecordingSpy: ReturnType<typeof vi.fn>;
  recordEventSpy: ReturnType<typeof vi.fn>;
  successCalls: StageRun[][];
  terminalCalls: StageRun[][];
} {
  const runOrder: number[] = [];
  const runWorkspaces: string[] = [];
  const successCalls: StageRun[][] = [];
  const terminalCalls: StageRun[][] = [];
  const startRecordingSpy = vi.fn();
  const finishRecordingSpy = vi.fn();
  const recordEventSpy = vi.fn();

  // Each makeRunner call corresponds to one stage; we infer the stage index
  // from how many runSession calls have happened (stages run sequentially).
  let nextStageIndex = 0;

  const ctx: WorkflowEngineContext = {
    recorder: {
      startRecording: startRecordingSpy,
      recordEvent: recordEventSpy,
      finishRecording: finishRecordingSpy,
    } as unknown as WorkflowEngineContext['recorder'],
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as WorkflowEngineContext['logger'],
    issueId: 'issue-1',
    identifier: 'issue-1',
    externalId: null,
    workspacePath: '/tmp/ws-shared',
    makeRunner: () => ({
      async *runSession(_issue: unknown, ws: string, _prompt: string) {
        const index = nextStageIndex++;
        runOrder.push(index);
        runWorkspaces.push(ws);
        if (opts.throwAtIndex === index) {
          throw new Error(`forced throw at stage ${index}`);
        }
        const usage = opts.usagePerStage?.[index] ?? {
          inputTokens: 100 + index,
          outputTokens: 50 + index,
          totalTokens: 150 + 2 * index,
        };
        const ev: AgentEvent = { type: 'usage', usage } as unknown as AgentEvent;
        yield ev;
        return { sessionId: opts.sessionIds[index] ?? `sess-${index}`, usage };
      },
    }),
    resolveStageBackend: () => fakeBackend(),
    emitWorkflowSuccess: async (unit, runs) => {
      successCalls.push(runs);
      opts.onSuccess?.(unit, runs);
    },
    finalizeWorkflowTerminal: async (unit, runs, _failingStep, err) => {
      terminalCalls.push(runs);
      opts.onTerminal?.(unit, runs, err);
    },
  };

  return {
    ctx,
    runOrder,
    runWorkspaces,
    startRecordingSpy,
    finishRecordingSpy,
    recordEventSpy,
    successCalls,
    terminalCalls,
  };
}

describe('stageAttemptKey (split-routing P1)', () => {
  it('produces distinct recorder attempt keys per (stageIndex, attempt) so streams do not clobber', () => {
    const keys = [
      stageAttemptKey(0, 0),
      stageAttemptKey(1, 0),
      stageAttemptKey(2, 0),
      stageAttemptKey(0, 1),
    ];
    expect(new Set(keys).size).toBe(4);
    // encoding is monotonic-per-stage and leaves room for the Phase-3 retry attempt
    expect(stageAttemptKey(0, 0)).toBe(0);
    expect(stageAttemptKey(1, 0)).toBe(1000);
    expect(stageAttemptKey(0, 1)).toBe(1);
  });
});

describe('runStageSession — engine-owned per-stage state (C1/split-routing P1)', () => {
  it('captures per-stage sessionId + tokens and records under the stage attempt key (SC1-b/-d)', async () => {
    const { ctx, startRecordingSpy, finishRecordingSpy } = makeFakeCtx({
      sessionIds: ['sess-0', 'sess-1', 'sess-2'],
      usagePerStage: [
        { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      ],
    });
    const backend = fakeBackend();
    // Drive stage index 1 directly (the runner infers index from call order; here
    // it is the first runSession call so it maps to index 0 in the fake — but
    // runStageSession must record under stageAttemptKey(1, 0) = 1000).
    const run = await runStageSession(ctx, 'issue-1', 1, 0, step('b'), backend, {});

    expect(run.index).toBe(1);
    expect(run.sessionId).toBe('sess-0'); // first runSession call → fake index 0 → sess-0
    // tokens accrued from THIS stage's events only
    expect(run.tokens).toEqual({ input: 0, output: 0, total: 0 });
    expect(run.outcome).toBe('pass');
    expect(run.attempt).toBe(0);

    // recorder keyed by the per-stage attempt key = stageAttemptKey(1,0) = 1000
    expect(startRecordingSpy).toHaveBeenCalledWith(
      'issue-1',
      null,
      expect.any(String),
      expect.any(String),
      1000,
      expect.anything()
    );
    expect(finishRecordingSpy).toHaveBeenCalledWith('issue-1', 1000, 'normal', expect.anything());
  });

  it('accrues per-stage tokens from the stage events (SC1-b)', async () => {
    const { ctx } = makeFakeCtx({
      sessionIds: ['sess-only'],
      usagePerStage: [{ inputTokens: 100, outputTokens: 50, totalTokens: 150 }],
    });
    const run = await runStageSession(ctx, 'issue-1', 0, 0, step('a'), fakeBackend(), {});
    expect(run.sessionId).toBe('sess-only');
    expect(run.tokens).toEqual({ input: 100, output: 50, total: 150 });
  });
});
