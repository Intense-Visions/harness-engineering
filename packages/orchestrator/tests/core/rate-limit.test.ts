import { describe, it, expect } from 'vitest';
import { applyEvent } from '../../src/core/state-machine';
import { createEmptyState } from '../../src/core/state-helpers';
import { canDispatch } from '../../src/core/concurrency';

describe('Rate Limit State Machine & Concurrency', () => {
  const config: any = {
    polling: { intervalMs: 1000 },
    agent: { maxConcurrentAgents: 2, globalCooldownMs: 60000, maxRequestsPerMinute: 2 },
    tracker: { activeStates: [], terminalStates: [] },
  };

  it('applies global cooldown on rate_limit event', () => {
    let state = createEmptyState(config);
    state.running.set('issue-1', { session: {} } as any);
    const { nextState } = applyEvent(
      state,
      {
        type: 'agent_update',
        issueId: 'issue-1',
        event: { type: 'rate_limit', timestamp: Date.now().toString() },
      },
      config
    );

    expect(nextState.globalCooldownUntilMs).not.toBeNull();
    expect(canDispatch(nextState, 'open', {})).toBe(false);
  });

  it('tracks turn_start events and enforces rolling window', () => {
    let state = createEmptyState(config);
    state.running.set('issue-1', { session: {} } as any);

    const event = {
      type: 'agent_update',
      issueId: 'issue-1',
      event: { type: 'turn_start', timestamp: Date.now().toString() },
    } as any;

    let { nextState } = applyEvent(state, event, config);
    nextState = applyEvent(nextState, event, config).nextState;

    expect(nextState.recentRequestTimestamps.length).toBe(2);
    expect(canDispatch(nextState, 'open', {})).toBe(false);
  });

  it('sets globalCooldownUntilMs to resetsAtMs on subscription-level rate_limit', () => {
    const state = createEmptyState(config);
    state.running.set('issue-1', {
      session: { turnCount: 0, lastEvent: null, lastTimestamp: null, lastMessage: null },
    } as any);

    const resetsAtMs = Date.now() + 2 * 60 * 60_000; // 2h out
    const { nextState } = applyEvent(
      state,
      {
        type: 'agent_update',
        issueId: 'issue-1',
        event: {
          type: 'rate_limit',
          timestamp: new Date().toISOString(),
          content: { message: 'limit hit', resetsAtMs, resolved: 'exact' },
        },
      } as any,
      config
    );

    expect(nextState.globalCooldownUntilMs).toBe(resetsAtMs);
  });

  it('falls back to globalCooldownMs on per-request rate_limit (no resetsAtMs)', () => {
    const state = createEmptyState(config);
    state.running.set('issue-1', {
      session: { turnCount: 0, lastEvent: null, lastTimestamp: null, lastMessage: null },
    } as any);

    const beforeMs = Date.now();
    const { nextState } = applyEvent(
      state,
      {
        type: 'agent_update',
        issueId: 'issue-1',
        event: {
          type: 'rate_limit',
          timestamp: new Date().toISOString(),
          content: { message: 'per-request limit' },
        },
      } as any,
      config
    );

    // Cooldown should be ~60s (config.agent.globalCooldownMs) from now, NOT a
    // value persisted from any resetsAtMs.
    expect(nextState.globalCooldownUntilMs).toBeGreaterThanOrEqual(
      beforeMs + config.agent.globalCooldownMs - 100
    );
    expect(nextState.globalCooldownUntilMs).toBeLessThanOrEqual(
      Date.now() + config.agent.globalCooldownMs + 100
    );
  });

  it('transitions phase to RateLimitSleeping when rate_limit has resetsAtMs', () => {
    const state = createEmptyState(config);
    state.running.set('issue-1', {
      phase: 'StreamingTurn',
      session: {
        turnCount: 0,
        lastEvent: null,
        lastTimestamp: null,
        lastMessage: null,
      },
    } as any);

    const { nextState } = applyEvent(
      state,
      {
        type: 'agent_update',
        issueId: 'issue-1',
        event: {
          type: 'rate_limit',
          timestamp: new Date().toISOString(),
          content: { message: 'limit', resetsAtMs: Date.now() + 60_000, resolved: 'exact' },
        },
      } as any,
      config
    );

    expect(nextState.running.get('issue-1')?.phase).toBe('RateLimitSleeping');
  });

  it('keeps phase as StreamingTurn when rate_limit has no resetsAtMs', () => {
    const state = createEmptyState(config);
    state.running.set('issue-1', {
      phase: 'StreamingTurn',
      session: {
        turnCount: 0,
        lastEvent: null,
        lastTimestamp: null,
        lastMessage: null,
      },
    } as any);

    const { nextState } = applyEvent(
      state,
      {
        type: 'agent_update',
        issueId: 'issue-1',
        event: {
          type: 'rate_limit',
          timestamp: new Date().toISOString(),
          content: { message: 'per-request' },
        },
      } as any,
      config
    );

    expect(nextState.running.get('issue-1')?.phase).toBe('StreamingTurn');
  });

  it('transitions phase to RateLimitSleeping on rate_limit_sleep', () => {
    const state = createEmptyState(config);
    state.running.set('issue-1', {
      phase: 'StreamingTurn',
      session: {
        turnCount: 0,
        lastEvent: null,
        lastTimestamp: null,
        lastMessage: null,
      },
    } as any);

    const { nextState } = applyEvent(
      state,
      {
        type: 'agent_update',
        issueId: 'issue-1',
        event: {
          type: 'rate_limit_sleep',
          timestamp: new Date().toISOString(),
          content: {
            message: 'sleeping',
            resetsAtMs: Date.now() + 60_000,
            sleepMs: 60_000,
            truncated: false,
          },
        },
      } as any,
      config
    );

    expect(nextState.running.get('issue-1')?.phase).toBe('RateLimitSleeping');
  });
});
