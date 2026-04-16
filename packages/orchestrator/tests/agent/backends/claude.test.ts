import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as child_process from 'node:child_process';
import { PassThrough } from 'node:stream';
import { ClaudeBackend } from '../../../src/agent/backends/claude';
import type { AgentSession, TurnResult, AgentEvent } from '@harness-engineering/types';

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof child_process>('node:child_process');
  return { ...actual, spawn: vi.fn() };
});

function createMockChild(events: Array<Record<string, unknown>>) {
  const stdout = new PassThrough();
  const stdin = new PassThrough();
  const child = Object.assign(new PassThrough(), {
    stdout,
    stderr: new PassThrough(),
    stdin,
    pid: 12345,
    exitCode: null as number | null,
    kill: vi.fn(),
    on: vi.fn(function on(this: unknown, event: string, cb: (...args: unknown[]) => void) {
      if (event === 'exit') {
        // fire exit after stream ends
        setTimeout(() => cb(0), 20);
      }
      return this;
    }),
  });

  setTimeout(() => {
    for (const evt of events) {
      stdout.write(JSON.stringify(evt) + '\n');
    }
    stdout.end();
    child.exitCode = 0;
  }, 10);

  return child;
}

async function consumeTurn(
  gen: AsyncGenerator<AgentEvent, TurnResult, void>
): Promise<{ events: AgentEvent[]; result: TurnResult }> {
  const events: AgentEvent[] = [];
  let next = await gen.next();
  while (!next.done) {
    events.push(next.value);
    next = await gen.next();
  }
  return { events, result: next.value };
}

describe('ClaudeBackend runTurn', () => {
  const mockSpawn = vi.mocked(child_process.spawn);
  let backend: ClaudeBackend;
  let session: AgentSession;

  beforeEach(async () => {
    backend = new ClaudeBackend('claude');
    const started = await backend.startSession({
      workspacePath: '/tmp/workspace',
      permissionMode: 'full',
    });
    if (!started.ok) throw new Error('failed to start session');
    session = started.value;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Regression for the "agent stuck in Continue your work. loop" bug:
  // Claude's stream-json `result` event uses { subtype: 'success', is_error: false },
  // not { success: true }. The backend must translate this into TurnResult.success === true
  // so AgentRunner's early-termination check actually fires.
  it('returns TurnResult.success === true when Claude result event has subtype=success / is_error=false', async () => {
    const child = createMockChild([
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'Task complete',
        session_id: session.sessionId,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 5,
        },
      },
    ]);
    mockSpawn.mockReturnValue(child as unknown as child_process.ChildProcess);

    const { result } = await consumeTurn(
      backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'do work',
        isContinuation: false,
      })
    );

    expect(result.success).toBe(true);
    expect(result.sessionId).toBe(session.sessionId);
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(50);
    expect(result.usage.totalTokens).toBe(150);
  });

  it('returns TurnResult.success === false when Claude result event has is_error=true', async () => {
    const child = createMockChild([
      {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        session_id: session.sessionId,
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    ]);
    mockSpawn.mockReturnValue(child as unknown as child_process.ChildProcess);

    const { result } = await consumeTurn(
      backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'do work',
        isContinuation: false,
      })
    );

    expect(result.success).toBe(false);
  });

  // Regression for dashboard showing 0 tokens during StreamingTurn:
  // Claude's stream-json emits per-request usage on each `assistant` event under
  // `message.usage`. The backend must surface that on the yielded AgentEvent so
  // the orchestrator state machine's `if (event.usage)` branch fires and updates
  // session token totals AND the rate-limiter's ITPM/OTPM windows in real time —
  // not just at the end of the turn via TurnResult (which the orchestrator's
  // for-await-of loop discards).
  it('attaches usage to the yielded event for the final chunk of an assistant message', async () => {
    const child = createMockChild([
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'Bash',
              input: { command: 'ls' },
            },
          ],
          stop_reason: 'tool_use',
          usage: {
            input_tokens: 6,
            output_tokens: 194,
            cache_creation_input_tokens: 28604,
            cache_read_input_tokens: 0,
          },
        },
      },
    ]);
    mockSpawn.mockReturnValue(child as unknown as child_process.ChildProcess);

    const { events } = await consumeTurn(
      backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'do work',
        isContinuation: false,
      })
    );

    const withUsage = events.filter((e) => e.usage);
    expect(withUsage).toHaveLength(1);
    expect(withUsage[0]!.usage!.inputTokens).toBe(6);
    expect(withUsage[0]!.usage!.outputTokens).toBe(194);
    expect(withUsage[0]!.usage!.totalTokens).toBe(200);
    expect(withUsage[0]!.usage!.cacheCreationTokens).toBe(28604);
  });

  // Intermediate chunks of a single API request share a requestId and carry
  // cumulative-ish usage. If the backend attached usage to every chunk, the
  // state machine's `+=` accumulator would double-count. Only the final chunk
  // (stop_reason !== null) should surface usage.
  it('does not attach usage to intermediate assistant chunks (stop_reason: null)', async () => {
    const child = createMockChild([
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'pondering...', signature: 'sig' }],
          stop_reason: null,
          usage: { input_tokens: 6, output_tokens: 0 },
        },
      },
    ]);
    mockSpawn.mockReturnValue(child as unknown as child_process.ChildProcess);

    const { events } = await consumeTurn(
      backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'do work',
        isContinuation: false,
      })
    );

    const withUsage = events.filter((e) => e.usage);
    expect(withUsage).toHaveLength(0);
  });

  // The final `result` event also carries aggregated usage at the top level.
  // Attach it to the yielded result AgentEvent so the state machine sees it.
  it('attaches usage to the yielded event for the terminal result event', async () => {
    const child = createMockChild([
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'done',
        session_id: session.sessionId,
        usage: { input_tokens: 1000, output_tokens: 500 },
      },
    ]);
    mockSpawn.mockReturnValue(child as unknown as child_process.ChildProcess);

    const { events } = await consumeTurn(
      backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'do work',
        isContinuation: false,
      })
    );

    const resultEvent = events.find((e) => e.type === 'result');
    expect(resultEvent).toBeDefined();
    expect(resultEvent!.usage).toBeDefined();
    expect(resultEvent!.usage!.inputTokens).toBe(1000);
    expect(resultEvent!.usage!.outputTokens).toBe(500);
    expect(resultEvent!.usage!.totalTokens).toBe(1500);
  });
});
