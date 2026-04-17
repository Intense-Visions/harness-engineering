import { describe, it, expect } from 'vitest';
import { applyEvent } from '../../src/core/state-machine';
import { createEmptyState } from '../../src/core/state-helpers';
import type { Issue, WorkflowConfig } from '@harness-engineering/types';
import type { OrchestratorState, RunningEntry } from '../../src/types/internal';
import type {
  OrchestratorEvent,
  SideEffect,
  DispatchEffect,
  ClaimEffect,
  EscalateEffect,
} from '../../src/types/events';
import type { SimulationResult } from '@harness-engineering/intelligence';

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

describe('applyEvent - tick', () => {
  it('should dispatch eligible candidates up to concurrency limit', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    const candidates = [
      makeIssue({ id: '1', identifier: 'A-1', priority: 1, labels: ['scope:quick-fix'] }),
      makeIssue({ id: '2', identifier: 'A-2', priority: 2, labels: ['scope:quick-fix'] }),
      makeIssue({ id: '3', identifier: 'A-3', priority: 3, labels: ['scope:quick-fix'] }),
      makeIssue({ id: '4', identifier: 'A-4', priority: 4, labels: ['scope:quick-fix'] }),
    ];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
      nowMs: 1706745600000,
    };

    const { nextState, effects } = applyEvent(state, event, config);

    // Max concurrent is 3, so 3 claims
    const claims = effects.filter((e) => e.type === 'claim');
    expect(claims).toHaveLength(3);
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
      makeIssue({ id: '1', identifier: 'A-1', priority: 1, labels: ['scope:quick-fix'] }),
      makeIssue({ id: '2', identifier: 'A-2', priority: 2, labels: ['scope:quick-fix'] }),
    ];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
      nowMs: 1706745600000,
    };

    const { nextState, effects } = applyEvent(state, event, config);
    const claims = effects.filter((e) => e.type === 'claim');
    expect(claims).toHaveLength(1);
    expect(claims[0]!.type === 'claim' && (claims[0] as ClaimEffect).issue.id).toBe('2');
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

  it('should claim with null attempt for fresh issues', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    const candidates = [makeIssue({ id: '1', identifier: 'A-1', labels: ['scope:quick-fix'] })];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
      nowMs: 1706745600000,
    };

    const { effects } = applyEvent(state, event, config);
    const claim = effects.find((e) => e.type === 'claim');
    expect(claim).toBeDefined();
    if (claim && claim.type === 'claim') {
      expect(claim.attempt).toBeNull();
    }
  });

  it('should exclude terminal-state issues from candidates', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    const candidates = [
      makeIssue({ id: '1', identifier: 'A-1', state: 'Done', labels: ['scope:quick-fix'] }),
      makeIssue({ id: '2', identifier: 'A-2', state: 'Todo', labels: ['scope:quick-fix'] }),
    ];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
      nowMs: 1706745600000,
    };

    const { effects } = applyEvent(state, event, config);
    const claims = effects.filter((e) => e.type === 'claim');
    expect(claims).toHaveLength(1);
    if (claims[0] && claims[0].type === 'claim') {
      expect((claims[0] as ClaimEffect).issue.id).toBe('2');
    }
  });
});

describe('applyEvent - worker_exit', () => {
  it('treats normal exit as terminal: marks completed, releases claim, no retry scheduled', () => {
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
    expect(nextState.claimed.has('id-1')).toBe(false);
    expect(nextState.retryAttempts.has('id-1')).toBe(false);
    expect(effects.find((e) => e.type === 'scheduleRetry')).toBeUndefined();

    // Worktree should be cleaned up after successful completion
    const cleans = effects.filter((e) => e.type === 'cleanWorkspace');
    expect(cleans).toHaveLength(1);
    expect(cleans[0]).toMatchObject({
      type: 'cleanWorkspace',
      issueId: 'id-1',
      identifier: 'TEST-1',
    });
  });

  it('does not re-dispatch an issue already in completed even when present in candidates', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    const issue = makeIssue({
      id: 'id-1',
      identifier: 'TEST-1',
      state: 'in-progress',
      labels: ['scope:quick-fix'],
    });
    state.completed.add('id-1');

    const tickEvent: OrchestratorEvent = {
      type: 'tick',
      candidates: [issue],
      runningStates: new Map(),
      nowMs: 1706745600000,
    };

    const { effects } = applyEvent(state, tickEvent, config);
    expect(effects.find((e) => e.type === 'dispatch' || e.type === 'claim')).toBeUndefined();
  });

  it('handleRetryFired short-circuits when issue already completed', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.completed.add('id-1');
    state.claimed.add('id-1');
    state.retryAttempts.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      attempt: 1,
      dueAtMs: 1706745600000,
      error: null,
    });

    const candidates = [
      makeIssue({
        id: 'id-1',
        identifier: 'TEST-1',
        state: 'in-progress',
        labels: ['scope:quick-fix'],
      }),
    ];
    const event: OrchestratorEvent = {
      type: 'retry_fired',
      issueId: 'id-1',
      candidates,
      nowMs: 1706745600000,
    };

    const { nextState, effects } = applyEvent(state, event, config);
    expect(effects.find((e) => e.type === 'dispatch')).toBeUndefined();
    expect(effects.find((e) => e.type === 'claim')).toBeUndefined();
    expect(effects).toContainEqual({ type: 'releaseClaim', issueId: 'id-1' });
    expect(nextState.claimed.has('id-1')).toBe(false);
    expect(nextState.retryAttempts.has('id-1')).toBe(false);
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
  it('should claim issue if found in candidates and slots available', () => {
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

    const candidates = [
      makeIssue({ id: 'id-1', identifier: 'TEST-1', state: 'Todo', labels: ['scope:quick-fix'] }),
    ];
    const event: OrchestratorEvent = {
      type: 'retry_fired',
      issueId: 'id-1',
      candidates,
      nowMs: 1706745600000,
    };

    const { effects } = applyEvent(state, event, config);
    const claim = effects.find((e) => e.type === 'claim');
    expect(claim).toBeDefined();
    if (claim && claim.type === 'claim') {
      expect((claim as ClaimEffect).issue.id).toBe('id-1');
      expect((claim as ClaimEffect).attempt).toBe(1);
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

    // Global tokenTotals must also be accumulated
    expect(nextState.tokenTotals.inputTokens).toBe(200);
    expect(nextState.tokenTotals.outputTokens).toBe(100);
    expect(nextState.tokenTotals.totalTokens).toBe(300);
  });

  it('should accumulate tokenTotals across multiple usage events', () => {
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

    // First usage event
    const event1: OrchestratorEvent = {
      type: 'agent_update',
      issueId: 'id-1',
      event: {
        type: 'assistant',
        timestamp: '2026-01-01T00:01:00Z',
        usage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
      },
    };
    const { nextState: state2 } = applyEvent(state, event1, config);

    // Second usage event
    const event2: OrchestratorEvent = {
      type: 'agent_update',
      issueId: 'id-1',
      event: {
        type: 'assistant',
        timestamp: '2026-01-01T00:02:00Z',
        usage: { inputTokens: 300, outputTokens: 100, totalTokens: 400 },
      },
    };
    const { nextState: state3 } = applyEvent(state2, event2, config);

    expect(state3.tokenTotals.inputTokens).toBe(800);
    expect(state3.tokenTotals.outputTokens).toBe(300);
    expect(state3.tokenTotals.totalTokens).toBe(1100);
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

  // Regression for dashboard showing "Turns 0" / "T0" indefinitely:
  // `session.turnCount` was initialized to 0 at dispatch but never incremented.
  // AgentRunner yields a `turn_start` event before each turn — the state machine
  // uses this to update the per-minute request window for rate limiting, and
  // must also bump the session's turnCount so the dashboard reflects progress.
  it('should increment session.turnCount on turn_start event', () => {
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
        backendName: 'claude',
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
        turnCount: 2,
      },
    });

    const event: OrchestratorEvent = {
      type: 'agent_update',
      issueId: 'id-1',
      event: { type: 'turn_start', timestamp: '2026-01-01T00:01:00Z' },
    };

    const { nextState } = applyEvent(state, event, config);
    const entry = nextState.running.get('id-1');
    expect(entry!.session!.turnCount).toBe(3);
    // Turn_start should also continue populating the rate-limiter request window
    expect(nextState.recentRequestTimestamps.length).toBeGreaterThan(0);
  });
});

describe('applyEvent - tick with routing', () => {
  function makeRoutingConfig(overrides: Partial<WorkflowConfig> = {}): WorkflowConfig {
    return makeConfig({
      agent: {
        ...makeConfig().agent,
        localBackend: 'openai-compatible' as const,
        localModel: 'deepseek-coder-v2',
        localEndpoint: 'http://localhost:11434/v1',
        escalation: {
          alwaysHuman: ['full-exploration'],
          autoExecute: ['quick-fix', 'diagnostic'],
          primaryExecute: [],
          signalGated: ['guided-change'],
          diagnosticRetryBudget: 1,
        },
      },
      ...overrides,
    });
  }

  it('should escalate full-exploration issues to needs-human (SC3)', () => {
    const config = makeRoutingConfig();
    const state = createEmptyState(config);
    // No scope label, no artifacts -> full-exploration -> needs-human
    const candidates = [makeIssue({ id: '1', identifier: 'A-1' })];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
      nowMs: 1706745600000,
    };

    const { effects } = applyEvent(state, event, config);
    const escalations = effects.filter((e) => e.type === 'escalate');
    expect(escalations).toHaveLength(1);
    if (escalations[0] && escalations[0].type === 'escalate') {
      expect(escalations[0].issueId).toBe('1');
      expect(escalations[0].reasons).toContain('full-exploration tier always requires human');
    }
    // No dispatch or claim effects
    const dispatches = effects.filter((e) => e.type === 'dispatch' || e.type === 'claim');
    expect(dispatches).toHaveLength(0);
  });

  it('should claim quick-fix issues with local backend (SC2)', () => {
    const config = makeRoutingConfig();
    const state = createEmptyState(config);
    const candidates = [makeIssue({ id: '1', identifier: 'A-1', labels: ['scope:quick-fix'] })];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
      nowMs: 1706745600000,
    };

    const { effects } = applyEvent(state, event, config);
    const claims = effects.filter((e) => e.type === 'claim') as ClaimEffect[];
    expect(claims).toHaveLength(1);
    expect(claims[0].backend).toBe('local');
  });

  it('should claim diagnostic issues with local backend (SC2)', () => {
    const config = makeRoutingConfig();
    const state = createEmptyState(config);
    const candidates = [makeIssue({ id: '1', identifier: 'A-1', labels: ['scope:diagnostic'] })];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
      nowMs: 1706745600000,
    };

    const { effects } = applyEvent(state, event, config);
    const claims = effects.filter((e) => e.type === 'claim') as ClaimEffect[];
    expect(claims).toHaveLength(1);
    expect(claims[0].backend).toBe('local');
  });

  it('should claim to primary when localBackend is not configured', () => {
    const config = makeConfig(); // No localBackend
    const state = createEmptyState(config);
    const candidates = [makeIssue({ id: '1', identifier: 'A-1', labels: ['scope:quick-fix'] })];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
      nowMs: 1706745600000,
    };

    const { effects } = applyEvent(state, event, config);
    const claims = effects.filter((e) => e.type === 'claim') as ClaimEffect[];
    expect(claims).toHaveLength(1);
    // Without localBackend, even autoExecute tiers claim with primary backend
    expect(claims[0].backend).toBe('primary');
  });

  it('should claim guided-change with primary backend when in primaryExecute', () => {
    const config = makeRoutingConfig({
      agent: {
        ...makeRoutingConfig().agent,
        escalation: {
          alwaysHuman: ['full-exploration'],
          autoExecute: ['quick-fix', 'diagnostic'],
          primaryExecute: ['guided-change'],
          signalGated: [],
          diagnosticRetryBudget: 1,
        },
      },
    });
    const state = createEmptyState(config);
    const candidates = [makeIssue({ id: '1', identifier: 'A-1', labels: ['scope:guided-change'] })];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
      nowMs: 1706745600000,
    };

    const { effects } = applyEvent(state, event, config);
    const claims = effects.filter((e) => e.type === 'claim') as ClaimEffect[];
    expect(claims).toHaveLength(1);
    expect(claims[0].backend).toBe('primary');
  });
});

describe('applyEvent - worker_exit with diagnostic escalation', () => {
  function makeRoutingConfig(): WorkflowConfig {
    return makeConfig({
      agent: {
        ...makeConfig().agent,
        localBackend: 'openai-compatible' as const,
        escalation: {
          diagnosticRetryBudget: 1,
        },
      },
    });
  }

  it('should escalate diagnostic after 1 failed retry (SC5)', () => {
    const config = makeRoutingConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1', labels: ['scope:diagnostic'] }),
      attempt: 1,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    });

    const event: OrchestratorEvent = {
      type: 'worker_exit',
      issueId: 'id-1',
      reason: 'error',
      error: 'agent failed to fix bug',
      attempt: 1,
    };

    const { effects } = applyEvent(state, event, config);
    const escalations = effects.filter((e) => e.type === 'escalate');
    expect(escalations).toHaveLength(1);
    if (escalations[0] && escalations[0].type === 'escalate') {
      expect(escalations[0].reasons[0]).toContain('diagnostic exceeded retry budget');
    }
    // Should NOT produce a scheduleRetry effect
    const retries = effects.filter((e) => e.type === 'scheduleRetry');
    expect(retries).toHaveLength(0);
  });

  it('should NOT escalate diagnostic on first attempt failure (allows 1 retry)', () => {
    const config = makeRoutingConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1', labels: ['scope:diagnostic'] }),
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
      error: 'first failure',
      attempt: null,
    };

    const { effects } = applyEvent(state, event, config);
    // First failure: nextAttempt = 1, budget = 1, so 1 <= 1 means do NOT escalate yet
    const retries = effects.filter((e) => e.type === 'scheduleRetry');
    expect(retries).toHaveLength(1);
    const escalations = effects.filter((e) => e.type === 'escalate');
    expect(escalations).toHaveLength(0);
  });

  it('should NOT escalate non-diagnostic issues', () => {
    const config = makeRoutingConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1', labels: ['scope:guided-change'] }),
      attempt: 1,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    });

    const event: OrchestratorEvent = {
      type: 'worker_exit',
      issueId: 'id-1',
      reason: 'error',
      error: 'agent failed',
      attempt: 1,
    };

    const { effects } = applyEvent(state, event, config);
    const retries = effects.filter((e) => e.type === 'scheduleRetry');
    expect(retries).toHaveLength(1);
    const escalations = effects.filter((e) => e.type === 'escalate');
    expect(escalations).toHaveLength(0);
  });

  // --- PESL abort tests ---

  function makeAbortSimulation(): SimulationResult {
    return {
      simulatedPlan: ['step 1'],
      predictedFailures: ['DB migration will fail', 'API contract break', 'Auth token mismatch'],
      riskHotspots: ['core/auth'],
      missingSteps: ['rollback plan'],
      testGaps: ['No integration tests for auth flow', 'Missing edge case coverage'],
      executionConfidence: 0.15,
      recommendedChanges: ['Add rollback'],
      abort: true,
      tier: 'full-simulation',
    };
  }

  it('should escalate when PESL simulation recommends abort (SC9)', () => {
    const config = makeRoutingConfig();
    const state = createEmptyState(config);
    const candidates = [makeIssue({ id: '1', identifier: 'A-1', labels: ['scope:guided-change'] })];
    const simResults = new Map<string, SimulationResult>();
    simResults.set('1', makeAbortSimulation());

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
      nowMs: 1706745600000,
      simulationResults: simResults,
    };

    const { effects } = applyEvent(state, event, config);
    const escalations = effects.filter((e) => e.type === 'escalate') as EscalateEffect[];
    expect(escalations).toHaveLength(1);
    expect(escalations[0]!.issueId).toBe('1');
    expect(escalations[0]!.reasons[0]).toContain('PESL simulation recommends abort');
    expect(escalations[0]!.reasons[0]).toContain('0.15');
    // Should include truncated predicted failures and test gaps
    expect(escalations[0]!.reasons.some((r) => r.includes('Predicted failure'))).toBe(true);
    expect(escalations[0]!.reasons.some((r) => r.includes('Test gap'))).toBe(true);

    const dispatches = effects.filter((e) => e.type === 'dispatch' || e.type === 'claim');
    expect(dispatches).toHaveLength(0);
  });

  it('should dispatch normally when PESL simulation does not abort', () => {
    const config = makeRoutingConfig();
    const state = createEmptyState(config);
    const candidates = [makeIssue({ id: '1', identifier: 'A-1', labels: ['scope:guided-change'] })];
    const simResults = new Map<string, SimulationResult>();
    simResults.set('1', {
      ...makeAbortSimulation(),
      executionConfidence: 0.7,
      abort: false,
    });

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
      nowMs: 1706745600000,
      simulationResults: simResults,
    };

    const { effects } = applyEvent(state, event, config);
    const claims = effects.filter((e) => e.type === 'claim') as ClaimEffect[];
    expect(claims).toHaveLength(1);
    expect(claims[0]!.issue.id).toBe('1');
    const escalations = effects.filter((e) => e.type === 'escalate');
    expect(escalations).toHaveLength(0);
  });

  it('should claim when no simulationResults are provided', () => {
    const config = makeRoutingConfig();
    const state = createEmptyState(config);
    const candidates = [makeIssue({ id: '1', identifier: 'A-1', labels: ['scope:guided-change'] })];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
      nowMs: 1706745600000,
      // No simulationResults
    };

    const { effects } = applyEvent(state, event, config);
    const claims = effects.filter((e) => e.type === 'claim') as ClaimEffect[];
    expect(claims).toHaveLength(1);
    expect(claims[0]!.issue.id).toBe('1');
  });
});

describe('applyEvent - claim_rejected', () => {
  it('removes issue from claimed and running sets', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.claimed.add('id-1');
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue(),
      attempt: null,
      workspacePath: '',
      startedAt: new Date().toISOString(),
      phase: 'PreparingWorkspace',
      session: null,
    });

    const event: OrchestratorEvent = { type: 'claim_rejected', issueId: 'id-1' };
    const { nextState, effects } = applyEvent(state, event, config);

    expect(nextState.claimed.has('id-1')).toBe(false);
    expect(nextState.running.has('id-1')).toBe(false);
    expect(effects).toHaveLength(0);
  });
});
