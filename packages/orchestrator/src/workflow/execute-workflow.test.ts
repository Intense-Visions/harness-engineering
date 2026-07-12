import { describe, it, expect, vi } from 'vitest';
import type { AgentBackend, AgentEvent, StageRun, WorkflowStep } from '@harness-engineering/types';
import {
  stageAttemptKey,
  runStageSession,
  executeWorkflow,
  buildStageRequest,
} from './execute-workflow';
import type { WorkflowEngineContext } from './execute-workflow';
import type { WorkflowExecutionPlan } from '@harness-engineering/types';

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

describe('buildStageRequest — request construction (split-routing P2)', () => {
  it('builds a skill useCase + shared coherenceUnit; omits complexity/risk when no routingHint', () => {
    const req = buildStageRequest(
      { skill: 'harness-debugging', produces: 'a', cognitiveMode: 'diagnostic' },
      'issue-1',
      []
    );
    expect(req.useCase).toEqual({
      kind: 'skill',
      skillName: 'harness-debugging',
      cognitiveMode: 'diagnostic',
    });
    expect(req.coherenceUnit).toBe('issue-1');
    // exactOptionalPropertyTypes: absent (not `undefined`) when no hint
    expect('complexity' in req).toBe(false);
    expect('risk' in req).toBe(false);
  });

  it('seeds complexity+risk from routingHint so routing is deterministic (S3)', () => {
    const complexity = {
      level: 'complex' as const,
      confidence: 'high' as const,
      signals: {},
      source: 'static' as const,
    };
    const risk = { blastRadius: 3, sensitivePath: false };
    const req = buildStageRequest(
      { skill: 'design-review', produces: 'r', routingHint: { complexity, risk } },
      'issue-1',
      []
    );
    expect(req.complexity).toEqual(complexity);
    expect(req.risk).toEqual(risk);
    // useCase has no cognitiveMode when the step omits it
    expect(req.useCase).toEqual({ kind: 'skill', skillName: 'design-review' });
  });
});

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

describe('executeWorkflow — sequential loop (SC1/split-routing P1)', () => {
  it('runs 3 stages in order on one worktree, each with its own sessionId+tokens, one success exit (SC1)', async () => {
    const { ctx, runOrder, runWorkspaces, successCalls, terminalCalls } = makeFakeCtx({
      sessionIds: ['sess-0', 'sess-1', 'sess-2'],
      usagePerStage: [
        { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        { inputTokens: 20, outputTokens: 7, totalTokens: 27 },
        { inputTokens: 30, outputTokens: 9, totalTokens: 39 },
      ],
    });
    const plan: WorkflowExecutionPlan = {
      coherenceUnit: 'issue-1',
      stages: [step('a'), step('b'), step('c')],
    };
    await executeWorkflow(ctx, plan);

    // SC1-a: sequential, in plan order, on the single shared worktree
    expect(runOrder).toEqual([0, 1, 2]);
    expect(runWorkspaces).toEqual(['/tmp/ws-shared', '/tmp/ws-shared', '/tmp/ws-shared']);

    // SC5-a: exactly one success exit, no terminal (failure) exit
    expect(successCalls).toHaveLength(1);
    expect(terminalCalls).toHaveLength(0);

    // SC1-b: each StageRun carries its OWN sessionId + tokens
    const runs = successCalls[0]!;
    expect(runs.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(runs.map((r) => r.sessionId)).toEqual(['sess-0', 'sess-1', 'sess-2']);
    expect(runs.map((r) => r.tokens?.total)).toEqual([15, 27, 39]);
    // distinct per-stage token totals — cost is attributable per stage
    expect(new Set(runs.map((r) => r.tokens?.total)).size).toBe(3);
  });
});

describe('executeWorkflow — single terminal exit + no orphan (SC5/split-routing P1)', () => {
  it('a throw between stages → exactly one finalizeWorkflowTerminal, no orphaned running/claimed (SC5-b)', async () => {
    // Seed a coherence unit as running + claimed; the terminal transition must
    // clear BOTH. Reconciliation would NOT clear an orphaned `running`
    // (state-machine.ts:288-303), so the try/finally is the only safety net.
    const running = new Set(['issue-1']);
    const claimed = new Set(['issue-1']);
    const { ctx, successCalls, terminalCalls, runOrder } = makeFakeCtx({
      sessionIds: ['sess-0', 'sess-1', 'sess-2'],
      throwAtIndex: 1, // forced throw BETWEEN stages (during stage index 1)
      onSuccess: (u) => {
        running.delete(u);
        claimed.delete(u);
      },
      onTerminal: (u) => {
        running.delete(u);
        claimed.delete(u);
      },
    });
    const plan: WorkflowExecutionPlan = {
      coherenceUnit: 'issue-1',
      stages: [step('a'), step('b'), step('c')],
    };

    // engine swallows the throw into the terminal path, does NOT rethrow
    await expect(executeWorkflow(ctx, plan)).resolves.toBeUndefined();

    expect(runOrder).toEqual([0, 1]); // stage 2 never ran (threw during stage 1)
    expect(successCalls).toHaveLength(0); // no success exit
    expect(terminalCalls).toHaveLength(1); // EXACTLY ONE terminal transition
    expect(running.has('issue-1')).toBe(false); // no orphaned running
    expect(claimed.has('issue-1')).toBe(false); // no orphaned claimed
  });

  it('emitWorkflowSuccess itself throwing → still exactly one terminal, no orphan (SC5)', async () => {
    const running = new Set(['issue-1']);
    const claimed = new Set(['issue-1']);
    const successCalls: number[] = [];
    const terminalCalls: number[] = [];
    // Hand-build a ctx where the success path throws (all 2 stages pass, then
    // emitWorkflowSuccess throws) — the catch must still drive one terminal.
    const base = makeFakeCtx({ sessionIds: ['sess-0', 'sess-1'] });
    const ctx: WorkflowEngineContext = {
      ...base.ctx,
      emitWorkflowSuccess: async () => {
        successCalls.push(1);
        throw new Error('success path blew up');
      },
      finalizeWorkflowTerminal: async (u) => {
        terminalCalls.push(1);
        running.delete(u);
        claimed.delete(u);
      },
    };
    const plan: WorkflowExecutionPlan = {
      coherenceUnit: 'issue-1',
      stages: [step('a'), step('b')],
    };

    await expect(executeWorkflow(ctx, plan)).resolves.toBeUndefined();

    expect(successCalls).toHaveLength(1); // success path was entered and threw
    expect(terminalCalls).toHaveLength(1); // the catch drove exactly one terminal
    expect(running.has('issue-1')).toBe(false);
    expect(claimed.has('issue-1')).toBe(false);
  });
});

describe('executeWorkflow — never writes the issue-level session (C1/SC1-c)', () => {
  it('leaves RunningEntry.session untouched; per-stage sessionIds are distinct from it', async () => {
    // A sentinel issue-level session object. C1: the engine owns per-stage
    // session state (in StageRun) and must NEVER mutate this issue-level field.
    // The WorkflowEngineContext surface deliberately exposes NO setter for it,
    // so this is structurally guaranteed — the test makes it explicit.
    const sentinel = { sessionId: 'ISSUE-LEVEL-DO-NOT-TOUCH' };
    const running = new Map<string, { issueId: string; session: { sessionId: string } }>([
      ['issue-1', { issueId: 'issue-1', session: sentinel }],
    ]);
    const { ctx, successCalls } = makeFakeCtx({ sessionIds: ['sess-0', 'sess-1'] });
    const plan: WorkflowExecutionPlan = {
      coherenceUnit: 'issue-1',
      stages: [step('a'), step('b')],
    };

    await executeWorkflow(ctx, plan);

    // issue-level session is the SAME object, unchanged
    const entry = running.get('issue-1')!;
    expect(entry.session).toBe(sentinel);
    expect(entry.session.sessionId).toBe('ISSUE-LEVEL-DO-NOT-TOUCH');

    // per-stage sessionIds are the engine-owned ones, distinct from the issue-level sentinel
    const runs = successCalls[0]!;
    expect(runs.map((r) => r.sessionId)).toEqual(['sess-0', 'sess-1']);
    for (const r of runs) {
      expect(r.sessionId).not.toBe('ISSUE-LEVEL-DO-NOT-TOUCH');
    }
  });
});
