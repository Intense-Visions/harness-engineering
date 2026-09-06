import { describe, it, expect } from 'vitest';
import { applyEvent } from '../../src/core/state-machine';
import { createEmptyState } from '../../src/core/state-helpers';
import type { Issue, WorkflowConfig } from '@harness-engineering/types';
import type { OrchestratorEvent } from '../../src/types/events';

const NOW = 1706745600000;

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
      maxConcurrentAgents: 1,
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

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'id-1',
    identifier: 'TEST-1',
    title: 'Test issue',
    description: null,
    priority: null,
    state: 'Todo',
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    spec: null,
    plans: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: null,
    externalId: null,
    ...overrides,
  };
}

/**
 * State after a lane failed and its retry became due: the issue is still
 * `claimed` (handleWorkerExit's error path never releases the claim) and has a
 * pending retry entry. This is exactly what the orchestrator holds when the
 * retry timer fires.
 */
function stateWithDueRetry(config: WorkflowConfig) {
  const state = createEmptyState(config);
  state.claimed.add('id-A');
  state.retryAttempts.set('id-A', {
    issueId: 'id-A',
    identifier: 'A-1',
    attempt: 1,
    dueAtMs: NOW,
    error: null,
  });
  return state;
}

const issueA = makeIssue({ id: 'id-A', identifier: 'A-1', labels: ['scope:quick-fix'] });
const issueB = makeIssue({ id: 'id-B', identifier: 'B-1', labels: ['scope:quick-fix'] });

describe('retry_fired dispatch and concurrency slot accounting', () => {
  it('registers the retry-dispatched lane in running so it occupies a concurrency slot', () => {
    const config = makeConfig();
    const state = stateWithDueRetry(config);

    const event: OrchestratorEvent = {
      type: 'retry_fired',
      issueId: 'id-A',
      candidates: [issueA],
      nowMs: NOW,
    };
    const { nextState, effects } = applyEvent(state, event, config);

    // Precondition: the reducer really did authorize a dispatch of this lane.
    expect(effects.some((e) => e.type === 'claim')).toBe(true);

    // The authorized lane must be accounted as running -- `getAvailableSlots`
    // derives free slots from `running.size` alone.
    expect(nextState.running.has('id-A')).toBe(true);
  });

  it('never dispatches more concurrent lanes than maxConcurrentAgents across a retry then a tick', () => {
    const config = makeConfig();
    const afterRetry = applyEvent(
      stateWithDueRetry(config),
      { type: 'retry_fired', issueId: 'id-A', candidates: [issueA], nowMs: NOW },
      config
    );

    // The next tick, while the retry-dispatched agent for A is still running.
    // A stays in `claimed` so it is not re-selected; B is a fresh candidate.
    const afterTick = applyEvent(
      afterRetry.nextState,
      {
        type: 'tick',
        candidates: [issueA, issueB],
        runningStates: new Map(),
        nowMs: NOW,
      },
      config
    );

    const dispatched =
      afterRetry.effects.filter((e) => e.type === 'claim').length +
      afterTick.effects.filter((e) => e.type === 'claim').length;

    expect(dispatched).toBeLessThanOrEqual(config.agent.maxConcurrentAgents);
  });
});
