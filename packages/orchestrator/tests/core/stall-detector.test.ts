import { describe, it, expect } from 'vitest';
import { detectStalledIssues } from '../../src/core/stall-detector';
import type { Issue } from '@harness-engineering/types';
import type { RunningEntry, LiveSession } from '../../src/types/internal';

function makeIssue(id: string): Issue {
  return {
    id,
    identifier: `TEST-${id}`,
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
  };
}

function makeRunning(
  id: string,
  startedAt: string,
  session: LiveSession | null = null
): RunningEntry {
  return {
    issueId: id,
    identifier: `TEST-${id}`,
    issue: makeIssue(id),
    attempt: null,
    workspacePath: `/tmp/ws/${id}`,
    startedAt,
    phase: 'LaunchingAgent',
    session,
  };
}

function makeSession(overrides: Partial<LiveSession> = {}): LiveSession {
  return {
    sessionId: 's-1',
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
    turnCount: 0,
    ...overrides,
  };
}

describe('detectStalledIssues', () => {
  it('returns IDs whose lastTimestamp is older than stallTimeoutMs', () => {
    const running = new Map<string, RunningEntry>();
    running.set(
      'fresh',
      makeRunning(
        'fresh',
        '2026-01-01T00:00:00Z',
        makeSession({ lastTimestamp: '2026-01-01T00:09:30Z' })
      )
    );
    running.set(
      'stale',
      makeRunning(
        'stale',
        '2026-01-01T00:00:00Z',
        makeSession({ lastTimestamp: '2026-01-01T00:05:00Z' })
      )
    );

    const nowMs = new Date('2026-01-01T00:10:00Z').getTime();
    const stalled = detectStalledIssues(running, nowMs, 60_000);

    expect(stalled).toEqual(['stale']);
  });

  it('regression: zero-event agent is stall-detected via startedAt fallback', () => {
    // This is the bug. Without the fallback, an agent that hangs before
    // emitting its first event sits in `running` forever, eventually
    // pinning maxConcurrentAgents and silently blocking all new dispatches
    // until the orchestrator is restarted.
    const running = new Map<string, RunningEntry>();
    running.set('silent', makeRunning('silent', '2026-01-01T00:00:00Z', null));
    running.set(
      'also-silent',
      makeRunning('also-silent', '2026-01-01T00:00:30Z', makeSession({ lastTimestamp: null }))
    );

    const nowMs = new Date('2026-01-01T00:05:00Z').getTime();
    const stalled = detectStalledIssues(running, nowMs, 60_000);

    expect(stalled.sort()).toEqual(['also-silent', 'silent']);
  });

  it('respects stallTimeoutMs <= 0 as "disabled"', () => {
    const running = new Map<string, RunningEntry>();
    running.set('silent', makeRunning('silent', '2026-01-01T00:00:00Z', null));

    const nowMs = new Date('2026-01-01T01:00:00Z').getTime();
    expect(detectStalledIssues(running, nowMs, 0)).toEqual([]);
    expect(detectStalledIssues(running, nowMs, -1)).toEqual([]);
  });

  it('prefers session.lastTimestamp over startedAt when both are present', () => {
    const running = new Map<string, RunningEntry>();
    // startedAt is old, but a recent session event means it's NOT stalled
    running.set(
      'active',
      makeRunning(
        'active',
        '2026-01-01T00:00:00Z',
        makeSession({ lastTimestamp: '2026-01-01T00:09:55Z' })
      )
    );

    const nowMs = new Date('2026-01-01T00:10:00Z').getTime();
    expect(detectStalledIssues(running, nowMs, 60_000)).toEqual([]);
  });

  it('returns empty when running is empty', () => {
    expect(detectStalledIssues(new Map(), Date.now(), 60_000)).toEqual([]);
  });
});
