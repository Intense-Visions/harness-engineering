import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Orchestrator } from '../../src/orchestrator';
import { WorkflowConfig, Issue, Ok } from '@harness-engineering/types';
import { MockBackend } from '../../src/agent/backends/mock';
import { WorkspaceManager } from '../../src/workspace/manager';
import { eventSourcing } from '@harness-engineering/core';
import { noopExecFile } from '../helpers/noop-exec-file';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

// Phase 4 (DLane-5): the orchestrator persists task-lane state to the durable
// core event log at the effect boundary (handleClaimEffect / dispatchIssue /
// emitWorkerExit / escalate). These tests drive the real effect paths and read
// the lane back from the log with a FRESH projectLanes — proving lane state
// survives across processes (Truth #9) and that persistence never breaks dispatch.

let tmpDir: string;

function createMockConfig(): WorkflowConfig {
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
  };
}

const mockIssue: Issue = {
  id: 'issue-1',
  identifier: 'H-1',
  title: 'Test issue',
  description: 'Test description',
  priority: 1,
  state: 'planned',
  branchName: 'feat/test',
  url: null,
  labels: ['scope:quick-fix'],
  blockedBy: [],
  spec: null,
  plans: [],
  createdAt: null,
  updatedAt: null,
  externalId: null,
};

// projectRoot = resolve(workspace.root, '..', '..') === tmpDir
async function laneOf(issueId: string): Promise<string | undefined> {
  const loaded = await eventSourcing.loadEvents(tmpDir);
  if (!loaded.ok) throw loaded.error;
  return eventSourcing.projectLanes(loaded.value).tasks[issueId]?.lane;
}

async function waitForLane(issueId: string, lane: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await laneOf(issueId)) === lane) return;
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('Orchestrator lane persistence at the effect boundary', () => {
  let orchestrator: Orchestrator;
  let mockTracker: any;
  let mockBackend: MockBackend;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-lane-orch-'));
    execSync(
      'git init && git config user.email "test@test" && git config user.name "test" && git commit --allow-empty -m "init"',
      { cwd: tmpDir, stdio: 'ignore' }
    );
    fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });

    const workspacePath = path.join(tmpDir, '.harness', 'workspaces', 'h-1');
    vi.spyOn(WorkspaceManager.prototype, 'ensureWorkspace').mockImplementation(async () => {
      fs.mkdirSync(workspacePath, { recursive: true });
      return Ok(workspacePath);
    });
    vi.spyOn(WorkspaceManager.prototype, 'removeWorkspace').mockResolvedValue(Ok(undefined));
    vi.spyOn(WorkspaceManager.prototype, 'sweepStaleBranches').mockResolvedValue([]);
    vi.spyOn(WorkspaceManager.prototype, 'findPushedBranch').mockResolvedValue(null);

    let lastClaimedAssignee: string | null = null;
    mockTracker = {
      fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([mockIssue])),
      fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
      fetchIssueStatesByIds: vi.fn().mockImplementation((ids: string[]) => {
        const map = new Map<string, Issue>();
        for (const id of ids) {
          if (id === mockIssue.id) map.set(id, { ...mockIssue, assignee: lastClaimedAssignee });
        }
        return Promise.resolve(Ok(map));
      }),
      markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
      claimIssue: vi.fn().mockImplementation((_id: string, orchestratorId: string) => {
        lastClaimedAssignee = orchestratorId;
        return Promise.resolve(Ok(undefined));
      }),
      releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
    };
    mockBackend = new MockBackend();
    orchestrator = new Orchestrator(createMockConfig(), 'Prompt', {
      tracker: mockTracker,
      backend: mockBackend,
      execFileFn: noopExecFile,
    });
  });

  afterEach(async () => {
    if (orchestrator) await orchestrator.stop();
    vi.restoreAllMocks();
    for (let i = 0; i < 3; i++) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        break;
      } catch {
        if (i < 2) await new Promise((r) => setTimeout(r, 500));
      }
    }
  });

  it('persists claim→dispatch on tick; the lane survives a reload as in_progress', async () => {
    await orchestrator.tick();
    // claim (planned→claimed) and dispatch (claimed→in_progress) are awaited
    // inside the tick, so by now the lane is durably at in_progress. Read it
    // back with a fresh projectLanes over the log (no in-memory state).
    expect(await laneOf(mockIssue.id)).toBe('in_progress');
  }, 15000);

  it('persists success→in_review when the agent worker exits normally', async () => {
    await orchestrator.tick();
    expect(await laneOf(mockIssue.id)).toBe('in_progress');
    // MockBackend completes shortly after dispatch; worker_exit('normal') drives
    // success→in_review at the effect boundary.
    await waitForLane(mockIssue.id, 'in_review');
    expect(await laneOf(mockIssue.id)).toBe('in_review');
  }, 15000);

  it('persists abandon→canceled when an escalate effect is handled', async () => {
    await (orchestrator as any).handleEffect({
      type: 'escalate',
      issueId: 'esc-1',
      identifier: 'ESC-1',
      reasons: ['needs human'],
    });
    expect(await laneOf('esc-1')).toBe('canceled');
  }, 15000);

  it('persistLaneSafe NEVER throws and logs a warning on an Err (dispatch proceeds)', async () => {
    const warnSpy = vi.spyOn((orchestrator as any).logger, 'warn');
    // 'success' on an unregistered/never-dispatched task is off-table
    // (planned→in_review), so persistLane returns Err. persistLaneSafe must
    // swallow it (no throw) and log a diagnostic.
    await expect(
      (orchestrator as any).persistLaneSafe('never-dispatched', 'success')
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('lane persist failed'));
  }, 15000);
});
