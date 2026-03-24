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
      nowMs: 1706745600000,
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
      nowMs: 1706745600000,
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
      nowMs: 1706745600000,
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
      nowMs: 1706745600000,
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
      nowMs: 1706745600000,
    };

    const { effects } = applyEvent(state, event, config);
    const dispatches = effects.filter((e) => e.type === 'dispatch');
    expect(dispatches).toHaveLength(1);
    if (dispatches[0] && dispatches[0].type === 'dispatch') {
      expect(dispatches[0].issue.id).toBe('2');
    }
  });
});

describe('applyEvent - worker_exit', () => {
  it('should schedule continuation retry (1000ms) on normal exit', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    const entry: RunningEntry = {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1' }),
      attempt: null,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    };
    state.running.set('id-1', entry);
    state.claimed.add('id-1');

    const event: OrchestratorEvent = {
      type: 'worker_exit',
      issueId: 'id-1',
      reason: 'normal',
      attempt: null,
    };

    const { nextState, effects } = applyEvent(state, event, config);

    expect(nextState.running.has('id-1')).toBe(false);
    expect(nextState.completed.has('id-1')).toBe(true);

    const retry = effects.find((e) => e.type === 'scheduleRetry');
    expect(retry).toBeDefined();
    if (retry && retry.type === 'scheduleRetry') {
      expect(retry.delayMs).toBe(1000);
      expect(retry.attempt).toBe(1);
      expect(retry.error).toBeNull();
    }
  });

  it('should schedule exponential backoff retry on error exit', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1' }),
      attempt: 2,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    });
    state.claimed.add('id-1');

    const event: OrchestratorEvent = {
      type: 'worker_exit',
      issueId: 'id-1',
      reason: 'error',
      error: 'agent crashed',
      attempt: 2,
    };

    const { nextState, effects } = applyEvent(state, event, config);

    expect(nextState.running.has('id-1')).toBe(false);

    const retry = effects.find((e) => e.type === 'scheduleRetry');
    expect(retry).toBeDefined();
    if (retry && retry.type === 'scheduleRetry') {
      expect(retry.attempt).toBe(3);
      expect(retry.delayMs).toBe(40000); // 10000 * 2^(3-1) = 40000
      expect(retry.error).toBe('agent crashed');
    }
  });

  it('should remove issue from running map on any exit', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1' }),
      attempt: null,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    });

    const event: OrchestratorEvent = {
      type: 'worker_exit',
      issueId: 'id-1',
      reason: 'error',
      error: 'crash',
      attempt: null,
    };

    const { nextState } = applyEvent(state, event, config);
    expect(nextState.running.size).toBe(0);
  });
});

describe('applyEvent - retry_fired', () => {
  it('should dispatch issue if found in candidates and slots available', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.claimed.add('id-1');
    state.retryAttempts.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      attempt: 1,
      dueAtMs: 1706745600000,
      error: null,
    });

    const candidates = [makeIssue({ id: 'id-1', identifier: 'TEST-1', state: 'Todo' })];
    const event: OrchestratorEvent = {
      type: 'retry_fired',
      issueId: 'id-1',
      candidates,
      nowMs: 1706745600000,
    };

    const { effects } = applyEvent(state, event, config);
    const dispatch = effects.find((e) => e.type === 'dispatch');
    expect(dispatch).toBeDefined();
    if (dispatch && dispatch.type === 'dispatch') {
      expect(dispatch.issue.id).toBe('id-1');
      expect(dispatch.attempt).toBe(1);
    }
  });

  it('should release claim if issue not found in candidates', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.claimed.add('id-1');
    state.retryAttempts.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      attempt: 1,
      dueAtMs: 1706745600000,
      error: null,
    });

    const event: OrchestratorEvent = {
      type: 'retry_fired',
      issueId: 'id-1',
      candidates: [], // not found
      nowMs: 1706745600000,
    };

    const { nextState, effects } = applyEvent(state, event, config);
    expect(nextState.claimed.has('id-1')).toBe(false);
    expect(effects).toContainEqual({ type: 'releaseClaim', issueId: 'id-1' });
  });

  it('should release claim if issue is no longer active', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.claimed.add('id-1');
    state.retryAttempts.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      attempt: 1,
      dueAtMs: 1706745600000,
      error: null,
    });

    const candidates = [makeIssue({ id: 'id-1', state: 'Backlog' })];
    const event: OrchestratorEvent = {
      type: 'retry_fired',
      issueId: 'id-1',
      candidates,
      nowMs: 1706745600000,
    };

    const { nextState, effects } = applyEvent(state, event, config);
    expect(nextState.claimed.has('id-1')).toBe(false);
    expect(effects).toContainEqual({ type: 'releaseClaim', issueId: 'id-1' });
  });

  it('should requeue with error when no slots available', () => {
    const config = makeConfig({
      agent: {
        ...makeConfig().agent,
        maxConcurrentAgents: 1,
      },
    });
    const state = createEmptyState(config);
    state.maxConcurrentAgents = 1;
    state.claimed.add('id-1');
    state.running.set('id-other', {
      issueId: 'id-other',
      identifier: 'OTHER-1',
      issue: makeIssue({ id: 'id-other', identifier: 'OTHER-1' }),
      attempt: null,
      workspacePath: '/tmp/ws/other',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    });
    state.retryAttempts.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      attempt: 1,
      dueAtMs: 1706745600000,
      error: null,
    });

    const candidates = [makeIssue({ id: 'id-1', state: 'Todo' })];
    const event: OrchestratorEvent = {
      type: 'retry_fired',
      issueId: 'id-1',
      candidates,
      nowMs: 1706745600000,
    };

    const { effects } = applyEvent(state, event, config);
    const retry = effects.find((e) => e.type === 'scheduleRetry');
    expect(retry).toBeDefined();
    if (retry && retry.type === 'scheduleRetry') {
      expect(retry.error).toBe('no available orchestrator slots');
      expect(retry.attempt).toBe(2);
    }
  });

  it('should do nothing if retry entry is missing', () => {
    const config = makeConfig();
    const state = createEmptyState(config);

    const event: OrchestratorEvent = {
      type: 'retry_fired',
      issueId: 'id-1',
      candidates: [],
      nowMs: 1706745600000,
    };

    const { effects } = applyEvent(state, event, config);
    expect(effects).toEqual([]);
  });
});

describe('applyEvent - stall_detected', () => {
  it('should stop the stalled issue and schedule retry', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1' }),
      attempt: 2,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    });
    state.claimed.add('id-1');

    const event: OrchestratorEvent = {
      type: 'stall_detected',
      issueId: 'id-1',
    };

    const { nextState, effects } = applyEvent(state, event, config);

    expect(nextState.running.has('id-1')).toBe(false);

    const stop = effects.find((e) => e.type === 'stop');
    expect(stop).toBeDefined();
    if (stop && stop.type === 'stop') {
      expect(stop.reason).toBe('stall_detected');
    }

    const retry = effects.find((e) => e.type === 'scheduleRetry');
    expect(retry).toBeDefined();
    if (retry && retry.type === 'scheduleRetry') {
      expect(retry.error).toBe('stall detected');
      expect(retry.attempt).toBe(3); // previous attempt 2, so next = 3
    }
  });

  it('should handle stall when issue has no previous attempt', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1' }),
      attempt: null,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    });

    const event: OrchestratorEvent = {
      type: 'stall_detected',
      issueId: 'id-1',
    };

    const { effects } = applyEvent(state, event, config);
    const retry = effects.find((e) => e.type === 'scheduleRetry');
    expect(retry).toBeDefined();
    if (retry && retry.type === 'scheduleRetry') {
      expect(retry.attempt).toBe(1);
    }
  });
});

describe('applyEvent - agent_update', () => {
  it('should update session token counters and emit updateTokens effect', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1' }),
      attempt: null,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: {
        sessionId: 'sess-1',
        backendName: 'mock',
        agentPid: null,
        startedAt: '2026-01-01T00:00:00Z',
        lastEvent: null,
        lastTimestamp: null,
        lastMessage: null,
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        lastReportedInputTokens: 0,
        lastReportedOutputTokens: 0,
        lastReportedTotalTokens: 0,
        turnCount: 1,
      },
    });

    const event: OrchestratorEvent = {
      type: 'agent_update',
      issueId: 'id-1',
      event: {
        type: 'assistant',
        timestamp: '2026-01-01T00:01:00Z',
        usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
        sessionId: 'sess-1-updated',
      },
    };

    const { nextState, effects } = applyEvent(state, event, config);

    const entry = nextState.running.get('id-1');
    expect(entry).toBeDefined();
    expect(entry!.session!.inputTokens).toBe(300);
    expect(entry!.session!.outputTokens).toBe(150);
    expect(entry!.session!.totalTokens).toBe(450);
    expect(entry!.session!.lastEvent).toBe('assistant');
    expect(entry!.session!.lastTimestamp).toBe('2026-01-01T00:01:00Z');
    expect(entry!.session!.sessionId).toBe('sess-1-updated');

    const tokenEffect = effects.find((e) => e.type === 'updateTokens');
    expect(tokenEffect).toBeDefined();
  });

  it('should be a no-op when issue is not in running map', () => {
    const config = makeConfig();
    const state = createEmptyState(config);

    const event: OrchestratorEvent = {
      type: 'agent_update',
      issueId: 'nonexistent',
      event: { type: 'assistant', timestamp: '2026-01-01T00:01:00Z' },
    };

    const { nextState, effects } = applyEvent(state, event, config);
    expect(nextState.running.size).toBe(0);
    expect(effects).toEqual([]);
  });

  it('should be a no-op when running entry has no session', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1' }),
      attempt: null,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'LaunchingAgent',
      session: null,
    });

    const event: OrchestratorEvent = {
      type: 'agent_update',
      issueId: 'id-1',
      event: {
        type: 'assistant',
        timestamp: '2026-01-01T00:01:00Z',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
    };

    const { effects } = applyEvent(state, event, config);
    expect(effects).toEqual([]);
  });

  it('should update lastEvent without token effect when no usage present', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1' }),
      attempt: null,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: {
        sessionId: 'sess-1',
        backendName: 'mock',
        agentPid: null,
        startedAt: '2026-01-01T00:00:00Z',
        lastEvent: null,
        lastTimestamp: null,
        lastMessage: null,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        lastReportedInputTokens: 0,
        lastReportedOutputTokens: 0,
        lastReportedTotalTokens: 0,
        turnCount: 1,
      },
    });

    const event: OrchestratorEvent = {
      type: 'agent_update',
      issueId: 'id-1',
      event: { type: 'system', timestamp: '2026-01-01T00:01:00Z' },
    };

    const { nextState, effects } = applyEvent(state, event, config);
    const entry = nextState.running.get('id-1');
    expect(entry!.session!.lastEvent).toBe('system');
    expect(entry!.session!.lastTimestamp).toBe('2026-01-01T00:01:00Z');
    expect(effects.filter((e) => e.type === 'updateTokens')).toHaveLength(0);
  });
});
