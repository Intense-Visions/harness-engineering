import { describe, it, expect } from 'vitest';
import { deriveLanes, indexBoardIdentifiers } from '../../../src/client/utils/kanban-lanes';
import type {
  OrchestratorSnapshot,
  RunningAgent,
  RetryEntry,
} from '../../../src/client/types/orchestrator';

function makeAgent(overrides: Partial<RunningAgent> = {}): RunningAgent {
  return {
    issueId: 'i-1',
    identifier: 'ISSUE-1',
    phase: 'StreamingTurn',
    startedAt: '2026-06-25T00:00:00.000Z',
    workspacePath: '/tmp/wt/ISSUE-1',
    attempt: 1,
    issue: {
      identifier: 'ISSUE-1',
      title: 'First issue',
      description: null,
      blockedBy: [],
    },
    session: {
      backendName: 'local',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      turnCount: 1,
      lastMessage: null,
    },
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<OrchestratorSnapshot> = {}): OrchestratorSnapshot {
  return {
    running: [],
    retryAttempts: [],
    claimed: [],
    tokenTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
    maxConcurrentAgents: 5,
    globalCooldownUntilMs: null,
    recentRequestTimestamps: [],
    recentInputTokens: [],
    recentOutputTokens: [],
    maxRequestsPerMinute: 50,
    maxRequestsPerSecond: 2,
    maxInputTokensPerMinute: 0,
    maxOutputTokensPerMinute: 0,
    ...overrides,
  };
}

describe('deriveLanes', () => {
  it('returns lanes in canonical order', () => {
    const lanes = deriveLanes(makeSnapshot());
    expect(lanes.map((l) => l.id)).toEqual(['queued', 'in-progress', 'blocked', 'done']);
  });

  it('places a claimed-but-not-running id in the queued lane', () => {
    const lanes = deriveLanes(makeSnapshot({ claimed: ['i-queued'] }));
    const queued = lanes.find((l) => l.id === 'queued')!;
    expect(queued.cards.map((c) => c.issueId)).toContain('i-queued');
  });

  it('does not queue an id that is already running', () => {
    const agent = makeAgent({ issueId: 'i-run' });
    const lanes = deriveLanes(makeSnapshot({ running: [['i-run', agent]], claimed: ['i-run'] }));
    const queued = lanes.find((l) => l.id === 'queued')!;
    expect(queued.cards).toHaveLength(0);
  });

  it('places an active running agent in the in-progress lane with metadata', () => {
    const agent = makeAgent({ phase: 'StreamingTurn' });
    const lanes = deriveLanes(makeSnapshot({ running: [['i-1', agent]] }));
    const inProgress = lanes.find((l) => l.id === 'in-progress')!;
    expect(inProgress.cards).toHaveLength(1);
    expect(inProgress.cards[0]!.backendName).toBe('local');
    expect(inProgress.cards[0]!.workspacePath).toBe('/tmp/wt/ISSUE-1');
    expect(inProgress.cards[0]!.startedAt).toBe('2026-06-25T00:00:00.000Z');
  });

  it('places a stalled running agent in the blocked lane with a reason', () => {
    const agent = makeAgent({ phase: 'Stalled' });
    const lanes = deriveLanes(makeSnapshot({ running: [['i-1', agent]] }));
    const blocked = lanes.find((l) => l.id === 'blocked')!;
    expect(blocked.cards).toHaveLength(1);
    expect(blocked.cards[0]!.blockerReason).toBe('stalled');
  });

  it('places a rate-limited running agent in the blocked lane', () => {
    const agent = makeAgent({ phase: 'RateLimitSleeping' });
    const lanes = deriveLanes(makeSnapshot({ running: [['i-1', agent]] }));
    const blocked = lanes.find((l) => l.id === 'blocked')!;
    expect(blocked.cards[0]!.blockerReason).toBe('rate-limited');
  });

  it('places a retry entry in the blocked lane carrying its error', () => {
    const retry: RetryEntry = {
      issueId: 'i-retry',
      identifier: 'ISSUE-RETRY',
      attempt: 2,
      dueAtMs: 0,
      error: 'agent crashed',
    };
    const lanes = deriveLanes(makeSnapshot({ retryAttempts: [['i-retry', retry]] }));
    const blocked = lanes.find((l) => l.id === 'blocked')!;
    const card = blocked.cards.find((c) => c.issueId === 'i-retry')!;
    expect(card.blockerReason).toBe('agent crashed');
  });

  it('does not duplicate a retrying issue into the queued lane', () => {
    // The orchestrator keeps the claim while a retry is pending, so the id is
    // in both `claimed` and `retryAttempts`. It must show only in Blocked.
    const retry: RetryEntry = {
      issueId: 'i-both',
      identifier: 'ISSUE-BOTH',
      attempt: 1,
      dueAtMs: 0,
      error: 'transient failure',
    };
    const lanes = deriveLanes(
      makeSnapshot({ claimed: ['i-both'], retryAttempts: [['i-both', retry]] })
    );
    const queued = lanes.find((l) => l.id === 'queued')!;
    const blocked = lanes.find((l) => l.id === 'blocked')!;
    expect(queued.cards.map((c) => c.issueId)).not.toContain('i-both');
    expect(blocked.cards.map((c) => c.issueId)).toContain('i-both');
  });

  it('places a completed id in the done lane', () => {
    const lanes = deriveLanes(makeSnapshot({ completed: ['i-done'] }));
    const done = lanes.find((l) => l.id === 'done')!;
    expect(done.cards.map((c) => c.issueId)).toContain('i-done');
  });
});

describe('indexBoardIdentifiers', () => {
  it('indexes identifiers of non-done cards only', () => {
    const agent = makeAgent({ issueId: 'i-1', identifier: 'ISSUE-1' });
    const lanes = deriveLanes(
      makeSnapshot({
        running: [['i-1', agent]],
        claimed: ['QUEUED-1'],
        completed: ['DONE-1'],
      })
    );
    const ids = indexBoardIdentifiers(lanes);
    expect(ids.has('ISSUE-1')).toBe(true);
    expect(ids.has('QUEUED-1')).toBe(true);
    expect(ids.has('DONE-1')).toBe(false);
  });
});
