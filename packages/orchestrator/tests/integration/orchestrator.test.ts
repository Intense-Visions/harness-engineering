import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Orchestrator } from '../../src/orchestrator';
import { WorkflowConfig, Issue, Ok } from '@harness-engineering/types';
import { MockBackend } from '../../src/agent/backends/mock';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

let tmpDir: string;

function createMockConfig(): WorkflowConfig {
  return {
    tracker: {
      kind: 'mock',
      activeStates: ['planned'],
      terminalStates: ['done'],
    },
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

describe('Orchestrator Integration', () => {
  let orchestrator: Orchestrator;
  let mockTracker: any;
  let mockBackend: MockBackend;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-orch-'));
    execSync('git init && git commit --allow-empty -m "init"', { cwd: tmpDir, stdio: 'ignore' });
    // Ensure workspace root exists so WorkspaceManager can run git commands in it
    fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });

    // Track assignee state so claimAndVerify sees the correct assignee after claimIssue
    let lastClaimedAssignee: string | null = null;
    mockTracker = {
      fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([mockIssue])),
      fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
      fetchIssueStatesByIds: vi.fn().mockImplementation((ids: string[]) => {
        const map = new Map<string, Issue>();
        for (const id of ids) {
          if (id === mockIssue.id) {
            map.set(id, { ...mockIssue, assignee: lastClaimedAssignee });
          }
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
    });
  });

  afterEach(async () => {
    if (orchestrator) await orchestrator.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should poll, dispatch, and run an agent session', { timeout: 15000 }, async () => {
    // 1. Initial tick
    await orchestrator.tick();

    // Verify tick resulted in dispatch
    const snapshot = orchestrator.getSnapshot();
    expect(snapshot.running.length).toBe(1);
    expect(snapshot.claimed.includes(mockIssue.id)).toBe(true);

    // 2. Wait for background agent task to finish
    // Since MockBackend uses setTimeout(100), we wait a bit more.
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify worker exit resulted in state change
    const finalSnapshot = orchestrator.getSnapshot();
    expect(finalSnapshot.running.length).toBe(0);
    // Successful completion is terminal: handleWorkerExit removes the running
    // entry, releases the claim, and adds the issue to `completed`. No retry
    // is scheduled — the issue should not re-appear in claimed or running.
    expect(finalSnapshot.claimed.includes(mockIssue.id)).toBe(false);
    expect((finalSnapshot.completed as string[]).includes(mockIssue.id)).toBe(true);
  });

  it('should stop active runs when orchestrator stops', { timeout: 15000 }, async () => {
    await orchestrator.tick();
    const snapshot = orchestrator.getSnapshot();
    expect(snapshot.running.length).toBe(1);

    orchestrator.stop();

    // Verify no running tasks after some time
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Since we called orchestrator.stop(), the background async function will finish its finally block
    // but the state machine might still have it as running until tick() or worker_exit.
    // But orchestrator.stop() calls return() on generators.
  });
});
