import { describe, it, expect } from 'vitest';
import { applyEvent } from '../../src/core/state-machine';
import { createEmptyState } from '../../src/core/state-helpers';
import { recordBudgetSpend } from '../../src/core/budget-governor';
import type { AgentBudgetConfig, Issue, WorkflowConfig } from '@harness-engineering/types';
import type { OrchestratorEvent, ClaimEffect } from '../../src/types/events';
import type { RunningEntry } from '../../src/types/internal';

/**
 * WIRED verification for #1525: the budget governor is consulted on the REAL
 * dispatch path (`applyEvent(tick)` → `canDispatch`), stops dispatch cleanly at a
 * lane boundary when the envelope is spent, and never touches a lane already in
 * flight. Also proves the accrual path (`agent_update` usage → envelope spend).
 */

function makeConfig(budget?: AgentBudgetConfig): WorkflowConfig {
  return {
    tracker: {
      kind: 'roadmap',
      activeStates: ['planned', 'in-progress'],
      terminalStates: ['done'],
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
      maxConcurrentAgents: 5,
      maxTurns: 20,
      maxRetryBackoffMs: 300000,
      maxRetries: 5,
      maxConcurrentAgentsByState: {},
      turnTimeoutMs: 3600000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 300000,
      ...(budget ? { budget } : {}),
    },
    server: { port: null },
  } as WorkflowConfig;
}

function makeIssue(id: string, labels: string[] = ['scope:quick-fix']): Issue {
  return {
    id,
    identifier: `A-${id}`,
    title: `Issue ${id}`,
    description: null,
    priority: Number(id),
    state: 'planned',
    branchName: null,
    url: null,
    labels,
    blockedBy: [],
    spec: null,
    plans: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: null,
    externalId: null,
  };
}

function tick(candidates: Issue[], nowMs = 1_706_745_600_000): OrchestratorEvent {
  return { type: 'tick', candidates, runningStates: new Map(), nowMs };
}

function claims(effects: { type: string }[]): ClaimEffect[] {
  return effects.filter((e) => e.type === 'claim') as ClaimEffect[];
}

describe('#1525 wired: governor gates the real dispatch path', () => {
  it('governor off (no budget) dispatches normally', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    expect(state.budget).toBeNull();
    const { effects } = applyEvent(state, tick([makeIssue('1'), makeIssue('2')]), config);
    expect(claims(effects)).toHaveLength(2);
  });

  it('dispatches while the envelope has room', () => {
    const budget: AgentBudgetConfig = { period: 'day', envelopeTokens: 10_000 };
    const config = makeConfig(budget);
    const state = createEmptyState(config);
    const { effects } = applyEvent(state, tick([makeIssue('1'), makeIssue('2')]), config);
    expect(claims(effects)).toHaveLength(2);
  });

  it('stops dispatch cleanly once the envelope is spent — zero new claims', () => {
    const budget: AgentBudgetConfig = { period: 'day', envelopeTokens: 1000 };
    const config = makeConfig(budget);
    const state = createEmptyState(config);
    // Simulate a prior spend that exhausts the envelope.
    state.budget = recordBudgetSpend(state.budget!, budget, null, 1000, Date.now());

    const { effects, nextState } = applyEvent(
      state,
      tick([makeIssue('1'), makeIssue('2')]),
      config
    );
    expect(claims(effects)).toHaveLength(0);
    expect(nextState.claimed.size).toBe(0);
  });

  it('never touches a lane already in flight when the envelope is spent', () => {
    const budget: AgentBudgetConfig = { period: 'day', envelopeTokens: 1000 };
    const config = makeConfig(budget);
    const state = createEmptyState(config);
    state.budget = recordBudgetSpend(state.budget!, budget, null, 1000, Date.now());

    // A lane already running.
    const running: RunningEntry = {
      issueId: 'running-1',
      identifier: 'A-running',
      issue: makeIssue('running-1'),
      attempt: null,
      workspacePath: '/tmp/ws/running-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    };
    state.running.set('running-1', running);

    const { nextState } = applyEvent(state, tick([makeIssue('2')]), config);
    // In-flight lane survives; no new lane dispatched.
    expect(nextState.running.has('running-1')).toBe(true);
    expect(nextState.claimed.size).toBe(0);
  });

  it('honours per-fleet sub-allocation under contention on the dispatch path', () => {
    const budget: AgentBudgetConfig = {
      period: 'day',
      envelopeTokens: 100_000,
      perFleet: { roadmap: 500 },
    };
    const config = makeConfig(budget);
    const state = createEmptyState(config);
    // Exhaust roadmap's sub-allocation; global still has ample room.
    state.budget = recordBudgetSpend(state.budget!, budget, 'roadmap', 500, Date.now());

    const roadmapIssue = makeIssue('1', ['scope:quick-fix', 'fleet:roadmap']);
    const bugIssue = makeIssue('2', ['scope:quick-fix', 'fleet:bug']);

    const { effects } = applyEvent(state, tick([roadmapIssue, bugIssue]), config);
    const claimed = claims(effects).map((c) => c.issue.id);
    // roadmap is gated; bug (no exhausted allocation) still dispatches.
    expect(claimed).toContain('2');
    expect(claimed).not.toContain('1');
  });
});

describe('#1525 wired: usage accrues against the envelope', () => {
  it('agent_update usage records spend into the budget accumulator', () => {
    const budget: AgentBudgetConfig = { period: 'day', envelopeTokens: 10_000 };
    const config = makeConfig(budget);
    const state = createEmptyState(config);

    // Put a running lane with a live session so accrueUsage has an entry.
    const running: RunningEntry = {
      issueId: 'run-1',
      identifier: 'A-run',
      issue: makeIssue('run-1', ['fleet:roadmap']),
      attempt: null,
      workspacePath: '/tmp/ws/run-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: {
        sessionId: 's1',
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
      },
    };
    state.running.set('run-1', running);

    const event: OrchestratorEvent = {
      type: 'agent_update',
      issueId: 'run-1',
      event: {
        type: 'assistant',
        usage: {
          inputTokens: 300,
          outputTokens: 200,
          totalTokens: 500,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    };

    const { nextState } = applyEvent(state, event, config);
    expect(nextState.budget?.spentTokens).toBe(500);
    // Attributed to the lane's fleet.
    expect(nextState.budget?.perFleetSpent.roadmap).toBe(500);
  });
});
