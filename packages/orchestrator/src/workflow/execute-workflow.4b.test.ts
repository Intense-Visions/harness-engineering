import { describe, it, expect, vi } from 'vitest';
import type {
  AgentEvent,
  Issue,
  RoutingDecision,
  WorkflowExecutionPlan,
  WorkflowStep,
} from '@harness-engineering/types';
import { buildWorkflowContext } from './orchestrator-context';
import { runStageWithRetry, executeWorkflow, type WorkflowEngineContext } from './execute-workflow';

/**
 * split-routing 4b — per-stage prompt rendering (issue + role + prior outputs)
 * and D4 text-artifact threading (stage N output → stage N+1 prompt).
 */

const step = (over: Partial<WorkflowStep> = {}): WorkflowStep => ({
  skill: 'implement',
  produces: 'code',
  ...over,
});

// Only the fields renderStagePrompt reads matter; cast covers Issue's other
// required fields (unused here).
const issue = (over: Partial<Issue> = {}): Issue =>
  ({
    id: 'issue-1',
    identifier: 'ISS-1',
    title: 'Add retry logic to the fetcher',
    description: 'Handle transient network failures with backoff.',
    ...over,
  }) as Issue;

function realCtx(iss: Issue): WorkflowEngineContext {
  return buildWorkflowContext({
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
    issue: iss,
    workspacePath: '/tmp/ws',
    maxTurns: 3,
    backendFactory: null,
    adaptiveRouter: null,
    routingDefault: 'primary',
    settleSuccess: async () => {},
    settleTerminal: async () => {},
  });
}

describe('renderStagePrompt (real template via buildWorkflowContext)', () => {
  it('renders a real prompt with the work item, stage number, and skill — not the bare skill name', async () => {
    const ctx = realCtx(issue());
    const prompt = await ctx.renderStagePrompt!(step({ skill: 'plan' }), 0, {});
    expect(prompt).not.toBe('plan'); // no longer the stub
    expect(prompt).toContain('stage 1');
    expect(prompt).toContain('plan');
    expect(prompt).toContain('Add retry logic to the fetcher'); // title
    expect(prompt).toContain('ISS-1'); // identifier
    expect(prompt).toContain('Handle transient network failures'); // description
    expect(prompt).not.toContain('Context from prior stages'); // none yet
  });

  it('threads prior-stage outputs into the prompt (D4)', async () => {
    const ctx = realCtx(issue());
    const prompt = await ctx.renderStagePrompt!(step({ skill: 'review' }), 1, {
      code: 'diff --git a/f.ts b/f.ts\n+ added retry',
    });
    expect(prompt).toContain('stage 2');
    expect(prompt).toContain('Context from prior stages');
    expect(prompt).toContain('code'); // the produces label
    expect(prompt).toContain('+ added retry'); // the prior output text
  });

  it('tolerates a null description without breaking strictVariables rendering', async () => {
    const ctx = realCtx(issue({ description: null }));
    const prompt = await ctx.renderStagePrompt!(step(), 0, {});
    expect(prompt).toContain('stage 1'); // rendered, no throw
  });
});

// ── Engine wiring: runStageSession uses the renderer + captures the result event ──

interface FakeOpts {
  resultContent?: unknown;
  onPrompt?: (p: string) => void;
  renderStagePrompt?: WorkflowEngineContext['renderStagePrompt'];
}

function fakeRecorder(): WorkflowEngineContext['recorder'] {
  return {
    startRecording: vi.fn(),
    recordEvent: vi.fn(),
    finishRecording: vi.fn(),
  } as unknown as WorkflowEngineContext['recorder'];
}

function fakeLogger(): WorkflowEngineContext['logger'] {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as WorkflowEngineContext['logger'];
}

// A runner whose single session yields opts.resultContent (when present) then
// returns a fixed success TurnResult. Extracted from fakeCtx so the generator's
// body doesn't nest 5 levels deep inside the context literal.
async function* fakeRunSession(
  opts: FakeOpts,
  prompt: string
): AsyncGenerator<AgentEvent, unknown, void> {
  opts.onPrompt?.(prompt);
  if (opts.resultContent !== undefined) {
    yield {
      type: 'result',
      content: opts.resultContent,
      timestamp: 't',
    } as unknown as AgentEvent;
  }
  return {
    sessionId: 'sess-0',
    success: true,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  };
}

function fakeCtx(opts: FakeOpts): WorkflowEngineContext {
  return {
    recorder: fakeRecorder(),
    logger: fakeLogger(),
    issueId: 'issue-1',
    identifier: 'ISS-1',
    externalId: null,
    workspacePath: '/tmp/ws',
    makeRunner: () => ({
      runSession: (_i: unknown, _ws: string, prompt: string) => fakeRunSession(opts, prompt),
    }),
    resolveStageBackend: () => ({ name: 'primary' }) as never,
    ...(opts.renderStagePrompt ? { renderStagePrompt: opts.renderStagePrompt } : {}),
    emitWorkflowSuccess: async () => {},
    finalizeWorkflowTerminal: async () => {},
  } as WorkflowEngineContext;
}

describe('runStageSession — prompt wiring + output capture', () => {
  it('passes the RENDERED prompt to the runner (not step.skill)', async () => {
    const prompts: string[] = [];
    const ctx = fakeCtx({
      onPrompt: (p) => prompts.push(p),
      renderStagePrompt: () => 'RENDERED PROMPT',
    });
    await runStageWithRetry(ctx, 'unit', 0, step({ skill: 'implement' }), []);
    expect(prompts).toEqual(['RENDERED PROMPT']);
  });

  it('falls back to the skill name when no renderer is provided (byte-identical old stub)', async () => {
    const prompts: string[] = [];
    const ctx = fakeCtx({ onPrompt: (p) => prompts.push(p) }); // no renderStagePrompt
    await runStageWithRetry(ctx, 'unit', 0, step({ skill: 'implement' }), []);
    expect(prompts).toEqual(['implement']);
  });

  it('captures the final result-event content as StageRun.output', async () => {
    const ctx = fakeCtx({ resultContent: 'the stage produced this text' });
    const run = await runStageWithRetry(ctx, 'unit', 0, step(), []);
    expect(run.output).toBe('the stage produced this text');
  });

  it('extracts .result from a structured result-event content', async () => {
    const ctx = fakeCtx({ resultContent: { result: 'structured result field' } });
    const run = await runStageWithRetry(ctx, 'unit', 0, step(), []);
    expect(run.output).toBe('structured result field');
  });

  it('leaves output absent when no result event is emitted', async () => {
    const ctx = fakeCtx({}); // runner yields nothing, just returns
    const run = await runStageWithRetry(ctx, 'unit', 0, step(), []);
    expect(run.output).toBeUndefined();
  });

  it('does NOT crash the stage on a circular/non-serializable result content', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular; // JSON.stringify would throw
    const ctx = fakeCtx({ resultContent: circular });
    const run = await runStageWithRetry(ctx, 'unit', 0, step(), []);
    // Threads nothing rather than turning the stage into a terminal error.
    expect(run.outcome).toBe('pass');
    expect(run.output).toBeUndefined();
  });
});

describe('executeWorkflow — stage N output threads to stage N+1 (D4)', () => {
  it("stage 2's renderStagePrompt receives stage 1's output keyed by its produces label", async () => {
    const renderCalls: { index: number; priorOutputs: Record<string, string> }[] = [];
    let stageIx = 0;
    const ctx: WorkflowEngineContext = {
      ...fakeCtx({}),
      // Each stage emits a distinct result; capture what each render sees.
      makeRunner: () => ({
        async *runSession(_i: unknown, _ws: string, _p: string) {
          const ix = stageIx++;
          yield {
            type: 'result',
            content: `output-${ix}`,
            timestamp: 't',
          } as unknown as AgentEvent;
          return {
            sessionId: `sess-${ix}`,
            success: true,
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      }),
      renderStagePrompt: (_step, index, priorOutputs) => {
        renderCalls.push({ index, priorOutputs: { ...priorOutputs } });
        return `prompt-${index}`;
      },
    };
    const plan: WorkflowExecutionPlan = {
      coherenceUnit: 'issue-1',
      stages: [
        step({ skill: 'implement', produces: 'code' }),
        step({ skill: 'review', produces: 'review' }),
      ],
    };
    await executeWorkflow(ctx, plan);

    expect(renderCalls).toHaveLength(2);
    expect(renderCalls[0]!.priorOutputs).toEqual({}); // stage 1 has no priors
    // stage 2 sees stage 1's output under stage 1's `produces` label.
    expect(renderCalls[1]!.priorOutputs).toEqual({ code: 'output-0' });
  });

  it('`expects` NARROWS the threaded channel to just the named prior artifact', async () => {
    const renderCalls: { index: number; priorOutputs: Record<string, string> }[] = [];
    let stageIx = 0;
    const ctx: WorkflowEngineContext = {
      ...fakeCtx({}),
      makeRunner: () => ({
        async *runSession(_i: unknown, _ws: string, _p: string) {
          const ix = stageIx++;
          yield {
            type: 'result',
            content: `output-${ix}`,
            timestamp: 't',
          } as unknown as AgentEvent;
          return {
            sessionId: `sess-${ix}`,
            success: true,
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      }),
      renderStagePrompt: (_step, index, priorOutputs) => {
        renderCalls.push({ index, priorOutputs: { ...priorOutputs } });
        return `prompt-${index}`;
      },
    };
    const plan: WorkflowExecutionPlan = {
      coherenceUnit: 'issue-1',
      stages: [
        step({ skill: 'spec', produces: 'spec' }),
        step({ skill: 'implement', produces: 'code' }),
        // Stage 3 expects only `spec` — it must NOT also receive `code`.
        step({ skill: 'review', produces: 'review', expects: 'spec' }),
      ],
    };
    await executeWorkflow(ctx, plan);

    expect(renderCalls).toHaveLength(3);
    expect(renderCalls[1]!.priorOutputs).toEqual({ spec: 'output-0' }); // no `expects` ⇒ all priors (only spec so far)
    // Stage 3 declared `expects: spec`, so `code` is filtered OUT.
    expect(renderCalls[2]!.priorOutputs).toEqual({ spec: 'output-0' });
  });

  it('an `expects` whose producer emitted no output threads nothing (empty map, not a crash)', async () => {
    const renderCalls: { index: number; priorOutputs: Record<string, string> }[] = [];
    let stageIx = 0;
    const ctx: WorkflowEngineContext = {
      ...fakeCtx({}),
      makeRunner: () => ({
        async *runSession(_i: unknown, _ws: string, _p: string) {
          const ix = stageIx++;
          // Stage 1 emits NO result event ⇒ no captured output for `spec`.
          if (ix > 0) {
            yield {
              type: 'result',
              content: `output-${ix}`,
              timestamp: 't',
            } as unknown as AgentEvent;
          }
          return {
            sessionId: `sess-${ix}`,
            success: true,
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      }),
      renderStagePrompt: (_step, index, priorOutputs) => {
        renderCalls.push({ index, priorOutputs: { ...priorOutputs } });
        return `prompt-${index}`;
      },
    };
    const plan: WorkflowExecutionPlan = {
      coherenceUnit: 'issue-1',
      stages: [
        step({ skill: 'spec', produces: 'spec' }),
        step({ skill: 'review', produces: 'review', expects: 'spec' }),
      ],
    };
    await executeWorkflow(ctx, plan);
    expect(renderCalls[1]!.priorOutputs).toEqual({}); // spec produced nothing ⇒ nothing threaded
  });

  // Runs `stages` where each stage's captured output is `content[i]` (undefined ⇒
  // the stage emits no result event). Returns what each render saw.
  async function threadOutputs(
    stages: WorkflowStep[],
    content: (string | undefined)[]
  ): Promise<Record<string, string>[]> {
    const seen: Record<string, string>[] = [];
    let stageIx = 0;
    const ctx: WorkflowEngineContext = {
      ...fakeCtx({}),
      makeRunner: () => ({
        async *runSession(_i: unknown, _ws: string, _p: string) {
          const ix = stageIx++;
          if (content[ix] !== undefined) {
            yield { type: 'result', content: content[ix], timestamp: 't' } as unknown as AgentEvent;
          }
          return {
            sessionId: `sess-${ix}`,
            success: true,
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      }),
      renderStagePrompt: (_step, index, priorOutputs) => {
        seen[index] = { ...priorOutputs };
        return `prompt-${index}`;
      },
    };
    await executeWorkflow(ctx, { coherenceUnit: 'issue-1', stages });
    return seen;
  }

  it('a prototype-name label (`constructor`) with a no-output producer threads {} — not the inherited member', async () => {
    // The producer of `constructor` emits nothing, so the label is not an OWN key
    // of the prior-output map. A bare bracket lookup would return
    // Object.prototype.constructor (a function); the hasOwnProperty guard must
    // instead thread nothing.
    const seen = await threadOutputs(
      [
        step({ skill: 'a', produces: 'constructor' }),
        step({ skill: 'b', produces: 'review', expects: 'constructor' }),
      ],
      [undefined, 'out-1']
    );
    expect(seen[1]).toEqual({}); // NOT { constructor: <function> }
  });

  it('a prototype-name label that IS produced threads its real value', async () => {
    const seen = await threadOutputs(
      [
        step({ skill: 'a', produces: 'toString' }),
        step({ skill: 'b', produces: 'review', expects: 'toString' }),
      ],
      ['real-value', 'out-1']
    );
    expect(seen[1]).toEqual({ toString: 'real-value' });
  });

  it('`expects` on a last-write label threads the LATER producer’s output', async () => {
    const seen = await threadOutputs(
      [
        step({ skill: 'draft', produces: 'code' }),
        step({ skill: 'refine', produces: 'code' }),
        step({ skill: 'review', produces: 'review', expects: 'code' }),
      ],
      ['first', 'second', 'out-2']
    );
    expect(seen[2]).toEqual({ code: 'second' }); // last-write wins
  });

  it('threads an empty-string output (not filtered as absent)', async () => {
    const seen = await threadOutputs(
      [
        step({ skill: 'a', produces: 'code' }),
        step({ skill: 'b', produces: 'review', expects: 'code' }),
      ],
      ['', 'out-1']
    );
    expect(seen[1]).toEqual({ code: '' });
  });
});

/**
 * SC1 (mode routing) + SC6 (source 'mode' telemetry). A staged stage carrying
 * `cognitiveMode: thinking` routes via `route()` to the reasoner backend and its
 * `decision.resolutionPath` carries a `source: 'mode'` step; an execution stage
 * (no cognitiveMode) routes to the default coder. This PINS the already-wired
 * per-stage routing (reconciliation: the wiring exists) as a regression guard.
 */
describe('per-mode stage routing (SC1/SC6)', () => {
  function decisionFor(mode: string | undefined): RoutingDecision {
    if (mode === 'thinking') {
      return {
        timestamp: 't',
        useCase: { kind: 'skill', skillName: 'x', cognitiveMode: 'thinking' },
        resolutionPath: [{ source: 'mode', candidate: 'reasoner', outcome: 'chosen' }],
        backendName: 'reasoner',
        backendType: 'ollama',
        durationMs: 0,
        tierRequired: 'strong',
      };
    }
    return {
      timestamp: 't',
      useCase: { kind: 'skill', skillName: 'x' },
      resolutionPath: [{ source: 'default', candidate: 'coder', outcome: 'chosen' }],
      backendName: 'coder',
      backendType: 'ollama',
      durationMs: 0,
    };
  }

  function routedCtx(): WorkflowEngineContext {
    return {
      ...fakeCtx({ resultContent: 'ok' }),
      adaptiveRouter: {
        route: async (req) => ({
          decision: decisionFor(
            'cognitiveMode' in req.useCase ? req.useCase.cognitiveMode : undefined
          ),
        }),
        recordOutcome: () => {},
      },
    } as WorkflowEngineContext;
  }

  it('routes a cognitiveMode:thinking design stage to the reasoner via a source:mode step (SC1/SC6)', async () => {
    const ctx = routedCtx();
    const run = await runStageWithRetry(
      ctx,
      'unit',
      0,
      step({ skill: 'harness-brainstorming', cognitiveMode: 'thinking', produces: 'spec' }),
      []
    );
    expect(run.decision?.backendName).toBe('reasoner');
    expect(run.decision?.resolutionPath.some((s) => s.source === 'mode')).toBe(true);
  });

  it('routes an execution stage (no cognitiveMode) to the default coder', async () => {
    const ctx = routedCtx();
    const run = await runStageWithRetry(
      ctx,
      'unit',
      1,
      step({ skill: 'harness-execution', produces: 'impl' }),
      []
    );
    expect(run.decision?.backendName).toBe('coder');
  });
});
