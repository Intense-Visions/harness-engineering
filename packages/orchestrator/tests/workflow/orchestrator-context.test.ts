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
import { runStageSession, stageAttemptKey } from '../../src/workflow/execute-workflow.js';
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

/** A backend factory stub whose forUseCase returns a fresh MockBackend named per override. */
function makeFactoryStub() {
  return {
    forUseCase: vi.fn((_useCase: unknown, opts?: { invocationOverride?: string }) => {
      const name = opts?.invocationOverride ?? 'mock';
      // A MockBackend is fine; we only assert on the resolved name.
      const backend = new MockBackend();
      return new Proxy(backend, {
        get(target, prop) {
          if (prop === 'name') return name;
          return Reflect.get(target, prop);
        },
      }) as unknown as AgentBackend;
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
