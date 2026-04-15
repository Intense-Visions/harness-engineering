import { describe, it, expect } from 'vitest';
import { sortCandidates, isEligible, selectCandidates } from '../../src/core/candidate-selection';
import type { Issue } from '@harness-engineering/types';
import type { OrchestratorState } from '../../src/types/internal';

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
    tokenTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
    rateLimits: {
      requestsRemaining: null,
      requestsLimit: null,
      tokensRemaining: null,
      tokensLimit: null,
    },
    ...overrides,
  };
}

describe('sortCandidates', () => {
  it('should sort by priority ascending (lower = higher priority)', () => {
    const issues = [
      makeIssue({ id: 'a', priority: 3 }),
      makeIssue({ id: 'b', priority: 1 }),
      makeIssue({ id: 'c', priority: 2 }),
    ];
    const sorted = sortCandidates(issues);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('should sort null priority last', () => {
    const issues = [
      makeIssue({ id: 'a', priority: null }),
      makeIssue({ id: 'b', priority: 2 }),
      makeIssue({ id: 'c', priority: 1 }),
    ];
    const sorted = sortCandidates(issues);
    expect(sorted.map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });

  it('should break ties by createdAt (oldest first)', () => {
    const issues = [
      makeIssue({ id: 'a', priority: 1, createdAt: '2026-03-01T00:00:00Z' }),
      makeIssue({ id: 'b', priority: 1, createdAt: '2026-01-01T00:00:00Z' }),
      makeIssue({ id: 'c', priority: 1, createdAt: '2026-02-01T00:00:00Z' }),
    ];
    const sorted = sortCandidates(issues);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('should break further ties by identifier lexicographic', () => {
    const issues = [
      makeIssue({ id: 'a', identifier: 'ZZZ-1', priority: 1, createdAt: '2026-01-01T00:00:00Z' }),
      makeIssue({ id: 'b', identifier: 'AAA-1', priority: 1, createdAt: '2026-01-01T00:00:00Z' }),
    ];
    const sorted = sortCandidates(issues);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('should handle null createdAt by sorting last within same priority', () => {
    const issues = [
      makeIssue({ id: 'a', priority: 1, createdAt: null }),
      makeIssue({ id: 'b', priority: 1, createdAt: '2026-01-01T00:00:00Z' }),
    ];
    const sorted = sortCandidates(issues);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'a']);
  });
});

describe('isEligible', () => {
  it('should return true for valid unclaimed issue with required fields', () => {
    const issue = makeIssue();
    const state = makeState();
    const activeStates = ['todo'];
    const terminalStates = ['done', 'cancelled'];
    expect(isEligible(issue, state, activeStates, terminalStates)).toBe(true);
  });

  it('should return false if issue is already claimed', () => {
    const issue = makeIssue({ id: 'claimed-1' });
    const state = makeState({ claimed: new Set(['claimed-1']) });
    expect(isEligible(issue, state, ['todo'], ['done'])).toBe(false);
  });

  it('should return false if issue is already running', () => {
    const issue = makeIssue({ id: 'running-1' });
    const running = new Map([['running-1', {} as any]]);
    const state = makeState({ running });
    expect(isEligible(issue, state, ['todo'], ['done'])).toBe(false);
  });

  it('should return false if state is in terminal states', () => {
    const issue = makeIssue({ state: 'Done' });
    expect(isEligible(issue, makeState(), ['todo'], ['done'])).toBe(false);
  });

  it('should return false if state is not in active states', () => {
    const issue = makeIssue({ state: 'Backlog' });
    expect(isEligible(issue, makeState(), ['todo', 'in progress'], ['done'])).toBe(false);
  });

  it('should exclude Todo issues with non-terminal blockers', () => {
    const issue = makeIssue({
      state: 'Todo',
      blockedBy: [{ id: 'blocker-1', identifier: 'BLOCK-1', state: 'In Progress' }],
    });
    expect(isEligible(issue, makeState(), ['todo', 'in progress'], ['done'])).toBe(false);
  });

  it('should allow Todo issues where all blockers are terminal', () => {
    const issue = makeIssue({
      state: 'Todo',
      blockedBy: [{ id: 'blocker-1', identifier: 'BLOCK-1', state: 'Done' }],
    });
    expect(isEligible(issue, makeState(), ['todo', 'in progress'], ['done'])).toBe(true);
  });

  it('should allow non-Todo issues with non-terminal blockers', () => {
    const issue = makeIssue({
      state: 'In Progress',
      blockedBy: [{ id: 'blocker-1', identifier: 'BLOCK-1', state: 'Todo' }],
    });
    expect(isEligible(issue, makeState(), ['todo', 'in progress'], ['done'])).toBe(true);
  });
});

describe('selectCandidates', () => {
  it('should sort and filter eligible candidates', () => {
    const issues = [
      makeIssue({ id: '1', identifier: 'A-1', priority: 2 }),
      makeIssue({ id: '2', identifier: 'A-2', priority: 1 }),
      makeIssue({ id: '3', identifier: 'A-3', state: 'Done' }),
    ];
    const state = makeState();
    const result = selectCandidates(issues, state, ['todo'], ['done']);
    expect(result.map((i) => i.id)).toEqual(['2', '1']);
  });

  it('should return empty array when all issues are ineligible', () => {
    const issues = [makeIssue({ id: '1', state: 'Done' })];
    const result = selectCandidates(issues, makeState(), ['todo'], ['done']);
    expect(result).toEqual([]);
  });
});
