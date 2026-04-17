import { describe, it, expect } from 'vitest';
import { getAvailableSlots, getPerStateCount, canDispatch } from '../../src/core/concurrency';
import type { OrchestratorState, RunningEntry } from '../../src/types/internal';
import type { WorkflowConfig } from '@harness-engineering/types';

function makeState(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  return {
    pollIntervalMs: 30000,
    maxConcurrentAgents: 10,
    globalCooldownUntilMs: null,
    recentRequestTimestamps: [],
    globalCooldownMs: 60000,
    maxRequestsPerMinute: 50,
    maxRequestsPerSecond: 2,
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

function makeRunningEntry(overrides: Partial<RunningEntry> = {}): RunningEntry {
  return {
    issueId: 'id-1',
    identifier: 'TEST-1',
    issue: {
      id: 'id-1',
      identifier: 'TEST-1',
      title: 'Test',
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
    },
    attempt: null,
    workspacePath: '/tmp/ws/test-1',
    startedAt: '2026-01-01T00:00:00Z',
    phase: 'StreamingTurn',
    session: null,
    ...overrides,
  };
}

describe('getAvailableSlots', () => {
  it('should return max - running when running < max', () => {
    const state = makeState({ maxConcurrentAgents: 5 });
    expect(getAvailableSlots(state)).toBe(5);
  });

  it('should return 0 when running >= max', () => {
    const running = new Map([
      ['1', makeRunningEntry({ issueId: '1' })],
      ['2', makeRunningEntry({ issueId: '2' })],
    ]);
    const state = makeState({ maxConcurrentAgents: 2, running });
    expect(getAvailableSlots(state)).toBe(0);
  });

  it('should never return negative', () => {
    const running = new Map([
      ['1', makeRunningEntry({ issueId: '1' })],
      ['2', makeRunningEntry({ issueId: '2' })],
      ['3', makeRunningEntry({ issueId: '3' })],
    ]);
    const state = makeState({ maxConcurrentAgents: 1, running });
    expect(getAvailableSlots(state)).toBe(0);
  });
});

describe('getPerStateCount', () => {
  it('should count running entries by normalized state', () => {
    const running = new Map([
      [
        '1',
        makeRunningEntry({ issueId: '1', issue: { ...makeRunningEntry().issue, state: 'Todo' } }),
      ],
      [
        '2',
        makeRunningEntry({ issueId: '2', issue: { ...makeRunningEntry().issue, state: 'todo' } }),
      ],
      [
        '3',
        makeRunningEntry({
          issueId: '3',
          issue: { ...makeRunningEntry().issue, state: 'In Progress' },
        }),
      ],
    ]);
    const counts = getPerStateCount(running);
    expect(counts.get('todo')).toBe(2);
    expect(counts.get('in progress')).toBe(1);
  });
});

describe('canDispatch', () => {
  it('should return true when global and per-state slots available', () => {
    const state = makeState({ maxConcurrentAgents: 5 });
    expect(canDispatch(state, 'Todo', {})).toBe(true);
  });

  it('should return false when no global slots available', () => {
    const running = new Map([['1', makeRunningEntry()]]);
    const state = makeState({ maxConcurrentAgents: 1, running });
    expect(canDispatch(state, 'Todo', {})).toBe(false);
  });

  it('should respect per-state concurrency caps', () => {
    const running = new Map([
      [
        '1',
        makeRunningEntry({ issueId: '1', issue: { ...makeRunningEntry().issue, state: 'Todo' } }),
      ],
    ]);
    const state = makeState({ maxConcurrentAgents: 10, running });
    const byState = { todo: 1 };
    expect(canDispatch(state, 'Todo', byState)).toBe(false);
  });

  it('should use global limit when no per-state cap defined', () => {
    const running = new Map([
      [
        '1',
        makeRunningEntry({ issueId: '1', issue: { ...makeRunningEntry().issue, state: 'Todo' } }),
      ],
    ]);
    const state = makeState({ maxConcurrentAgents: 10, running });
    const byState = { 'in progress': 2 };
    expect(canDispatch(state, 'Todo', byState)).toBe(true);
  });
});
