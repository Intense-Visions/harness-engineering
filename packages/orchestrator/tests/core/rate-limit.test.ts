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
});
