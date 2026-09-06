import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Orchestrator } from '../../src/orchestrator';
import { WorkflowConfig, Ok } from '@harness-engineering/types';
import { MockBackend } from '../../src/agent/backends/mock';
import { WorkspaceManager } from '../../src/workspace/manager';
import { noopExecFile } from '../helpers/noop-exec-file';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

// bug-fleet A5 (orchestrator.ts): `Orchestrator.stop()` clears `this.interval`,
// but the polling loop re-arms itself from INSIDE the tick's own `.finally`
// (start(): `this.interval = setTimeout(() => { void this.tick().finally(() =>
// scheduleNextTick()); }, delay)`). There is no stopped flag, so a `stop()` that
// lands after the poll timer fired but before that tick settles is undone: the
// `.finally` calls `scheduleNextTick()` again and arms a NEW timer on a stopped
// orchestrator. The polling loop keeps running (and keeps the event loop alive)
// forever after shutdown.

const INTERVAL_MS = 1000;
let tmpDir: string;

function createMockConfig(): WorkflowConfig {
  return {
    tracker: { kind: 'mock', activeStates: ['planned'], terminalStates: ['done'] },
    polling: { intervalMs: INTERVAL_MS },
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
  } as unknown as WorkflowConfig;
}

describe('Orchestrator.stop() vs the self-rearming poll timer', () => {
  let orchestrator: Orchestrator;
  // Never resolved: pins the very first tick in-flight for the whole test.
  const pinned = new Promise<never>(() => {});

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-bf-a5-stop-'));
    execSync(
      'git init && git config user.email "test@test" && git config user.name "test" && git commit --allow-empty -m "init"',
      { cwd: tmpDir, stdio: 'ignore' }
    );
    fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });
    vi.spyOn(WorkspaceManager.prototype, 'sweepStaleBranches').mockResolvedValue([]);
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });

    const tracker = {
      // Pins every tick that reaches it, so `tickInProgress` stays true.
      fetchCandidateIssues: vi.fn().mockReturnValue(pinned),
      fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
      fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
      markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
      claimIssue: vi.fn().mockResolvedValue(Ok(undefined)),
      releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
    } as unknown as import('@harness-engineering/core').IssueTrackerClient;

    orchestrator = new Orchestrator(createMockConfig(), 'Prompt', {
      tracker,
      backend: new MockBackend(),
      execFileFn: noopExecFile,
    });
  });

  afterEach(async () => {
    // Defuse any timer the defect left armed so the suite can exit.
    const leaked = (orchestrator as unknown as { interval?: NodeJS.Timeout }).interval;
    if (leaked) clearTimeout(leaked);
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (let i = 0; i < 3; i++) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        break;
      } catch {
        if (i < 2) await new Promise((r) => setTimeout(r, 200));
      }
    }
  });

  it('leaves no polling timer armed after stop()', async () => {
    await orchestrator.start();

    const priv = orchestrator as unknown as {
      interval?: NodeJS.Timeout;
      tickInProgress: boolean;
    };

    // Precondition: start() armed the poll timer and pinned the initial tick.
    expect(priv.interval).toBeDefined();
    expect(priv.tickInProgress).toBe(true);

    // The poll timer fires. `tick()` short-circuits on `tickInProgress` and
    // resolves on a microtask, so its `.finally(() => scheduleNextTick())` is
    // now queued but has NOT run yet.
    vi.advanceTimersByTime(INTERVAL_MS);

    // Shut down. `stop()` clears `this.interval` synchronously, before its
    // first await — i.e. strictly before that queued `.finally` can run.
    await orchestrator.stop();

    // Let the in-flight tick's `.finally` run.
    for (let i = 0; i < 20; i++) await Promise.resolve();

    // A stopped orchestrator must not have a live polling timer.
    expect(priv.interval).toBeUndefined();
  }, 20000);
});
