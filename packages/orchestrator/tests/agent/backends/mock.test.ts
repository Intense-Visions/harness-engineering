import { describe, it, expect } from 'vitest';
import { MockBackend } from '../../../src/agent/backends/mock';
import type { AgentEvent } from '@harness-engineering/types';

describe('MockBackend', () => {
  it('yields a terminal usage event so state machine sees token totals', async () => {
    // Regression: TurnResult.usage alone is invisible to the orchestrator's
    // for-await-of consumption loop. Backends — including mock — must surface
    // usage on at least one yielded event. Mock must uphold this contract so
    // integration tests that use MockBackend exercise the real token path.
    const backend = new MockBackend();
    const sessionResult = await backend.startSession({
      workspacePath: '/tmp/workspace',
      permissionMode: 'full',
    });
    expect(sessionResult.ok).toBe(true);
    if (!sessionResult.ok) return;

    const events: AgentEvent[] = [];
    const gen = backend.runTurn(sessionResult.value, {
      sessionId: sessionResult.value.sessionId,
      prompt: 'hi',
      isContinuation: false,
    });
    let next = await gen.next();
    while (!next.done) {
      events.push(next.value);
      next = await gen.next();
    }

    const withUsage = events.filter((e) => e.usage);
    expect(withUsage).toHaveLength(1);
    expect(withUsage[0]!.usage!.inputTokens).toBe(100);
    expect(withUsage[0]!.usage!.outputTokens).toBe(50);
    expect(withUsage[0]!.usage!.totalTokens).toBe(150);

    // TurnResult still carries the same totals so runner semantics are unchanged.
    expect(next.value.usage.inputTokens).toBe(100);
    expect(next.value.usage.outputTokens).toBe(50);
  });
});
