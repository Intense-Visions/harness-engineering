import { describe, it, expect } from 'vitest';
import { applyEvent } from '../../src/core/state-machine';
import { createEmptyState } from '../../src/core/state-helpers';
import type { Issue, WorkflowConfig } from '@harness-engineering/types';
import type {
  OrchestratorEvent,
  EscalateEffect,
  ScheduleRetryEffect,
} from '../../src/types/events';

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
      escalation: {
        alwaysHuman: ['full-exploration'],
        autoExecute: ['quick-fix', 'diagnostic'],
        primaryExecute: [],
        signalGated: ['guided-change'],
        diagnosticRetryBudget: 1,
      },
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

describe('applyEvent - stall_detected does not honor diagnosticRetryBudget', () => {
  it('escalates a diagnostic issue that stalls after already exhausting its diagnostic retry budget, instead of scheduling another retry', () => {
    // Config gives diagnostic issues a TIGHT retry budget of 1 (vs the general
    // maxRetries of 5) -- the same contract `handleWorkerExit` enforces for a
    // failed run (see the "should escalate diagnostic after 1 failed retry
    // (SC5)" scenario in state-machine.test.ts).
    const config = makeConfig();
    const state = createEmptyState(config);

    // This diagnostic issue already used its one allotted retry (attempt: 1).
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

    const event: OrchestratorEvent = { type: 'stall_detected', issueId: 'id-1' };

    const { effects } = applyEvent(state, event, config);

    const escalations = effects.filter((e): e is EscalateEffect => e.type === 'escalate');
    const retries = effects.filter((e): e is ScheduleRetryEffect => e.type === 'scheduleRetry');

    // Same contract as the worker_exit path: a diagnostic issue that has already
    // spent its diagnosticRetryBudget (1) must escalate on the next failure
    // signal (here, a stall) rather than being scheduled for yet another retry
    // under the general maxRetries (5) budget.
    expect(escalations).toHaveLength(1);
    expect(retries).toHaveLength(0);
  });
});
