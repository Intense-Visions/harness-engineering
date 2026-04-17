import { describe, it, expect } from 'vitest';
import { reconcile } from '../../src/core/reconciliation';
import type { Issue } from '@harness-engineering/types';
import type { OrchestratorState, RunningEntry } from '../../src/types/internal';
import type { SideEffect } from '../../src/types/events';

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
    createdAt: null,
    updatedAt: null,
    externalId: null,
    ...overrides,
  };
}

function makeRunningEntry(overrides: Partial<RunningEntry> = {}): RunningEntry {
  return {
    issueId: 'id-1',
    identifier: 'TEST-1',
    issue: makeIssue(),
    attempt: null,
    workspacePath: '/tmp/ws/test-1',
    startedAt: '2026-01-01T00:00:00Z',
    phase: 'StreamingTurn',
    session: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  return {
    pollIntervalMs: 30000,
    maxConcurrentAgents: 10,
    running: new Map(),
    claimed: new Set(),
    retryAttempts: new Map(),
    completed: new Set(),
    tokenTotals: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      secondsRunning: 0,
    },
    rateLimits: {
      requestsRemaining: null,
      requestsLimit: null,
      tokensRemaining: null,
      tokensLimit: null,
    },
    ...overrides,
  };
}

describe('reconcile', () => {
  it('should return no effects when all running issues are still active', () => {
    const running = new Map([
      ['id-1', makeRunningEntry({ issueId: 'id-1', identifier: 'TEST-1' })],
    ]);
    const state = makeState({ running });
    const runningStates = new Map([['id-1', makeIssue({ id: 'id-1', state: 'In Progress' })]]);
    const activeStates = ['todo', 'in progress'];
    const terminalStates = ['done', 'cancelled'];

    const effects = reconcile(state, runningStates, activeStates, terminalStates);
    expect(effects).toEqual([]);
  });

  it('should stop and clean workspace when running issue becomes terminal', () => {
    const running = new Map([
      ['id-1', makeRunningEntry({ issueId: 'id-1', identifier: 'TEST-1' })],
    ]);
    const state = makeState({ running });
    const runningStates = new Map([['id-1', makeIssue({ id: 'id-1', state: 'Done' })]]);
    const activeStates = ['todo', 'in progress'];
    const terminalStates = ['done', 'cancelled'];

    const effects = reconcile(state, runningStates, activeStates, terminalStates);
    expect(effects).toContainEqual({
      type: 'stop',
      issueId: 'id-1',
      reason: 'terminal_state: done',
    });
    expect(effects).toContainEqual({
      type: 'cleanWorkspace',
      issueId: 'id-1',
      identifier: 'TEST-1',
    });
    expect(effects).toContainEqual({ type: 'releaseClaim', issueId: 'id-1' });
  });

  it('should stop without cleaning workspace when running issue is neither active nor terminal', () => {
    const running = new Map([
      ['id-1', makeRunningEntry({ issueId: 'id-1', identifier: 'TEST-1' })],
    ]);
    const state = makeState({ running });
    const runningStates = new Map([['id-1', makeIssue({ id: 'id-1', state: 'Backlog' })]]);
    const activeStates = ['todo', 'in progress'];
    const terminalStates = ['done', 'cancelled'];

    const effects = reconcile(state, runningStates, activeStates, terminalStates);
    expect(effects).toContainEqual({
      type: 'stop',
      issueId: 'id-1',
      reason: 'non_active_state: backlog',
    });
    expect(effects).toContainEqual({ type: 'releaseClaim', issueId: 'id-1' });
    expect(effects.find((e) => e.type === 'cleanWorkspace')).toBeUndefined();
  });

  it('should handle multiple running issues with mixed states', () => {
    const running = new Map([
      ['id-1', makeRunningEntry({ issueId: 'id-1', identifier: 'TEST-1' })],
      ['id-2', makeRunningEntry({ issueId: 'id-2', identifier: 'TEST-2' })],
      ['id-3', makeRunningEntry({ issueId: 'id-3', identifier: 'TEST-3' })],
    ]);
    const state = makeState({ running });
    const runningStates = new Map([
      ['id-1', makeIssue({ id: 'id-1', state: 'Done' })],
      ['id-2', makeIssue({ id: 'id-2', state: 'In Progress' })],
      ['id-3', makeIssue({ id: 'id-3', state: 'Backlog' })],
    ]);
    const activeStates = ['todo', 'in progress'];
    const terminalStates = ['done', 'cancelled'];

    const effects = reconcile(state, runningStates, activeStates, terminalStates);
    // id-1: terminal -> stop + clean + release
    expect(effects.filter((e) => e.type === 'stop')).toHaveLength(2);
    expect(effects.filter((e) => e.type === 'cleanWorkspace')).toHaveLength(1);
    expect(effects.filter((e) => e.type === 'releaseClaim')).toHaveLength(2);
  });

  it('should skip issues not present in runningStates (state refresh failed for them)', () => {
    const running = new Map([
      ['id-1', makeRunningEntry({ issueId: 'id-1', identifier: 'TEST-1' })],
      ['id-2', makeRunningEntry({ issueId: 'id-2', identifier: 'TEST-2' })],
    ]);
    const state = makeState({ running });
    // Only id-1 returned from refresh; id-2 missing (keep running per spec)
    const runningStates = new Map([['id-1', makeIssue({ id: 'id-1', state: 'Done' })]]);
    const activeStates = ['todo', 'in progress'];
    const terminalStates = ['done', 'cancelled'];

    const effects = reconcile(state, runningStates, activeStates, terminalStates);
    // Only id-1 should have effects
    expect(effects.filter((e) => 'issueId' in e && e.issueId === 'id-2')).toHaveLength(0);
    expect(effects.filter((e) => 'issueId' in e && e.issueId === 'id-1').length).toBeGreaterThan(0);
  });
});
