import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as child_process from 'node:child_process';
import { PassThrough } from 'node:stream';
import {
  ClaudeBackend,
  parseSubscriptionLimit,
  looksLikeUnparsedLimit,
} from '../../../src/agent/backends/claude';
import { CacheMetricsRecorder } from '@harness-engineering/core';
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

describe('ClaudeBackend cacheMetrics wiring', () => {
  const mockSpawn = vi.mocked(child_process.spawn);
  let session: AgentSession;

  beforeEach(async () => {
    const backend = new ClaudeBackend('claude');
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

  // Phase 5 Task 7: every completed Anthropic response (terminal assistant
  // chunk + result event) must record a prompt-cache observation so the
  // /api/v1/telemetry/cache/stats endpoint can surface live hit-rate.
  it('records cache hit/miss for terminal assistant chunks and result events', async () => {
    const recorder = new CacheMetricsRecorder();
    const recordSpy = vi.spyOn(recorder, 'record');
    const backend = new ClaudeBackend('claude', { cacheMetrics: recorder });
    const ses = (await backend.startSession({ workspacePath: '/tmp', permissionMode: 'full' }))
      .value as AgentSession;

    const child = createMockChild([
      // Terminal assistant chunk — stop_reason set, cache_read=0 -> miss
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }],
          stop_reason: 'tool_use',
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: 28604,
            cache_read_input_tokens: 0,
          },
        },
      },
      // Final result event — cache_read>0 -> hit
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'ok',
        session_id: ses.sessionId,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 1234,
        },
      },
    ]);
    mockSpawn.mockReturnValue(child as unknown as child_process.ChildProcess);

    await consumeTurn(
      backend.runTurn(ses, {
        sessionId: ses.sessionId,
        prompt: 'do work',
        isContinuation: false,
      })
    );

    // Two terminal observations: one miss (cache_read=0) and one hit (cache_read=1234).
    expect(recordSpy).toHaveBeenCalledTimes(2);
    expect(recordSpy).toHaveBeenNthCalledWith(1, 'anthropic', false, 28604, 0);
    expect(recordSpy).toHaveBeenNthCalledWith(2, 'anthropic', true, 0, 1234);

    const stats = recorder.getStats();
    expect(stats.totalRequests).toBe(2);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0.5);
    expect(stats.byBackend['anthropic']).toEqual({ hits: 1, misses: 1 });
  });

  it('does not record cache observations for intermediate (non-terminal) assistant chunks', async () => {
    const recorder = new CacheMetricsRecorder();
    const recordSpy = vi.spyOn(recorder, 'record');
    const backend = new ClaudeBackend('claude', { cacheMetrics: recorder });
    const ses = (await backend.startSession({ workspacePath: '/tmp', permissionMode: 'full' }))
      .value as AgentSession;

    const child = createMockChild([
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: '...', signature: 'sig' }],
          stop_reason: null,
          usage: {
            input_tokens: 6,
            output_tokens: 0,
            cache_creation_input_tokens: 999,
            cache_read_input_tokens: 0,
          },
        },
      },
    ]);
    mockSpawn.mockReturnValue(child as unknown as child_process.ChildProcess);

    await consumeTurn(
      backend.runTurn(ses, {
        sessionId: ses.sessionId,
        prompt: 'do work',
        isContinuation: false,
      })
    );

    expect(recordSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when no recorder is injected (existing call sites unaffected)', async () => {
    const backend = new ClaudeBackend('claude');
    const ses = (await backend.startSession({ workspacePath: '/tmp', permissionMode: 'full' }))
      .value as AgentSession;

    const child = createMockChild([
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'ok',
        session_id: ses.sessionId,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 5,
        },
      },
    ]);
    mockSpawn.mockReturnValue(child as unknown as child_process.ChildProcess);

    // Should consume cleanly with no recorder injected.
    const { result } = await consumeTurn(
      backend.runTurn(ses, {
        sessionId: ses.sessionId,
        prompt: 'do work',
        isContinuation: false,
      })
    );
    expect(result.success).toBe(true);
  });
});

describe('parseSubscriptionLimit', () => {
  it('parses standard rate limit message with simple hour', () => {
    const result = parseSubscriptionLimit(
      "You've hit your limit · resets 8pm (America/Indianapolis)"
    );
    expect(result).not.toBeNull();
    expect(result!.resetTime).toBe('8pm');
    expect(result!.timezone).toBe('America/Indianapolis');
    expect(result!.resetsAtMs).toBeGreaterThan(0);
  });

  it('parses message with curly quote', () => {
    const result = parseSubscriptionLimit(
      'You\u2019ve hit your limit \u00b7 resets 10pm (America/New_York)'
    );
    expect(result).not.toBeNull();
    expect(result!.resetTime).toBe('10pm');
    expect(result!.timezone).toBe('America/New_York');
  });

  it('parses message with minutes', () => {
    const result = parseSubscriptionLimit(
      "You've hit your limit · resets 11:30pm (America/Chicago)"
    );
    expect(result).not.toBeNull();
    expect(result!.resetTime).toBe('11:30pm');
    expect(result!.timezone).toBe('America/Chicago');
  });

  it('parses AM reset time', () => {
    const result = parseSubscriptionLimit(
      "You've hit your limit · resets 6am (America/Los_Angeles)"
    );
    expect(result).not.toBeNull();
    expect(result!.resetTime).toBe('6am');
    expect(result!.timezone).toBe('America/Los_Angeles');
  });

  it('returns null for non-matching lines', () => {
    expect(parseSubscriptionLimit('{"type": "assistant"}')).toBeNull();
    expect(parseSubscriptionLimit('')).toBeNull();
    expect(parseSubscriptionLimit('Some random output')).toBeNull();
    expect(parseSubscriptionLimit('Rate limit exceeded')).toBeNull();
  });

  it('computes a future reset time', () => {
    const result = parseSubscriptionLimit("You've hit your limit · resets 8pm (UTC)");
    expect(result).not.toBeNull();
    // The result should be a valid timestamp in the future or past+24h
    expect(result!.resetsAtMs).toBeGreaterThan(0);
    // Should be within 25 hours of now (either today or tomorrow)
    const diff = Math.abs(result!.resetsAtMs - Date.now());
    expect(diff).toBeLessThan(25 * 60 * 60_000);
  });

  it('returns a 1h fallback for unrecognized timezone and flags it', () => {
    const result = parseSubscriptionLimit("You've hit your limit · resets 8pm (Fake/Timezone_Xyz)");
    expect(result).not.toBeNull();
    expect(result!.resolved).toBe('fallback');
    // Should be approximately 1 hour from now (fallback)
    const diff = result!.resetsAtMs - Date.now();
    expect(diff).toBeGreaterThan(55 * 60_000);
    expect(diff).toBeLessThan(65 * 60_000);
  });

  it('flags successful parses as resolved=exact', () => {
    const result = parseSubscriptionLimit(
      "You've hit your limit · resets 8pm (America/Indianapolis)"
    );
    expect(result).not.toBeNull();
    expect(result!.resolved).toBe('exact');
  });

  it('computes the exact reset timestamp for UTC at a frozen clock', () => {
    // Freeze the clock at 2026-05-01T10:00:00Z. "8pm (UTC)" on the same day
    // is 2026-05-01T20:00:00Z — 10 hours from now.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-01T10:00:00Z'));
      const result = parseSubscriptionLimit("You've hit your limit · resets 8pm (UTC)");
      expect(result).not.toBeNull();
      expect(result!.resolved).toBe('exact');
      expect(result!.resetsAtMs).toBe(Date.UTC(2026, 4, 1, 20, 0, 0));
    } finally {
      vi.useRealTimers();
    }
  });

  it('wraps to next day when the reset time has already passed', () => {
    // Freeze at 2026-05-01T22:00:00Z. "8pm UTC" is two hours ago → wrap to
    // 2026-05-02T20:00:00Z.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-01T22:00:00Z'));
      const result = parseSubscriptionLimit("You've hit your limit · resets 8pm (UTC)");
      expect(result).not.toBeNull();
      expect(result!.resetsAtMs).toBe(Date.UTC(2026, 4, 2, 20, 0, 0));
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies the just-past grace window so near-miss resets do not wrap', () => {
    // Freeze at 2026-05-01T20:02:00Z — 2 min past "8pm UTC". Grace is 5 min,
    // so the reset should stay on today, not roll to tomorrow.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-01T20:02:00Z'));
      const result = parseSubscriptionLimit("You've hit your limit · resets 8pm (UTC)");
      expect(result).not.toBeNull();
      expect(result!.resetsAtMs).toBe(Date.UTC(2026, 4, 1, 20, 0, 0));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('looksLikeUnparsedLimit', () => {
  it('matches limit-like lines that the strict parser rejects', () => {
    expect(looksLikeUnparsedLimit('Rate limit reached. Resets soon.')).toBe(true);
    expect(looksLikeUnparsedLimit('Your quota resets at the top of the hour.')).toBe(true);
  });

  it('returns false for the canonical line (strict parser handles it)', () => {
    expect(looksLikeUnparsedLimit("You've hit your limit · resets 8pm (America/New_York)")).toBe(
      false
    );
  });

  it('returns false for unrelated output', () => {
    expect(looksLikeUnparsedLimit('{"type": "assistant"}')).toBe(false);
    expect(looksLikeUnparsedLimit('Some log line')).toBe(false);
    expect(looksLikeUnparsedLimit('')).toBe(false);
  });
});

describe('ClaudeBackend non-JSON rate limit detection', () => {
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

  it('yields a rate_limit event with resetsAtMs when the CLI outputs a subscription limit message', async () => {
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
          setTimeout(() => cb(0), 20);
        }
        return this;
      }),
    });

    setTimeout(() => {
      // Write a non-JSON rate limit line
      stdout.write("You've hit your limit \u00b7 resets 8pm (America/Indianapolis)\n");
      stdout.end();
      child.exitCode = 0;
    }, 10);

    mockSpawn.mockReturnValue(child as unknown as child_process.ChildProcess);

    const { events } = await consumeTurn(
      backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'do work',
        isContinuation: false,
      })
    );

    const rateLimitEvents = events.filter((e) => e.type === 'rate_limit');
    expect(rateLimitEvents).toHaveLength(1);

    const content = rateLimitEvents[0]!.content as {
      message: string;
      resetsAtMs: number;
      resetTime: string;
      timezone: string;
      resolved: 'exact' | 'fallback';
    };
    expect(content.resetTime).toBe('8pm');
    expect(content.timezone).toBe('America/Indianapolis');
    expect(content.resetsAtMs).toBeGreaterThan(0);
    expect(content.resolved).toBe('exact');
  });

  it('yields a rate_limit event WITHOUT resetsAtMs when the line looks limit-like but fails the strict parser', async () => {
    // Silence the expected console.warn from the drift logger
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const stdout = new PassThrough();
    const child = Object.assign(new PassThrough(), {
      stdout,
      stderr: new PassThrough(),
      stdin: new PassThrough(),
      pid: 12345,
      exitCode: null as number | null,
      kill: vi.fn(),
      on: vi.fn(function on(this: unknown, event: string, cb: (...args: unknown[]) => void) {
        if (event === 'exit') setTimeout(() => cb(0), 20);
        return this;
      }),
    });

    setTimeout(() => {
      // Non-canonical phrasing the CLI might produce after a format change.
      stdout.write('Rate limit reached. Your quota resets soon.\n');
      stdout.end();
      child.exitCode = 0;
    }, 10);

    mockSpawn.mockReturnValue(child as unknown as child_process.ChildProcess);

    const { events } = await consumeTurn(
      backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'do work',
        isContinuation: false,
      })
    );

    const rateLimitEvents = events.filter((e) => e.type === 'rate_limit');
    expect(rateLimitEvents).toHaveLength(1);

    const content = rateLimitEvents[0]!.content as { message: string; resetsAtMs?: number };
    expect(content.message).toContain('Rate limit reached');
    expect(content.resetsAtMs).toBeUndefined();
    // Drift should be logged so operators notice CLI format changes.
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
