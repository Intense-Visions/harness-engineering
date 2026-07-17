import { describe, it, expect, vi } from 'vitest';
import type {
  AgentEvent,
  BackendDef,
  Issue,
  WorkflowExecutionPlan,
  WorkflowStep,
} from '@harness-engineering/types';
import { buildWorkflowContext } from './orchestrator-context';
import { executeWorkflow, runStageWithRetry, type WorkflowEngineContext } from './execute-workflow';

/**
 * SC2 (prior-artifact handoff) + SC3 (graceful degradation) integration pins.
 * A staged run threads the design stage's captured output into the execution
 * stage's prompt over the text channel; and the local-aware stage-prompt seam
 * degrades byte-identically when locality is absent/false.
 */

const step = (over: Partial<WorkflowStep> = {}): WorkflowStep => ({
  skill: 'implement',
  produces: 'code',
  ...over,
});

const issue = (over: Partial<Issue> = {}): Issue =>
  ({
    id: 'issue-1',
    identifier: 'ISS-1',
    title: 'Add retry logic to the fetcher',
    description: 'Handle transient network failures with backoff.',
    ...over,
  }) as Issue;

function recorder(): WorkflowEngineContext['recorder'] {
  return {
    startRecording: vi.fn(),
    recordEvent: vi.fn(),
    finishRecording: vi.fn(),
  } as unknown as WorkflowEngineContext['recorder'];
}

function logger(): WorkflowEngineContext['logger'] {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as WorkflowEngineContext['logger'];
}

// A context built from the REAL buildWorkflowContext (real renderStagePrompt +
// isLocalBackend resolver), overriding makeRunner to record the prompt each stage
// receives and yield a stage-specific `result` event.
function integrationCtx(opts: {
  backends?: Record<string, BackendDef>;
  outputs: (string | undefined)[];
  onPrompt: (index: number, prompt: string) => void;
}): WorkflowEngineContext {
  const base = buildWorkflowContext({
    recorder: recorder(),
    logger: logger(),
    issue: issue(),
    workspacePath: '/tmp/ws',
    maxTurns: 3,
    backendFactory: null,
    adaptiveRouter: null,
    routingDefault: 'primary',
    ...(opts.backends ? { backends: opts.backends } : {}),
    settleSuccess: async () => {},
    settleTerminal: async () => {},
  });
  let stageIx = 0;
  return {
    ...base,
    makeRunner: () => ({
      async *runSession(_i: unknown, _ws: string, prompt: string) {
        const ix = stageIx++;
        opts.onPrompt(ix, prompt);
        if (opts.outputs[ix] !== undefined) {
          yield {
            type: 'result',
            content: opts.outputs[ix],
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
  } as WorkflowEngineContext;
}

describe('staged integration — execution stage reads design artifact (SC2)', () => {
  it("execution stage's prompt contains the design output inside the produces-labelled fence", async () => {
    const prompts: Record<number, string> = {};
    const ctx = integrationCtx({
      outputs: ['PROPOSAL BODY v1', undefined],
      onPrompt: (i, p) => {
        prompts[i] = p;
      },
    });
    const plan: WorkflowExecutionPlan = {
      coherenceUnit: 'issue-1',
      stages: [
        step({ skill: 'harness-brainstorming', cognitiveMode: 'thinking', produces: 'spec' }),
        step({ skill: 'harness-execution', expects: 'spec', produces: 'impl' }),
      ],
    };
    await executeWorkflow(ctx, plan);

    const execPrompt = prompts[1]!;
    expect(execPrompt).toContain('PROPOSAL BODY v1');
    // Inside the produces-labelled data fence (spec), not loose text.
    expect(execPrompt).toContain('<<<BEGIN spec>>>');
    expect(execPrompt).toContain('<<<END spec>>>');
    const begin = execPrompt.indexOf('<<<BEGIN spec>>>');
    const end = execPrompt.indexOf('<<<END spec>>>');
    expect(execPrompt.slice(begin, end)).toContain('PROPOSAL BODY v1');
  });
});

describe('staged integration — graceful degradation (SC3)', () => {
  it('a context with NO renderStagePrompt falls back to the bare skill name', async () => {
    const prompts: string[] = [];
    const ctx: WorkflowEngineContext = {
      recorder: recorder(),
      logger: logger(),
      issueId: 'issue-1',
      identifier: 'ISS-1',
      externalId: null,
      workspacePath: '/tmp/ws',
      makeRunner: () => ({
        async *runSession(_i: unknown, _ws: string, prompt: string) {
          prompts.push(prompt);
          yield* []; // no events; satisfies async-generator/require-yield
          return {
            sessionId: 'sess',
            success: true,
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          };
        },
      }),
      resolveStageBackend: () => ({ name: 'primary' }) as never,
      emitWorkflowSuccess: async () => {},
      finalizeWorkflowTerminal: async () => {},
    } as WorkflowEngineContext;
    await runStageWithRetry(ctx, 'unit', 0, step({ skill: 'harness-planning' }), []);
    expect(prompts[0]).toBe('harness-planning'); // bare skill name, no template
  });

  it('isLocalBackend=false ⇒ default STAGE_PROMPT_TEMPLATE output (no harness skill run)', async () => {
    const prompts: Record<number, string> = {};
    // No backends map ⇒ isLocalBackend resolver returns false ⇒ default template.
    const ctx = integrationCtx({
      outputs: ['x'],
      onPrompt: (i, p) => {
        prompts[i] = p;
      },
    });
    await runStageWithRetry(ctx, 'unit', 0, step({ skill: 'harness-planning' }), []);
    expect(prompts[0]).not.toContain('harness skill run');
    expect(prompts[0]).toContain('Perform the "harness-planning" step');
  });

  it('isLocalBackend=true ⇒ local-indirection prompt (harness skill run --autonomous)', async () => {
    const prompts: Record<number, string> = {};
    const localBackends: Record<string, BackendDef> = {
      // The routed identity backend is name-only 'primary' (routingDefault) in the
      // identity-fallback path; mark it local so the resolver selects the local template.
      primary: {
        type: 'ollama',
        endpoint: 'http://localhost:11434',
        model: ['qwen3-coder:30b'],
      } as unknown as BackendDef,
    };
    const ctx = integrationCtx({
      backends: localBackends,
      outputs: ['x'],
      onPrompt: (i, p) => {
        prompts[i] = p;
      },
    });
    await runStageWithRetry(ctx, 'unit', 0, step({ skill: 'harness-planning' }), []);
    // Pin the FULL indirection contract end-to-end: the stage's skill name threads
    // into the `harness skill run <skill> --autonomous` command, not just the fragments.
    expect(prompts[0]).toContain('harness skill run harness-planning --autonomous');
  });
});
