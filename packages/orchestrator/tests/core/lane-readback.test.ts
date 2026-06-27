import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Orchestrator } from '../../src/orchestrator';
import { WorkflowConfig, Issue, Ok } from '@harness-engineering/types';
import { MockBackend } from '../../src/agent/backends/mock';
import { WorkspaceManager } from '../../src/workspace/manager';
import { eventSourcing } from '@harness-engineering/core';
import { persistLane } from '../../src/core/lane-persistence';
import { noopExecFile } from '../helpers/noop-exec-file';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

// Phase 4 (DLane-5) Task 16: a fresh orchestrator reads persisted task lanes
// back from the durable log on its first tick (Truth #9). Read-only diagnostic.

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

describe('Orchestrator startup lane read-back', () => {
  let orchestrator: Orchestrator;
  let mockTracker: any;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-lane-readback-'));
    execSync(
      'git init && git config user.email "test@test" && git config user.name "test" && git commit --allow-empty -m "init"',
      { cwd: tmpDir, stdio: 'ignore' }
    );
    fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });
    vi.spyOn(WorkspaceManager.prototype, 'sweepStaleBranches').mockResolvedValue([]);
    // No candidates → tick() is a no-op apart from the first-tick read-back.
    mockTracker = {
      fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([] as Issue[])),
      fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
      fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
      markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
      claimIssue: vi.fn().mockResolvedValue(Ok(undefined)),
      releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
    };
    orchestrator = new Orchestrator(createMockConfig(), 'Prompt', {
      tracker: mockTracker,
      backend: new MockBackend(),
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

  it('rehydrates lanes written by a prior process on the first tick (Truth #9)', async () => {
    // A prior process persisted a claim for issue-9 to projectRoot (=== tmpDir).
    const r = await persistLane(tmpDir, 'issue-9', 'claim');
    expect(r.ok).toBe(true);

    // The fresh orchestrator's first tick runs the lane read-back diagnostic.
    await orchestrator.tick();

    // The read-back stored the persisted lanes for observability.
    expect((orchestrator as any).persistedLanes.tasks['issue-9'].lane).toBe('claimed');

    // And the durable snapshot exposes it directly (survives across processes).
    const snap = await eventSourcing.readSnapshot(tmpDir);
    expect(snap.ok && snap.value.lanes.tasks['issue-9']?.lane).toBe('claimed');
  }, 15000);

  it('read-back is non-fatal when no lanes have been persisted yet', async () => {
    await orchestrator.tick();
    expect((orchestrator as any).persistedLanes.tasks).toEqual({});
  }, 15000);
});
