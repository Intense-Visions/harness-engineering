import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentRunner } from '../../src/agent/runner';
import type {
  AgentBackend,
  AgentEvent,
  AgentSession,
  Issue,
  SessionStartParams,
  TurnParams,
  TurnResult,
} from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';

interface MockBackendOptions {
  eventScripts: AgentEvent[][];
  results?: TurnResult[];
}

/**
 * Minimal mock backend that yields a scripted set of events for each turn,
 * then returns a TurnResult. Each call to runTurn pops one script.
 */
function makeMockBackend(opts: MockBackendOptions): AgentBackend {
  const eventQueue = [...opts.eventScripts];
  const resultQueue = [...(opts.results ?? [])];

  return {
    name: 'mock',
    async startSession(_params: SessionStartParams) {
      const session: AgentSession = {
        sessionId: 'test-session-id',
        workspacePath: '/tmp/ws',
        backendName: 'mock',
        startedAt: new Date().toISOString(),
      };
      return Ok(session);
    },
    async *runTurn(
      session: AgentSession,
      _params: TurnParams
    ): AsyncGenerator<AgentEvent, TurnResult, void> {
      const events = eventQueue.shift() ?? [];
      for (const evt of events) yield evt;
      return (
        resultQueue.shift() ?? {
          success: false,
          sessionId: session.sessionId,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        }
      );
    },
    async stopSession(_session: AgentSession) {
      return Ok(undefined);
    },
    async healthCheck() {
      return Ok(undefined);
    },
  };
}

async function drainUntilSleep(
  gen: AsyncGenerator<AgentEvent, TurnResult, void>
): Promise<{ events: AgentEvent[]; next: IteratorResult<AgentEvent, TurnResult> }> {
  const events: AgentEvent[] = [];
  let next = await gen.next();
  while (!next.done) {
    events.push(next.value);
    if (next.value.type === 'rate_limit_sleep') break;
    next = await gen.next();
  }
  return { events, next };
}

const testIssue: Issue = {
  id: 'issue-1',
  identifier: 'test-1',
  title: 't',
  description: '',
  state: 'planned',
  labels: [],
  priority: null,
  assignee: null,
  external: null,
  extras: {},
} as Issue;

describe('AgentRunner subscription rate limit sleep', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('yields a rate_limit_sleep event and actually sleeps when resetsAtMs is present', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T10:00:00Z'));

    const resetsAtMs = Date.UTC(2026, 4, 1, 10, 5, 0); // 5 minutes out
    const backend = makeMockBackend({
      eventScripts: [
        [
          {
            type: 'rate_limit',
            timestamp: new Date().toISOString(),
            content: { message: 'limit', resetsAtMs, resolved: 'exact' },
            sessionId: 'test-session-id',
          },
        ],
        [],
      ],
      results: [
        {
          success: false,
          sessionId: 'test-session-id',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
        {
          success: true,
          sessionId: 'test-session-id',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
      ],
    });

    const runner = new AgentRunner(backend, { maxTurns: 3 });
    const gen = runner.runSession(testIssue, '/tmp/ws', 'prompt');

    // Pump events until we hit rate_limit_sleep (which precedes the setTimeout).
    const { events } = await drainUntilSleep(gen);
    const sleepEvent = events.find((e) => e.type === 'rate_limit_sleep');
    expect(sleepEvent).toBeDefined();

    const content = sleepEvent!.content as {
      message: string;
      resetsAtMs: number;
      sleepMs: number;
      truncated: boolean;
    };
    expect(content.resetsAtMs).toBe(resetsAtMs);
    expect(content.sleepMs).toBe(5 * 60_000);
    expect(content.truncated).toBe(false);

    // Kick off the next step (which awaits setTimeout) and advance timers
    // to unblock it. Order matters: the promise must be started BEFORE we
    // advance, otherwise there's nothing queued to fast-forward.
    const nextPromise = gen.next();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    let next = await nextPromise;

    // Drain whatever else the runner emits until the session completes.
    while (!next.done) {
      const p = gen.next();
      await vi.advanceTimersByTimeAsync(0);
      next = await p;
    }
    expect(next.value.success).toBe(true);
  });

  it('flags the event as truncated and warns when the requested sleep exceeds MAX_SLEEP_MS', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T10:00:00Z'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 13 hours out → exceeds the 12-hour cap.
    const resetsAtMs = Date.now() + 13 * 60 * 60_000;
    const backend = makeMockBackend({
      eventScripts: [
        [
          {
            type: 'rate_limit',
            timestamp: new Date().toISOString(),
            content: { message: 'limit', resetsAtMs, resolved: 'exact' },
            sessionId: 'test-session-id',
          },
        ],
      ],
      results: [
        {
          success: false,
          sessionId: 'test-session-id',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
      ],
    });

    const runner = new AgentRunner(backend, { maxTurns: 1 });
    const gen = runner.runSession(testIssue, '/tmp/ws', 'prompt');
    const { events } = await drainUntilSleep(gen);

    const sleepEvent = events.find((e) => e.type === 'rate_limit_sleep');
    expect(sleepEvent).toBeDefined();
    const content = sleepEvent!.content as { sleepMs: number; truncated: boolean; message: string };
    expect(content.sleepMs).toBe(12 * 60 * 60_000);
    expect(content.truncated).toBe(true);
    expect(content.message).toContain('capped');

    expect(warnSpy).toHaveBeenCalled();

    // Drain the pending sleep so the generator cleanup runs.
    const nextPromise = gen.next();
    await vi.advanceTimersByTimeAsync(12 * 60 * 60_000);
    let next = await nextPromise;
    while (!next.done) {
      const p = gen.next();
      await vi.advanceTimersByTimeAsync(0);
      next = await p;
    }
  });

  it('does not sleep when rate_limit has no resetsAtMs (per-request limit)', async () => {
    const backend = makeMockBackend({
      eventScripts: [
        [
          {
            type: 'rate_limit',
            timestamp: new Date().toISOString(),
            content: { message: 'per-request limit' },
            sessionId: 'test-session-id',
          },
        ],
        [],
      ],
      results: [
        {
          success: false,
          sessionId: 'test-session-id',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
        {
          success: true,
          sessionId: 'test-session-id',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
      ],
    });

    const runner = new AgentRunner(backend, { maxTurns: 3 });
    const events: AgentEvent[] = [];
    const gen = runner.runSession(testIssue, '/tmp/ws', 'prompt');
    let next = await gen.next();
    while (!next.done) {
      events.push(next.value);
      next = await gen.next();
    }

    expect(events.some((e) => e.type === 'rate_limit_sleep')).toBe(false);
  });
});
