import { describe, it, expect } from 'vitest';
import { applyEvent } from '../../src/core/state-machine';
import { createEmptyState } from '../../src/core/state-helpers';
import type { Issue, WorkflowConfig } from '@harness-engineering/types';
import type { OrchestratorState, RunningEntry } from '../../src/types/internal';
import type { OrchestratorEvent, SideEffect } from '../../src/types/events';

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
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: null,
    ...overrides,
  };
}

describe('applyEvent - tick', () => {
  it('should dispatch eligible candidates up to concurrency limit', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    const candidates = [
      makeIssue({ id: '1', identifier: 'A-1', priority: 1 }),
      makeIssue({ id: '2', identifier: 'A-2', priority: 2 }),
      makeIssue({ id: '3', identifier: 'A-3', priority: 3 }),
      makeIssue({ id: '4', identifier: 'A-4', priority: 4 }),
    ];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
    };

    const { nextState, effects } = applyEvent(state, event, config);

    // Max concurrent is 3, so 3 dispatches
    const dispatches = effects.filter((e) => e.type === 'dispatch');
    expect(dispatches).toHaveLength(3);
    expect(nextState.claimed.size).toBe(3);
    expect(nextState.claimed.has('1')).toBe(true);
    expect(nextState.claimed.has('2')).toBe(true);
    expect(nextState.claimed.has('3')).toBe(true);
    expect(nextState.claimed.has('4')).toBe(false);
  });

  it('should not dispatch already-claimed issues', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.claimed.add('1');

    const candidates = [
      makeIssue({ id: '1', identifier: 'A-1', priority: 1 }),
      makeIssue({ id: '2', identifier: 'A-2', priority: 2 }),
    ];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
    };

    const { nextState, effects } = applyEvent(state, event, config);
    const dispatches = effects.filter((e) => e.type === 'dispatch');
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]!.type === 'dispatch' && dispatches[0].issue.id).toBe('2');
  });

  it('should reconcile before dispatching', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    // Simulate a running issue
    state.running.set('id-done', {
      issueId: 'id-done',
      identifier: 'DONE-1',
      issue: makeIssue({ id: 'id-done', identifier: 'DONE-1' }),
      attempt: null,
      workspacePath: '/tmp/ws/done-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    });
    state.claimed.add('id-done');

    const runningStates = new Map([['id-done', makeIssue({ id: 'id-done', state: 'Done' })]]);

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates: [],
      runningStates,
    };

    const { effects } = applyEvent(state, event, config);
    const stops = effects.filter((e) => e.type === 'stop');
    expect(stops).toHaveLength(1);
    const cleans = effects.filter((e) => e.type === 'cleanWorkspace');
    expect(cleans).toHaveLength(1);
  });

  it('should dispatch with null attempt for fresh issues', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    const candidates = [makeIssue({ id: '1', identifier: 'A-1' })];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
    };

    const { effects } = applyEvent(state, event, config);
    const dispatch = effects.find((e) => e.type === 'dispatch');
    expect(dispatch).toBeDefined();
    if (dispatch && dispatch.type === 'dispatch') {
      expect(dispatch.attempt).toBeNull();
    }
  });

  it('should exclude terminal-state issues from candidates', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    const candidates = [
      makeIssue({ id: '1', identifier: 'A-1', state: 'Done' }),
      makeIssue({ id: '2', identifier: 'A-2', state: 'Todo' }),
    ];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
    };

    const { effects } = applyEvent(state, event, config);
    const dispatches = effects.filter((e) => e.type === 'dispatch');
    expect(dispatches).toHaveLength(1);
    if (dispatches[0] && dispatches[0].type === 'dispatch') {
      expect(dispatches[0].issue.id).toBe('2');
    }
  });
});
