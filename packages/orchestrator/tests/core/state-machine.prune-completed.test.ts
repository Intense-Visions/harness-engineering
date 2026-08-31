import { describe, it, expect } from 'vitest';
import { applyEvent } from '../../src/core/state-machine';
import { createEmptyState } from '../../src/core/state-helpers';
import type { WorkflowConfig } from '@harness-engineering/types';
import type { OrchestratorEvent } from '../../src/types/events';

function makeConfig(overrides: Partial<WorkflowConfig> = {}): WorkflowConfig {
  return {
    tracker: {
      kind: 'roadmap',
      activeStates: ['Todo', 'In Progress'],
      terminalStates: ['Done', 'Cancelled'],
    },
    polling: { intervalMs: 30000 },
    workspace: { root: '/tmp/ws' },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 60000,
    },
    agent: {
      backend: 'mock',
      maxConcurrentAgents: 3,
      maxTurns: 20,
      maxRetryBackoffMs: 300000,
      maxRetries: 5,
      maxConcurrentAgentsByState: {},
      turnTimeoutMs: 3600000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 300000,
    },
    server: { port: null },
    ...overrides,
  };
}

describe('applyEvent - tick prunes `completed` without an age check', () => {
  it('does not evict a just-completed entry (well inside the grace period) once the completed set crosses the prune threshold', () => {
    const config = makeConfig();
    const state = createEmptyState(config);

    const nowMs = 1706745600000;
    // reconcileCompletedAndClaimed's own grace period -- an issue must be older
    // than this before it is safe to release from `completed` for re-dispatch.
    const gracePeriodMs = config.polling.intervalMs * 2; // 60000ms

    // Seed the `completed` map past COMPLETED_PRUNE_THRESHOLD (100), all with no
    // pending running/retry/claimed activity so every entry is prune-eligible.
    // One entry ("recent-1") completed 1ms ago -- deep inside the grace period
    // that guards against re-dispatching a just-finished issue.
    state.completed.set('recent-1', nowMs - 1);
    for (let i = 0; i < 100; i++) {
      state.completed.set(`old-${i}`, nowMs - gracePeriodMs * 5);
    }
    expect(state.completed.size).toBe(101);

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates: [],
      runningStates: new Map(),
      nowMs,
    };

    const { nextState } = applyEvent(state, event, config);

    // pruneCompleted must not throw away an entry that hasn't cleared the
    // grace period yet -- doing so drops the "already finished in this
    // orchestrator process" guard (candidate-selection.ts's isEligible) and
    // reopens the issue to duplicate dispatch on the very next tick.
    expect(nextState.completed.has('recent-1')).toBe(true);
  });
});
