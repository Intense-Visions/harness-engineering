import { describe, it, expect, vi } from 'vitest';
import type {
  AgentBackend,
  WorkflowStep,
  StageRun,
  Issue,
  CapabilityTier,
  RoutingRequest,
  RoutingDecision,
} from '@harness-engineering/types';
import { buildWorkflowContext } from '../../src/workflow/orchestrator-context.js';
import {
  runStageSession,
  stageAttemptKey,
  executeWorkflow,
} from '../../src/workflow/execute-workflow.js';
import { MockBackend } from '../../src/agent/backends/mock.js';
import { StructuredLogger } from '../../src/logging/logger.js';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'issue-1',
    identifier: 'REV-42',
    title: 'title',
    description: null,
    priority: null,
    state: 'planned',
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    spec: null,
    plans: [],
    createdAt: null,
    updatedAt: null,
    externalId: 'gh:o/r#42',
    ...overrides,
  };
}

/** A spied recorder standing in for the orchestrator's StreamRecorder. */
function makeRecorderSpy() {
  return {
    startRecording: vi.fn(),
    recordEvent: vi.fn(),
    finishRecording: vi.fn(),
  };
}

/**
 * A backend factory stub. `forUseCase` returns a MockBackend named per override
 * (default 'mock'). `resolveName` returns the ROUTING KEY (default 'mock',
 * overridable) — the authoritative source stageDecisionFor must use. In production
 * a materialized backend's `.name` is its TYPE label (OllamaBackend.name ===
 * 'ollama'), NOT the routing key; reading `backend.name` is what made the first fix
 * inert. Tests pass `routingKey` distinct from the backend name to prove the fix
 * reads resolveName, not the backend.
 */
function makeFactoryStub(routingKey = 'mock') {
  return {
    forUseCase: vi.fn((_useCase: unknown, opts?: { invocationOverride?: string }) => {
      const name = opts?.invocationOverride ?? 'mock';
      const backend = new MockBackend();
      return new Proxy(backend, {
        get(target, prop) {
          if (prop === 'name') return name;
          return Reflect.get(target, prop);
        },
      }) as unknown as AgentBackend;
    }),
    resolveName: vi.fn((_useCase: unknown, opts?: { invocationOverride?: string }) => {
      return opts?.invocationOverride ?? routingKey;
    }),
  };
}

const logger = new StructuredLogger();

/** Common dep-bag builder (terminal seams are stubbed here; Task 6 exercises them). */
function baseDeps(overrides: Record<string, unknown> = {}) {
  return {
    recorder: makeRecorderSpy() as never,
    logger,
    issue: makeIssue(),
    workspacePath: '/tmp/ws-shared',
    maxTurns: 5,
    backendFactory: makeFactoryStub() as never,
    adaptiveRouter: null as never,
    routingDefault: 'mock',
    settleSuccess: vi.fn(async () => {}),
    settleTerminal: vi.fn(async () => {}),
    ...overrides,
  };
}

const step: WorkflowStep = { skill: 'review', produces: 'notes' };

describe('buildWorkflowContext — real seams (SC1/carry-forward)', () => {
  it('maps issueId/identifier/externalId/workspacePath from the issue dep', () => {
    const ctx = buildWorkflowContext(baseDeps());
    expect(ctx.issueId).toBe('issue-1');
    expect(ctx.identifier).toBe('REV-42');
    expect(ctx.externalId).toBe('gh:o/r#42');
    expect(ctx.workspacePath).toBe('/tmp/ws-shared');
  });

  it('makeRunner(backend) returns a runSession async generator returning TurnResult shape', async () => {
    const ctx = buildWorkflowContext(baseDeps());
    const runner = ctx.makeRunner({ name: 'mock' } as AgentBackend);
    const gen = runner.runSession(undefined, '/tmp/ws-shared', 'review');
    // Drain to completion and read the TurnResult-shaped return.
    let ret: { sessionId: string; success: boolean; usage: { totalTokens: number } } | undefined;
    for (;;) {
      const n = await gen.next();
      if (n.done) {
        ret = n.value as typeof ret;
        break;
      }
    }
    expect(ret?.sessionId).toBeTypeOf('string');
    expect(ret?.success).toBe(true);
    expect(ret?.usage.totalTokens).toBeGreaterThan(0);
  });

  it('adaptiveRouter is present when a non-null router dep is passed, absent when null (D5)', () => {
    const withRouter = buildWorkflowContext(
      baseDeps({
        adaptiveRouter: {
          route: async (_req: RoutingRequest) =>
            ({ decision: { backendName: 'strong', tierRequired: 'strong' } }) as {
              decision: RoutingDecision;
            },
          recordOutcome: (_u: string, _t: CapabilityTier, _ok: boolean) => {},
        } as never,
      })
    );
    expect(withRouter.adaptiveRouter).toBeDefined();

    const withoutRouter = buildWorkflowContext(baseDeps({ adaptiveRouter: null as never }));
    expect(withoutRouter.adaptiveRouter).toBeUndefined();
  });

  it('resolveStageBackend(step) materializes via the factory when present', () => {
    const ctx = buildWorkflowContext(baseDeps());
    const backend = ctx.resolveStageBackend(step);
    // factory stub returns a MockBackend (name "mock") when no override.
    expect(backend.name).toBe('mock');
  });

  // stageDecisionFor is the identity-path fix: without it, a fully-local (no-AMR)
  // staged unit's `run.decision` stays unset, so settleWorkflowSuccess cannot derive
  // `isLocal` and SKIPS the gate+ship → the unit completes but never ships and loops.
  it('stageDecisionFor(step) uses the ROUTING KEY from resolveName, not a backend .name type-label', () => {
    // routingKey 'local' resolves to a def; the materialized backend .name would be
    // 'mock' (≠ 'local'). Reading backend.name (the inert first-fix bug) would look
    // up backends['mock'] → undefined. Reading resolveName → backends['local'] → hit.
    const ctx = buildWorkflowContext(
      baseDeps({
        backendFactory: makeFactoryStub('local') as never,
        backends: { local: { type: 'ollama', endpoint: 'http://x', model: ['m'] } } as never,
      })
    );
    const decision = ctx.stageDecisionFor?.(step);
    // backendName is load-bearing — settleWorkflowSuccess reads exactly this to look
    // up the def and check isLocalEndpointBackend. Must be the routing key.
    expect(decision?.backendName).toBe('local');
    expect(decision?.backendType).toBe('ollama');
  });

  it('stageDecisionFor returns undefined when the resolved routing key is absent from the backends map', () => {
    const ctx = buildWorkflowContext(
      baseDeps({ backendFactory: makeFactoryStub('not-in-map') as never, backends: {} as never })
    );
    expect(ctx.stageDecisionFor?.(step)).toBeUndefined();
  });

  it('stageDecisionFor returns undefined when no backends map is provided (fake/legacy context)', () => {
    const ctx = buildWorkflowContext(baseDeps());
    expect(ctx.stageDecisionFor?.(step)).toBeUndefined();
  });

  it('resolveStageBackend(step) falls back to the routingDefault name when factory is null', () => {
    const ctx = buildWorkflowContext(
      baseDeps({ backendFactory: null as never, routingDefault: 'my-default' })
    );
    const backend = ctx.resolveStageBackend(step);
    expect(backend.name).toBe('my-default');
  });

  it('SC1: driving runStageSession accrues tokens, records at stageAttemptKey, carries the stage sessionId', async () => {
    const recorder = makeRecorderSpy();
    const ctx = buildWorkflowContext(baseDeps({ recorder: recorder as never }));
    const backend: AgentBackend = { name: 'mock' } as AgentBackend;
    const run: StageRun = await runStageSession(ctx, 'issue-1', 1, 0, step, backend, {});

    expect(run.tokens?.total).toBeGreaterThan(0);
    expect(run.sessionId).toBeTypeOf('string');
    // per-stage recorder key = stageAttemptKey(index=1, attempt=0)
    expect(recorder.startRecording).toHaveBeenCalledWith(
      'issue-1',
      'gh:o/r#42',
      'REV-42',
      'mock',
      stageAttemptKey(1, 0),
      'review'
    );
    expect(recorder.finishRecording).toHaveBeenCalledWith(
      'issue-1',
      stageAttemptKey(1, 0),
      'normal',
      expect.anything()
    );
  });

  it('threads stageDeadlineMs when provided, omits it otherwise (exactOptional)', () => {
    const withDeadline = buildWorkflowContext(baseDeps({ stageDeadlineMs: 42_000 }));
    expect(withDeadline.stageDeadlineMs).toBe(42_000);
    const withoutDeadline = buildWorkflowContext(baseDeps());
    expect('stageDeadlineMs' in withoutDeadline ? withoutDeadline.stageDeadlineMs : undefined).toBe(
      undefined
    );
  });
});

/**
 * SC5 — the single-exit terminal seams driven through the REAL context. The
 * context's `emitWorkflowSuccess`/`finalizeWorkflowTerminal` forward to the
 * orchestrator's settle callbacks; here we supply an in-test FAKE settle that
 * reproduces exactly the reducer sequence the orchestrator method will (Task 7),
 * so we can assert "exactly one of each, in order" — the same structural
 * single-unit invariants the Phase-1 fake context guaranteed.
 */
describe('terminal seams — single exit (SC5)', () => {
  /** An in-test fake orchestrator state + spied settle effects. */
  function makeFakeSettle() {
    const state = {
      running: new Map<string, unknown>(),
      claimed: new Set<string>(),
      completed: new Map<string, number>(),
    };
    const order: string[] = [];
    const persistLaneSafe = vi.fn(async (_unit: string, signal: string) => {
      order.push(`persist:${signal}`);
    });
    const cleanWorkspace = vi.fn(async () => {
      order.push('clean');
    });
    const needsHumanPush = vi.fn(() => {
      order.push('needs-human');
    });
    const emitStateChange = vi.fn(() => {
      order.push('emit');
    });

    const settleSuccess = vi.fn(async (unit: string, _runs: StageRun[]) => {
      // Reproduce state-machine.ts:457,467-474 (worker_exit / normal):
      state.running.delete(unit);
      state.completed.set(unit, Date.now());
      state.claimed.delete(unit);
      await cleanWorkspace();
      await persistLaneSafe(unit, 'success');
      emitStateChange();
    });
    const settleTerminal = vi.fn(
      async (unit: string, _runs: StageRun[], _step?: WorkflowStep, _err?: unknown) => {
        // Reproduce finalizeRoutingTerminal (orchestrator.ts:2388-2394) + needs-human
        // (:2301-2316) + cleanWorkspace (S5):
        state.running.delete(unit);
        state.claimed.delete(unit);
        await persistLaneSafe(unit, 'abandon');
        needsHumanPush();
        await cleanWorkspace();
        emitStateChange();
      }
    );

    return {
      state,
      order,
      persistLaneSafe,
      cleanWorkspace,
      needsHumanPush,
      emitStateChange,
      settleSuccess,
      settleTerminal,
    };
  }

  const twoSteps: WorkflowStep[] = [
    { skill: 'a', produces: 'x' },
    { skill: 'b', produces: 'y' },
  ];

  it('emitWorkflowSuccess forwards to settleSuccess exactly once, in reducer order', async () => {
    const fake = makeFakeSettle();
    fake.state.running.set('issue-1', {});
    fake.state.claimed.add('issue-1');
    const ctx = buildWorkflowContext(
      baseDeps({ settleSuccess: fake.settleSuccess, settleTerminal: fake.settleTerminal })
    );
    await ctx.emitWorkflowSuccess('issue-1', []);

    expect(fake.settleSuccess).toHaveBeenCalledTimes(1);
    expect(fake.settleTerminal).not.toHaveBeenCalled();
    expect(fake.state.running.has('issue-1')).toBe(false);
    expect(fake.state.claimed.has('issue-1')).toBe(false);
    expect(fake.state.completed.has('issue-1')).toBe(true);
    expect(fake.order).toEqual(['clean', 'persist:success', 'emit']);
  });

  it('finalizeWorkflowTerminal forwards to settleTerminal once — for fail and I1 err', async () => {
    const fake = makeFakeSettle();
    fake.state.running.set('issue-1', {});
    fake.state.claimed.add('issue-1');
    const ctx = buildWorkflowContext(
      baseDeps({ settleSuccess: fake.settleSuccess, settleTerminal: fake.settleTerminal })
    );
    // a fail with a failing step
    await ctx.finalizeWorkflowTerminal('issue-1', [], twoSteps[0]);
    // an I1 err-carrying call
    await ctx.finalizeWorkflowTerminal('issue-1', [], undefined, new Error('boom'));

    expect(fake.settleTerminal).toHaveBeenCalledTimes(2);
    expect(fake.needsHumanPush).toHaveBeenCalledTimes(2);
    expect(fake.state.running.has('issue-1')).toBe(false);
    expect(fake.state.claimed.has('issue-1')).toBe(false);
  });

  it('executeWorkflow all-pass → exactly one success settle, zero terminal (SC5)', async () => {
    const fake = makeFakeSettle();
    fake.state.running.set('issue-1', {});
    fake.state.claimed.add('issue-1');
    const ctx = buildWorkflowContext(
      baseDeps({ settleSuccess: fake.settleSuccess, settleTerminal: fake.settleTerminal })
    );
    await executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages: twoSteps });

    expect(fake.settleSuccess).toHaveBeenCalledTimes(1);
    expect(fake.settleTerminal).toHaveBeenCalledTimes(0);
    expect(fake.state.running.has('issue-1')).toBe(false);
    expect(fake.state.claimed.has('issue-1')).toBe(false);
    expect(fake.state.completed.has('issue-1')).toBe(true);
  });

  it('executeWorkflow stage-fail (pass-required) → zero success, exactly one terminal (SC5)', async () => {
    const fake = makeFakeSettle();
    fake.state.running.set('issue-1', {});
    fake.state.claimed.add('issue-1');
    // A backend whose runner reports success:false so a pass-required gate fails.
    const failingRunner = {
      // eslint-disable-next-line require-yield
      async *runSession() {
        return {
          sessionId: 's',
          success: false,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        };
      },
    };
    const ctx = {
      ...buildWorkflowContext(
        baseDeps({ settleSuccess: fake.settleSuccess, settleTerminal: fake.settleTerminal })
      ),
      // no adaptiveRouter ⇒ identity fallback single attempt; override makeRunner
      // to force the pass-required gate failure deterministically.
      makeRunner: () => failingRunner,
    };
    await executeWorkflow(ctx as never, {
      coherenceUnit: 'issue-1',
      stages: [{ skill: 'a', produces: 'x', gate: 'pass-required' }],
    });

    expect(fake.settleSuccess).toHaveBeenCalledTimes(0);
    expect(fake.settleTerminal).toHaveBeenCalledTimes(1);
    expect(fake.state.running.has('issue-1')).toBe(false);
    expect(fake.state.claimed.has('issue-1')).toBe(false);
  });

  it('executeWorkflow forced throw between stages → exactly one terminal, no orphans (SC5/I1)', async () => {
    const fake = makeFakeSettle();
    fake.state.running.set('issue-1', {});
    fake.state.claimed.add('issue-1');
    const throwingRunner = {
      // eslint-disable-next-line require-yield
      async *runSession() {
        throw new Error('runner blew up');
      },
    };
    const ctx = {
      ...buildWorkflowContext(
        baseDeps({ settleSuccess: fake.settleSuccess, settleTerminal: fake.settleTerminal })
      ),
      makeRunner: () => throwingRunner,
    };
    await executeWorkflow(ctx as never, { coherenceUnit: 'issue-1', stages: twoSteps });

    expect(fake.settleSuccess).toHaveBeenCalledTimes(0);
    expect(fake.settleTerminal).toHaveBeenCalledTimes(1);
    expect(fake.state.running.has('issue-1')).toBe(false);
    expect(fake.state.claimed.has('issue-1')).toBe(false);
  });
});
