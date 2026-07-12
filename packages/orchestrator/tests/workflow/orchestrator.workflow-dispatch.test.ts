import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { Ok } from '@harness-engineering/types';
import type { Issue, StageRun, WorkflowConfig } from '@harness-engineering/types';
import { Orchestrator } from '../../src/orchestrator.js';
import { WorkspaceManager } from '../../src/workspace/manager.js';
import { MockBackend } from '../../src/agent/backends/mock.js';
import type { RunningEntry } from '../../src/types/internal.js';

let tmpDir: string;

function createConfig(workflows?: WorkflowConfig['workflows']): WorkflowConfig {
  return {
    tracker: { kind: 'mock', activeStates: ['planned'], terminalStates: ['done'] },
    polling: { intervalMs: 1000 },
    workspace: { root: path.join(tmpDir, '.harness', 'workspaces') },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 1000,
    },
    agent: {
      backend: 'mock',
      maxConcurrentAgents: 2,
      maxTurns: 3,
      maxRetryBackoffMs: 1000,
      maxRetries: 5,
      maxConcurrentAgentsByState: { planned: 1 },
      turnTimeoutMs: 5000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 5000,
    },
    server: { port: null },
    ...(workflows !== undefined ? { workflows } : {}),
  } as WorkflowConfig;
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'issue-1',
    identifier: 'REV-1',
    title: 'Test',
    description: null,
    priority: null,
    state: 'planned',
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

function seedRunning(orch: Orchestrator, issue: Issue): void {
  const entry: RunningEntry = {
    issueId: issue.id,
    identifier: issue.identifier,
    issue,
    attempt: 0,
    workspacePath: '/tmp/ws',
    startedAt: new Date().toISOString(),
    phase: 'LaunchingAgent',
    session: null,
  };
  const state = (
    orch as unknown as { state: { running: Map<string, RunningEntry>; claimed: Set<string> } }
  ).state;
  state.running.set(issue.id, entry);
  state.claimed.add(issue.id);
}

describe('Orchestrator settleWorkflowSuccess / settleWorkflowTerminal (Task 7)', () => {
  let orch: Orchestrator;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-wf-'));
    execSync(
      'git init && git config user.email "t@t" && git config user.name "t" && git commit --allow-empty -m init',
      { cwd: tmpDir, stdio: 'ignore' }
    );
    fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });
    // Keep cleanWorkspaceWithGuard quiet — no pushed branch ⇒ removeWorkspace path.
    vi.spyOn(WorkspaceManager.prototype, 'findPushedBranch').mockResolvedValue(null);
    vi.spyOn(WorkspaceManager.prototype, 'removeWorkspace').mockResolvedValue(Ok(undefined));
    const mockTracker = {
      fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([])),
      fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
      fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
      markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
      claimIssue: vi.fn().mockResolvedValue(Ok(undefined)),
      releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
    };
    orch = new Orchestrator(createConfig(), 'Prompt', {
      tracker: mockTracker as never,
      backend: new MockBackend(),
    });
  });

  afterEach(async () => {
    await orch.stop();
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('settleWorkflowSuccess removes running, sets completed, releases claim, persists success', async () => {
    const issue = makeIssue();
    seedRunning(orch, issue);
    const runs: StageRun[] = [
      { index: 0, step: { skill: 'a', produces: 'x' }, outcome: 'pass', attempt: 0 },
    ];
    await (
      orch as unknown as { settleWorkflowSuccess: (u: string, r: StageRun[]) => Promise<void> }
    ).settleWorkflowSuccess(issue.id, runs);

    const state = (
      orch as unknown as {
        state: {
          running: Map<string, unknown>;
          claimed: Set<string>;
          completed: Map<string, number>;
        };
      }
    ).state;
    expect(state.running.has(issue.id)).toBe(false);
    expect(state.claimed.has(issue.id)).toBe(false);
    expect(state.completed.has(issue.id)).toBe(true);
  });

  it('settleWorkflowTerminal removes running+claimed, persists abandon, queues exactly one interaction', async () => {
    const issue = makeIssue();
    seedRunning(orch, issue);
    const queue = (
      orch as unknown as { interactionQueue: { size?: () => number; getAll?: () => unknown[] } }
    ).interactionQueue;
    const pushSpy = vi.spyOn(queue as unknown as { push: (i: unknown) => Promise<void> }, 'push');

    const runs: StageRun[] = [
      { index: 0, step: { skill: 'a', produces: 'x' }, outcome: 'fail', attempt: 1 },
    ];
    await (
      orch as unknown as {
        settleWorkflowTerminal: (
          u: string,
          r: StageRun[],
          s?: unknown,
          e?: unknown
        ) => Promise<void>;
      }
    ).settleWorkflowTerminal(issue.id, runs, runs[0]!.step);

    const state = (
      orch as unknown as { state: { running: Map<string, unknown>; claimed: Set<string> } }
    ).state;
    expect(state.running.has(issue.id)).toBe(false);
    expect(state.claimed.has(issue.id)).toBe(false);
    expect(pushSpy).toHaveBeenCalledTimes(1);
  });
});
