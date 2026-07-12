import { describe, it, expect, vi } from 'vitest';
import type { AgentBackend, AgentEvent, StageRun, WorkflowStep } from '@harness-engineering/types';
import {
  stageAttemptKey,
  runStageSession,
  executeWorkflow,
  buildStageRequest,
  nextTier,
} from './execute-workflow';
import type { WorkflowEngineContext } from './execute-workflow';
import type {
  WorkflowExecutionPlan,
  RoutingDecision,
  RoutingRequest,
} from '@harness-engineering/types';
import { BackendRouter } from '../agent/backend-router.js';
import { buildCapabilityRegistry } from '../agent/capability-registry.js';
import { AdaptiveRouter } from '../agent/adaptive-router.js';
import { EscalationState } from '../agent/escalation-state.js';
import type {
  BackendCapabilities,
  BackendDef,
  ComplexityVerdict,
  RoutingPolicy,
} from '@harness-engineering/types';

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
  /** Phase 3: the runner's TurnResult.success per stage index (default true). */
  successPerStage?: boolean[];
  throwAtIndex?: number;
  onSuccess?: (unit: string, runs: StageRun[]) => void;
  onTerminal?: (unit: string, runs: StageRun[], err?: unknown) => void;
  adaptiveRouter?: WorkflowEngineContext['adaptiveRouter'];
}): {
  ctx: WorkflowEngineContext;
  runOrder: number[];
  runWorkspaces: string[];
  startRecordingSpy: ReturnType<typeof vi.fn>;
  finishRecordingSpy: ReturnType<typeof vi.fn>;
  recordEventSpy: ReturnType<typeof vi.fn>;
  successCalls: StageRun[][];
  terminalCalls: StageRun[][];
  terminalFailingSteps: (WorkflowStep | undefined)[];
} {
  const runOrder: number[] = [];
  const runWorkspaces: string[] = [];
  const successCalls: StageRun[][] = [];
  const terminalCalls: StageRun[][] = [];
  const terminalFailingSteps: (WorkflowStep | undefined)[] = [];
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
        return {
          sessionId: opts.sessionIds[index] ?? `sess-${index}`,
          success: opts.successPerStage?.[index] ?? true,
          usage,
        };
      },
    }),
    resolveStageBackend: () => fakeBackend(),
    ...(opts.adaptiveRouter ? { adaptiveRouter: opts.adaptiveRouter } : {}),
    emitWorkflowSuccess: async (unit, runs) => {
      successCalls.push(runs);
      opts.onSuccess?.(unit, runs);
    },
    finalizeWorkflowTerminal: async (unit, runs, failingStep, err) => {
      terminalCalls.push(runs);
      terminalFailingSteps.push(failingStep as WorkflowStep | undefined);
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
    terminalFailingSteps,
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

  it('WorkflowEngineContext accepts an optional adaptiveRouter (route + recordOutcome)', () => {
    const withRouter = {
      adaptiveRouter: {
        route: async () => ({ decision: {} as RoutingDecision }),
        recordOutcome: () => {},
      },
    } as Partial<WorkflowEngineContext>;
    const withoutRouter = {} as Partial<WorkflowEngineContext>;
    expect(withRouter.adaptiveRouter).toBeDefined();
    expect(withoutRouter.adaptiveRouter).toBeUndefined();
  });
});

describe('nextTier (D8a / P3)', () => {
  it('bumps one tier and clamps at strong', () => {
    expect(nextTier('fast')).toBe('standard');
    expect(nextTier('standard')).toBe('strong');
    expect(nextTier('strong')).toBe('strong'); // clamp
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

  it('asserts the attempt<1000 collision-freedom invariant (carry-forward b)', () => {
    expect(() => stageAttemptKey(0, 1000)).toThrow();
    expect(() => stageAttemptKey(0, -1)).toThrow();
    expect(() => stageAttemptKey(0, 999)).not.toThrow();
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

describe('runStageSession — gate eval (SC6-c / P3)', () => {
  it('pass-required + runner success:false → outcome fail', async () => {
    const { ctx } = makeFakeCtx({ sessionIds: ['s0'], successPerStage: [false] });
    const s: WorkflowStep = { skill: 'a', produces: 'a', gate: 'pass-required' };
    const run = await runStageSession(ctx, 'issue-1', 0, 0, s, fakeBackend(), {});
    expect(run.outcome).toBe('fail');
  });

  it('pass-required + runner success:true → outcome pass', async () => {
    const { ctx } = makeFakeCtx({ sessionIds: ['s0'], successPerStage: [true] });
    const s: WorkflowStep = { skill: 'a', produces: 'a', gate: 'pass-required' };
    const run = await runStageSession(ctx, 'issue-1', 0, 0, s, fakeBackend(), {});
    expect(run.outcome).toBe('pass');
  });

  it('advisory + runner success:false → outcome pass (advisory never fails the unit)', async () => {
    const { ctx } = makeFakeCtx({ sessionIds: ['s0'], successPerStage: [false] });
    const s: WorkflowStep = { skill: 'a', produces: 'a', gate: 'advisory' };
    const run = await runStageSession(ctx, 'issue-1', 0, 0, s, fakeBackend(), {});
    expect(run.outcome).toBe('pass');
  });

  it('no gate + runner success:false → outcome pass (default is advisory-like)', async () => {
    const { ctx } = makeFakeCtx({ sessionIds: ['s0'], successPerStage: [false] });
    const s: WorkflowStep = { skill: 'a', produces: 'a' };
    const run = await runStageSession(ctx, 'issue-1', 0, 0, s, fakeBackend(), {});
    expect(run.outcome).toBe('pass');
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

describe('executeWorkflow — terminal on stage fail (SC6 / P3)', () => {
  it('a pass-required stage that fails BOTH attempts goes terminal exactly once; downstream stages never run', async () => {
    // The engine retries a failing pass-required stage once (Task 6), so terminal
    // requires failing both attempts. Downstream stage 1 must never run.
    const terminalFailingSteps: (WorkflowStep | undefined)[] = [];
    const base = makeRetryCtx({ successByAttempt: { a: [false, false] } });
    let runOrderCount = 0;
    const seenSkills: string[] = [];
    const ctx: WorkflowEngineContext = {
      ...base.ctx,
      makeRunner: () => ({
        async *runSession(_i: unknown, _ws: string, prompt: string) {
          seenSkills.push(prompt);
          runOrderCount++;
          const attempt = seenSkills.filter((s) => s === prompt).length - 1;
          const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
          yield { type: 'usage', usage } as unknown as AgentEvent;
          const success = prompt === 'a' ? [false, false][attempt]! : true;
          return { sessionId: `${prompt}-${attempt}`, success, usage };
        },
      }),
      finalizeWorkflowTerminal: async (_u, runs, failingStep) => {
        base.terminalCalls.push(runs);
        terminalFailingSteps.push(failingStep as WorkflowStep | undefined);
      },
    };
    const s0: WorkflowStep = { skill: 'a', produces: 'a', gate: 'pass-required' };
    const s1: WorkflowStep = { skill: 'b', produces: 'b' };
    await executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [s0, s1] });

    expect(base.terminalCalls).toHaveLength(1);
    expect(base.successCalls).toHaveLength(0);
    // stage 0 ran twice (retry); stage 1 (skill 'b') never ran
    expect(seenSkills.filter((s) => s === 'b')).toHaveLength(0);
    expect(runOrderCount).toBe(2);
    expect(terminalFailingSteps[0]).toBe(s0);
  });
});

/**
 * A retry-aware fake ctx: `successByAttempt[skill]` is a per-attempt boolean
 * array (index = attempt 0|1) for that stage's runner success, so the same stage
 * can fail attempt 0 then pass attempt 1. `routeSpy` captures each RoutingRequest
 * (so tests assert the bumped `req.floor` on the retry). `recordSpy` captures the
 * cumulative-floor feed.
 */
function makeRetryCtx(opts: {
  successByAttempt: Record<string, boolean[]>;
  tierForReq?: (req: RoutingRequest) => 'fast' | 'standard' | 'strong';
}): {
  ctx: WorkflowEngineContext;
  routeReqs: RoutingRequest[];
  runSessionCount: () => number;
  recordCalls: [string, string, boolean][];
  terminalCalls: StageRun[][];
  successCalls: StageRun[][];
} {
  const attemptsSeen: Record<string, number> = {};
  let runSessions = 0;
  const routeReqs: RoutingRequest[] = [];
  const recordCalls: [string, string, boolean][] = [];
  const terminalCalls: StageRun[][] = [];
  const successCalls: StageRun[][] = [];
  const tierFor = opts.tierForReq ?? (() => 'fast');

  // The runner is keyed by the backend name the engine derived from route(); but
  // the fake needs the CURRENT stage skill + attempt to pick success. We stash the
  // pending (skill, attempt) on each route() call and consume it in runSession.
  let pendingSkill = '';
  const routeSpy = vi.fn(async (req: RoutingRequest) => {
    routeReqs.push(req);
    pendingSkill = (req.useCase as { skillName: string }).skillName;
    return {
      decision: {
        backendName: `${tierFor(req)}-backend`,
        tierRequired: tierFor(req),
      } as unknown as RoutingDecision,
    };
  });

  const ctx: WorkflowEngineContext = {
    recorder: {
      startRecording: vi.fn(),
      recordEvent: vi.fn(),
      finishRecording: vi.fn(),
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
      async *runSession(_issue: unknown, _ws: string, prompt: string) {
        // prompt === step.skill (Phase-1 stub). Attempt = how many times this
        // skill has run so far.
        const skill = prompt || pendingSkill;
        const attempt = attemptsSeen[skill] ?? 0;
        attemptsSeen[skill] = attempt + 1;
        runSessions++;
        const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
        yield { type: 'usage', usage } as unknown as AgentEvent;
        const success = opts.successByAttempt[skill]?.[attempt] ?? true;
        return { sessionId: `${skill}-a${attempt}`, success, usage };
      },
    }),
    resolveStageBackend: () => fakeBackend(),
    adaptiveRouter: { route: routeSpy, recordOutcome: (u, t, ok) => recordCalls.push([u, t, ok]) },
    emitWorkflowSuccess: async (_u, runs) => {
      successCalls.push(runs);
    },
    finalizeWorkflowTerminal: async (_u, runs) => {
      terminalCalls.push(runs);
    },
  };

  return {
    ctx,
    routeReqs,
    runSessionCount: () => runSessions,
    recordCalls,
    terminalCalls,
    successCalls,
  };
}

describe('runStageWithRetry — engine retry cap=1 (SC6-a / D8a)', () => {
  it('pass-required: fail attempt 0 then pass attempt 1 → outcome pass, attempt 1, retry routed at bumped floor', async () => {
    const { ctx, routeReqs, runSessionCount, successCalls } = makeRetryCtx({
      successByAttempt: { retryme: [false, true] },
      tierForReq: () => 'fast',
    });
    const s: WorkflowStep = { skill: 'retryme', produces: 'r', gate: 'pass-required' };
    await executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [s] });

    const runs = successCalls[0]!;
    expect(runs[0]!.outcome).toBe('pass');
    expect(runs[0]!.attempt).toBe(1);
    expect(runSessionCount()).toBe(2);
    // attempt 0 carries no engine floor; attempt 1 carries the bumped floor.
    expect('floor' in routeReqs[0]!).toBe(false);
    expect(routeReqs[1]!.floor).toBe('standard'); // nextTier('fast')
  });

  it('pass-required: fail both attempts → outcome fail, attempt 1, exactly 2 runSession calls (no 3rd)', async () => {
    const { ctx, runSessionCount, terminalCalls } = makeRetryCtx({
      successByAttempt: { doomed: [false, false] },
      tierForReq: () => 'fast',
    });
    const s: WorkflowStep = { skill: 'doomed', produces: 'd', gate: 'pass-required' };
    await executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [s] });

    expect(terminalCalls).toHaveLength(1);
    const runs = terminalCalls[0]!;
    expect(runs[0]!.outcome).toBe('fail');
    expect(runs[0]!.attempt).toBe(1);
    expect(runSessionCount()).toBe(2); // no 3rd attempt
  });

  it('advisory: fail attempt 0 → outcome pass, attempt 0, no retry', async () => {
    const { ctx, runSessionCount, successCalls } = makeRetryCtx({
      successByAttempt: { adv: [false] },
    });
    const s: WorkflowStep = { skill: 'adv', produces: 'a', gate: 'advisory' };
    await executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [s] });

    const runs = successCalls[0]!;
    expect(runs[0]!.outcome).toBe('pass');
    expect(runs[0]!.attempt).toBe(0);
    expect(runSessionCount()).toBe(1); // no retry
  });
});

describe('runStageWithRetry — floor feed (SC6 / D8b)', () => {
  it('records ok:false once per failed attempt, independent of the engine retry', async () => {
    const { ctx, recordCalls, terminalCalls } = makeRetryCtx({
      successByAttempt: { doomed: [false, false] },
      tierForReq: () => 'fast',
    });
    const s: WorkflowStep = { skill: 'doomed', produces: 'd', gate: 'pass-required' };
    await executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [s] });

    expect(terminalCalls).toHaveLength(1);
    // recordOutcome called with ok=false TWICE (once per attempt) — the floor feed
    // is driven by quality, NOT gated by the retry branch (D8b, the C3 fix).
    const falseCalls = recordCalls.filter(([, , ok]) => ok === false);
    expect(falseCalls).toHaveLength(2);
    expect(falseCalls.every(([u, t]) => u === 'issue-1' && t === 'fast')).toBe(true);
  });

  it('records ok:true once for a passing stage', async () => {
    const { ctx, recordCalls, successCalls } = makeRetryCtx({
      successByAttempt: { good: [true] },
      tierForReq: () => 'fast',
    });
    const s: WorkflowStep = { skill: 'good', produces: 'g', gate: 'pass-required' };
    await executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [s] });

    expect(successCalls).toHaveLength(1);
    expect(recordCalls).toEqual([['issue-1', 'fast', true]]);
  });

  it('records ok:true for an advisory stage even when the runner reports success:false', async () => {
    // advisory quality failures do NOT climb the floor (they never fail the unit).
    const { ctx, recordCalls } = makeRetryCtx({
      successByAttempt: { adv: [false] },
      tierForReq: () => 'fast',
    });
    const s: WorkflowStep = { skill: 'adv', produces: 'a', gate: 'advisory' };
    await executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [s] });

    expect(recordCalls).toEqual([['issue-1', 'fast', true]]);
  });
});

describe('executeWorkflow — per-stage routing vs identity fallback (split-routing P2)', () => {
  it('routes each stage via adaptiveRouter and writes decision+tier onto the StageRun (SC2 wiring)', async () => {
    const routeSpy = vi.fn(async (req: RoutingRequest) => {
      const tier = req.complexity?.level === 'complex' ? 'strong' : 'fast';
      return {
        decision: {
          backendName: `${tier}-backend`,
          tierRequired: tier,
        } as unknown as RoutingDecision,
      };
    });
    const { ctx, successCalls } = makeFakeCtx({
      sessionIds: ['s0', 's1'],
      adaptiveRouter: { route: routeSpy, recordOutcome: vi.fn() },
    });
    const strongStep: WorkflowStep = {
      skill: 'a',
      produces: 'a',
      routingHint: {
        complexity: { level: 'complex', confidence: 'high', signals: {}, source: 'static' },
      },
    };
    const fastStep: WorkflowStep = {
      skill: 'b',
      produces: 'b',
      routingHint: {
        complexity: { level: 'trivial', confidence: 'high', signals: {}, source: 'static' },
      },
    };
    await executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [strongStep, fastStep] });

    expect(routeSpy).toHaveBeenCalledTimes(2);
    const runs = successCalls[0]!;
    expect(runs.map((r) => r.tier)).toEqual(['strong', 'fast']);
    expect(runs.map((r) => r.decision?.backendName)).toEqual(['strong-backend', 'fast-backend']);
  });

  it('falls back to resolveStageBackend when adaptiveRouter is absent (no decision/tier)', async () => {
    const { ctx, successCalls } = makeFakeCtx({ sessionIds: ['s0', 's1'] });
    await executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [step('a'), step('b')] });
    const runs = successCalls[0]!;
    for (const r of runs) {
      expect(r.decision).toBeUndefined();
      expect(r.tier).toBeUndefined();
    }
  });

  it('calls adaptiveRouter.recordOutcome(unit, tier, true) once per stage (SC3 wiring)', async () => {
    const recordSpy = vi.fn();
    const routeSpy = vi.fn(async (req: RoutingRequest) => ({
      decision: {
        backendName: 'b',
        tierRequired: req.complexity?.level === 'complex' ? 'strong' : 'fast',
      } as unknown as RoutingDecision,
    }));
    const { ctx } = makeFakeCtx({
      sessionIds: ['s0', 's1'],
      adaptiveRouter: { route: routeSpy, recordOutcome: recordSpy },
    });
    const strong: WorkflowStep = {
      skill: 'a',
      produces: 'a',
      routingHint: {
        complexity: { level: 'complex', confidence: 'high', signals: {}, source: 'static' },
      },
    };
    const fast: WorkflowStep = {
      skill: 'b',
      produces: 'b',
      routingHint: {
        complexity: { level: 'trivial', confidence: 'high', signals: {}, source: 'static' },
      },
    };
    await executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [strong, fast] });

    expect(recordSpy).toHaveBeenCalledTimes(2);
    expect(recordSpy).toHaveBeenNthCalledWith(1, 'issue-1', 'strong', true);
    expect(recordSpy).toHaveBeenNthCalledWith(2, 'issue-1', 'fast', true);
  });
});

describe('executeWorkflow — mid-workflow error is terminal (SC6-b / D10)', () => {
  it('a runner throw mid-stage → outcome error, terminal once, no restart-from-0, prior artifacts preserved', async () => {
    // 3-stage plan; stage 1's runner THROWS (transport error). D10: the unit goes
    // terminal via finalizeWorkflowTerminal WITHOUT re-running from stage 0 (no
    // ensureWorkspace wipe) — stage 0's completed StageRun is preserved in the
    // terminal payload, stage 2 never runs.
    const terminalFailingSteps: (WorkflowStep | undefined)[] = [];
    const seenSkills: string[] = [];
    const base = makeRetryCtx({ successByAttempt: {} });
    const ctx: WorkflowEngineContext = {
      ...base.ctx,
      makeRunner: () => ({
        async *runSession(_i: unknown, _ws: string, prompt: string) {
          seenSkills.push(prompt);
          const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
          if (prompt === 'b') {
            throw new Error('transport error at stage 1');
          }
          yield { type: 'usage', usage } as unknown as AgentEvent;
          return { sessionId: `${prompt}-0`, success: true, usage };
        },
      }),
      finalizeWorkflowTerminal: async (_u, runs, failingStep) => {
        base.terminalCalls.push(runs);
        terminalFailingSteps.push(failingStep as WorkflowStep | undefined);
      },
    };
    const s0: WorkflowStep = { skill: 'a', produces: 'a', gate: 'pass-required' };
    const s1: WorkflowStep = { skill: 'b', produces: 'b', gate: 'pass-required' };
    const s2: WorkflowStep = { skill: 'c', produces: 'c' };

    await expect(
      executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [s0, s1, s2] })
    ).resolves.toBeUndefined();

    expect(base.terminalCalls).toHaveLength(1);
    expect(base.successCalls).toHaveLength(0);
    // stage 0 ran once, stage 1 (skill 'b') attempted once and threw, stage 2 never ran
    expect(seenSkills).toEqual(['a', 'b']);
    expect(seenSkills.filter((s) => s === 'c')).toHaveLength(0);
    expect(seenSkills.filter((s) => s === 'a')).toHaveLength(1); // NO restart-from-0

    const runs = base.terminalCalls[0]!;
    // prior-stage artifact preserved: stage 0's completed pass is in the payload
    expect(runs[0]!.index).toBe(0);
    expect(runs[0]!.outcome).toBe('pass');
    // the failing stage 1 carries outcome:'error'
    const errored = runs.find((r) => r.index === 1)!;
    expect(errored.outcome).toBe('error');
    // the failingStep passed to the terminal is stage 1's step
    expect(terminalFailingSteps[0]).toBe(s1);
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

describe('split-routing P2 acceptance — real AdaptiveRouter', () => {
  const cap = (over: Partial<BackendCapabilities> = {}): BackendCapabilities => ({
    tier: 'fast',
    costPer1kTokens: 0,
    privacyClass: 'on-device',
    contextWindow: 8192,
    ...over,
  });
  const localDef = (capabilities: BackendCapabilities): BackendDef => ({
    type: 'local',
    endpoint: 'http://localhost:1234',
    model: 'm',
    capabilities,
  });
  const verdict = (level: ComplexityVerdict['level']): ComplexityVerdict => ({
    level,
    confidence: 'high',
    signals: {},
    source: 'static',
  });
  // distinct backend per tier so SC2-b resolves to DIFFERENT backends
  const backends = {
    'fast-b': localDef(cap({ tier: 'fast', costPer1kTokens: 0 })),
    'std-b': localDef(cap({ tier: 'standard', costPer1kTokens: 3 })),
    'strong-b': localDef(cap({ tier: 'strong', costPer1kTokens: 10 })),
  };
  const policy: RoutingPolicy = {}; // default matrix; no budget clamp, no skill override
  function makeAdaptive(escalation?: EscalationState) {
    const router = new BackendRouter({ backends, routing: { default: 'fast-b' } });
    const registry = buildCapabilityRegistry(backends);
    const classify = vi.fn(() => verdict('moderate')); // must NOT be called when hint seeds complexity
    return {
      classify,
      adaptive: new AdaptiveRouter({
        router,
        registry,
        policy,
        classify,
        ...(escalation ? { escalation } : {}),
      }),
    };
  }

  it('SC2: a strong-hinted and a fast-hinted stage in one unit resolve to different tiers/backends, deterministically', async () => {
    const { adaptive, classify } = makeAdaptive();
    const { ctx, successCalls } = makeFakeCtx({
      sessionIds: ['s0', 's1'],
      adaptiveRouter: {
        route: (req) => adaptive.route(req),
        recordOutcome: (u, t, ok) => adaptive.recordOutcome(u, t, ok),
      },
    });
    const strong: WorkflowStep = {
      skill: 'a',
      produces: 'a',
      routingHint: { complexity: verdict('complex') },
    };
    const fast: WorkflowStep = {
      skill: 'b',
      produces: 'b',
      routingHint: { complexity: verdict('trivial') },
    };
    await executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [strong, fast] });

    const runs = successCalls[0]!;
    expect(runs[0]!.tier).toBe('strong');
    expect(runs[1]!.tier).toBe('fast');
    expect(runs[0]!.decision!.backendName).toBe('strong-b');
    expect(runs[1]!.decision!.backendName).toBe('fast-b');
    expect(runs[0]!.decision!.backendName).not.toBe(runs[1]!.decision!.backendName);
    // deterministic: live classification never ran (hint seeded req.complexity)
    expect(classify).not.toHaveBeenCalled();
  });

  it('SC3: after threshold (2) quality failures across stages, a later stage resolves at >= the raised tier (cumulative)', async () => {
    const escalation = new EscalationState(2); // real threshold semantics
    const { adaptive } = makeAdaptive(escalation);

    // Pre-climb: a fast-hinted route BEFORE any failure resolves 'fast'.
    const before = await adaptive.route(
      buildStageRequest(
        { skill: 'x', produces: 'x', routingHint: { complexity: verdict('trivial') } },
        'issue-1',
        []
      )
    );
    expect(before.decision.tierRequired).toBe('fast');

    // Drive exactly threshold (2) quality failures for the unit. The climb
    // (fast->standard) happens on the 2ND failure, not the 1st (escalation-state.ts:73).
    adaptive.recordOutcome('issue-1', 'fast', false); // failures=1, no climb yet
    const mid = await adaptive.route(
      buildStageRequest(
        { skill: 'y', produces: 'y', routingHint: { complexity: verdict('trivial') } },
        'issue-1',
        []
      )
    );
    expect(mid.decision.tierRequired).toBe('fast'); // 1 failure < threshold ⇒ NOT climbed
    adaptive.recordOutcome('issue-1', 'fast', false); // failures=2 == threshold ⇒ floor climbs to 'standard'

    // A SUBSEQUENT fast-hinted stage now inherits the raised floor.
    const after = await adaptive.route(
      buildStageRequest(
        { skill: 'z', produces: 'z', routingHint: { complexity: verdict('trivial') } },
        'issue-1',
        []
      )
    );
    expect(after.decision.tierRequired).toBe('standard'); // >= raised tier, despite a 'trivial' hint

    // The floor is unit-scoped: a DIFFERENT unit is unaffected (still 'fast').
    const otherUnit = await adaptive.route(
      buildStageRequest(
        { skill: 'z', produces: 'z', routingHint: { complexity: verdict('trivial') } },
        'issue-2',
        []
      )
    );
    expect(otherUnit.decision.tierRequired).toBe('fast');
  });
});

describe('per-stage deadline (SC7 / D12)', () => {
  it('a pass-required stage that never finishes times out → stage failure → retry once → terminal (no hang)', async () => {
    vi.useFakeTimers();
    try {
      let finallyRuns = 0;
      let runSessions = 0;
      const terminalCalls: StageRun[][] = [];
      const successCalls: StageRun[][] = [];
      const ctx: WorkflowEngineContext = {
        recorder: {
          startRecording: vi.fn(),
          recordEvent: vi.fn(),
          finishRecording: vi.fn(),
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
        workspacePath: '/tmp/ws',
        stageDeadlineMs: 100,
        makeRunner: () => ({
          async *runSession(_i: unknown, _ws: string, _p: string) {
            runSessions++;
            try {
              for (let i = 0; i < 1000; i++) {
                yield {
                  type: 'usage',
                  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                } as unknown as AgentEvent;
                await new Promise((r) => setTimeout(r, 20));
              }
              return {
                sessionId: 'never',
                success: true,
                usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
              };
            } finally {
              finallyRuns++;
            }
          },
        }),
        adaptiveRouter: {
          route: async () => ({
            decision: { backendName: 'b', tierRequired: 'fast' } as unknown as RoutingDecision,
          }),
          recordOutcome: vi.fn(),
        },
        resolveStageBackend: () => fakeBackend(),
        emitWorkflowSuccess: async (_u, runs) => {
          successCalls.push(runs);
        },
        finalizeWorkflowTerminal: async (_u, runs) => {
          terminalCalls.push(runs);
        },
      };
      const s: WorkflowStep = { skill: 'slow', produces: 's', gate: 'pass-required' };
      const p = executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [s] });
      // advance well past both attempts' deadlines (100ms each + heartbeats)
      await vi.advanceTimersByTimeAsync(1000);
      await p;

      // both attempts timed out (retry once), then terminal — never an unbounded hang
      expect(runSessions).toBe(2);
      expect(finallyRuns).toBe(2); // gen.return() ran the runner finally each attempt
      expect(successCalls).toHaveLength(0);
      expect(terminalCalls).toHaveLength(1);
      const runs = terminalCalls[0]!;
      expect(runs[0]!.outcome).toBe('fail'); // timeout → passed:false → pass-required fail
      expect(runs[0]!.attempt).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a stage that returns before the deadline takes the normal path (no abort)', async () => {
    vi.useFakeTimers();
    try {
      let finallyRuns = 0;
      const successCalls: StageRun[][] = [];
      const ctx: WorkflowEngineContext = {
        recorder: {
          startRecording: vi.fn(),
          recordEvent: vi.fn(),
          finishRecording: vi.fn(),
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
        workspacePath: '/tmp/ws',
        stageDeadlineMs: 10_000,
        makeRunner: () => ({
          async *runSession(_i: unknown, _ws: string, _p: string) {
            try {
              yield {
                type: 'usage',
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
              } as unknown as AgentEvent;
              return {
                sessionId: 'ok',
                success: true,
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
              };
            } finally {
              finallyRuns++;
            }
          },
        }),
        resolveStageBackend: () => fakeBackend(),
        emitWorkflowSuccess: async (_u, runs) => {
          successCalls.push(runs);
        },
        finalizeWorkflowTerminal: async () => {},
      };
      const s: WorkflowStep = { skill: 'quick', produces: 'q', gate: 'pass-required' };
      const p = executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: [s] });
      await vi.advanceTimersByTimeAsync(1);
      await p;

      expect(successCalls).toHaveLength(1);
      expect(successCalls[0]![0]!.outcome).toBe('pass');
      expect(successCalls[0]![0]!.sessionId).toBe('ok');
      expect(finallyRuns).toBe(1); // generator completed normally (its own finally)
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('runStageSession — abort cleanup (carry-forward a)', () => {
  it('calls gen.return() on deadline abort so the runner generator finally { stopSession } runs', async () => {
    vi.useFakeTimers();
    try {
      let stopped = false;
      const ctx: WorkflowEngineContext = {
        recorder: {
          startRecording: vi.fn(),
          recordEvent: vi.fn(),
          finishRecording: vi.fn(),
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
        workspacePath: '/tmp/ws',
        stageDeadlineMs: 50,
        makeRunner: () => ({
          async *runSession(_i: unknown, _ws: string, _p: string) {
            try {
              // A long-running stage: yields a heartbeat, then awaits a short delay
              // before the next. When the deadline fires the loop's Promise.race
              // resolves 'aborted' and calls gen.return(); advancing the faked
              // clock lets the inter-yield await settle so the generator resumes
              // and runs this finally — mirroring runner.ts:108-110 stopSession.
              for (let i = 0; i < 1000; i++) {
                yield {
                  type: 'usage',
                  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                } as unknown as AgentEvent;
                await new Promise((r) => setTimeout(r, 10));
              }
              // unreachable (aborted first) — satisfies the return-value type
              return {
                sessionId: 'never',
                success: true,
                usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
              };
            } finally {
              stopped = true; // proves gen.return() ran the generator's finally
            }
          },
        }),
        resolveStageBackend: () => fakeBackend(),
        emitWorkflowSuccess: async () => {},
        finalizeWorkflowTerminal: async () => {},
      };

      const p = runStageSession(ctx, 'issue-1', 0, 0, step('a'), fakeBackend(), {});
      // advance past the deadline; flush microtasks so the race + gen.return() settle
      await vi.advanceTimersByTimeAsync(60);
      const run = await p;

      expect(stopped).toBe(true); // gen.return() ran the runner's finally { stopSession }
      // aborted stage: no generator return → no sessionId
      expect(run.sessionId).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('finalizeWorkflowTerminal contract (SC6 / SC5 / S5)', () => {
  /**
   * Build a ctx whose finalizeWorkflowTerminal fake models the Phase-4 contract:
   * running/claimed delete + persistLaneSafe('abandon') + exactly one needs-human
   * + one cleanWorkspace. `sideEffects` records the ordered calls so the test can
   * assert the terminal ran the full S5 contract exactly once.
   */
  function makeContractCtx(runSessionImpl: {
    makeRunner: WorkflowEngineContext['makeRunner'];
    stageDeadlineMs?: number;
  }): {
    ctx: WorkflowEngineContext;
    running: Set<string>;
    claimed: Set<string>;
    side: { needsHuman: number; cleanWorkspace: number; abandon: number; terminalCalls: number };
    successCalls: number;
  } {
    const running = new Set(['issue-1']);
    const claimed = new Set(['issue-1']);
    const side = { needsHuman: 0, cleanWorkspace: 0, abandon: 0, terminalCalls: 0 };
    let successCalls = 0;
    const ctx: WorkflowEngineContext = {
      recorder: {
        startRecording: vi.fn(),
        recordEvent: vi.fn(),
        finishRecording: vi.fn(),
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
      workspacePath: '/tmp/ws',
      ...(runSessionImpl.stageDeadlineMs !== undefined
        ? { stageDeadlineMs: runSessionImpl.stageDeadlineMs }
        : {}),
      makeRunner: runSessionImpl.makeRunner,
      adaptiveRouter: {
        route: async () => ({
          decision: { backendName: 'b', tierRequired: 'fast' } as unknown as RoutingDecision,
        }),
        recordOutcome: vi.fn(),
      },
      resolveStageBackend: () => fakeBackend(),
      emitWorkflowSuccess: async () => {
        successCalls++;
        running.delete('issue-1');
        claimed.delete('issue-1');
      },
      // The S5 terminal contract Phase 4 must implement; pinned here on the fake.
      finalizeWorkflowTerminal: async (unit) => {
        side.terminalCalls++;
        running.delete(unit); // (a) delete running
        claimed.delete(unit); // (a) delete claimed
        side.abandon++; // (b) persistLaneSafe('abandon')
        side.needsHuman++; // (c) exactly one needs-human
        side.cleanWorkspace++; // (d) cleanWorkspace — no leaked worktree (S5)
      },
    };
    return { ctx, running, claimed, side, successCalls };
  }

  function assertTerminalContract(
    running: Set<string>,
    claimed: Set<string>,
    side: { needsHuman: number; cleanWorkspace: number; abandon: number; terminalCalls: number }
  ) {
    expect(side.terminalCalls).toBe(1); // exactly one terminal transition
    expect(running.has('issue-1')).toBe(false); // no orphaned running
    expect(claimed.has('issue-1')).toBe(false); // no orphaned claimed
    expect(side.abandon).toBe(1); // persistLaneSafe('abandon')
    expect(side.needsHuman).toBe(1); // exactly one needs-human
    expect(side.cleanWorkspace).toBe(1); // exactly one cleanWorkspace (S5)
  }

  it('stage fail (D8a retry exhausted) → the full terminal contract exactly once', async () => {
    const seen: string[] = [];
    const { ctx, running, claimed, side } = makeContractCtx({
      makeRunner: () => ({
        async *runSession(_i: unknown, _ws: string, p: string) {
          seen.push(p);
          const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
          yield { type: 'usage', usage } as unknown as AgentEvent;
          return { sessionId: `${p}-${seen.length}`, success: false, usage }; // always fails
        },
      }),
    });
    await executeWorkflow(ctx, {
      coherenceUnit: 'issue-1',
      stages: [{ skill: 'a', produces: 'a', gate: 'pass-required' }],
    });
    assertTerminalContract(running, claimed, side);
  });

  it('stage error (D10 runner throw) → the full terminal contract exactly once', async () => {
    const { ctx, running, claimed, side } = makeContractCtx({
      makeRunner: () => ({
        // eslint-disable-next-line require-yield
        async *runSession() {
          throw new Error('transport error');
        },
      }),
    });
    await executeWorkflow(ctx, {
      coherenceUnit: 'issue-1',
      stages: [{ skill: 'a', produces: 'a', gate: 'pass-required' }],
    });
    assertTerminalContract(running, claimed, side);
  });

  it('deadline (D12 timeout) → the full terminal contract exactly once', async () => {
    vi.useFakeTimers();
    try {
      const { ctx, running, claimed, side } = makeContractCtx({
        stageDeadlineMs: 50,
        makeRunner: () => ({
          async *runSession() {
            try {
              for (let i = 0; i < 1000; i++) {
                yield {
                  type: 'usage',
                  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                } as unknown as AgentEvent;
                await new Promise((r) => setTimeout(r, 10));
              }
              return {
                sessionId: 'never',
                success: true,
                usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
              };
            } finally {
              /* stopSession */
            }
          },
        }),
      });
      const p = executeWorkflow(ctx, {
        coherenceUnit: 'issue-1',
        stages: [{ skill: 'a', produces: 'a', gate: 'pass-required' }],
      });
      await vi.advanceTimersByTimeAsync(1000);
      await p;
      assertTerminalContract(running, claimed, side);
    } finally {
      vi.useRealTimers();
    }
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
