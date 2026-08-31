import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync, type execFile } from 'node:child_process';
import type { WorkflowConfig, IssueTrackerClient, Issue } from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { Orchestrator } from './orchestrator.js';
import { MockBackend } from './agent/backends/mock.js';

/**
 * bug-fleet HUNT (area: orchestrator-runloop-A) — reproduces a stale-abort
 * cross-attempt contamination in `runAgentInBackgroundTask`.
 *
 * `stopIssue()` (fired e.g. by stall_detected) aborts the AbortController
 * captured in the CLOSURE of the background task for a given `issue.id`. The
 * background task only notices the abort on its NEXT generator step, which
 * can be arbitrarily far in the future for a real backend. If a retry fires
 * and redispatches the SAME `issue.id` before the stale task notices its own
 * abort, `runAgentInBackgroundTask` re-populates `this.state.running` for the
 * NEW attempt.  When the STALE task's generator finally settles, it guards
 * the post-loop `emitWorkerExit('error', …, 'Stopped by reconciliation')`
 * call with `this.state.running.has(issue.id)` — a check that cannot
 * distinguish "my own entry is still there" from "a newer attempt's entry is
 * there". The stale task wins the race and fires a bogus worker-exit for the
 * CURRENT (unrelated, non-aborted) attempt, corrupting its state.
 *
 * This test drives that exact sequence deterministically (no timers, no
 * real races) by calling the private `runAgentInBackgroundTask` /
 * `stopIssue` methods directly and gating the fake backend's generator on
 * manually-resolved promises.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const noopExecFileFn = ((...args: unknown[]) => {
  const cb = args[args.length - 1];
  if (typeof cb === 'function') process.nextTick(() => cb(null, '0\n', ''));
  return undefined as any;
}) as typeof execFile;
(noopExecFileFn as any)[Symbol.for('nodejs.util.promisify.custom')] = () =>
  Promise.resolve({ stdout: '0\n', stderr: '' });
const noopExecFile: typeof execFile = noopExecFileFn;
/* eslint-enable @typescript-eslint/no-explicit-any */

let tmpDir: string;

function makeMockTracker(): IssueTrackerClient {
  return {
    fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([])),
    fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
    fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
    markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
    claimIssue: vi.fn().mockResolvedValue(Ok(undefined)),
    releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
  } as unknown as IssueTrackerClient;
}

function makeConfig(): WorkflowConfig {
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
  } as unknown as WorkflowConfig;
}

const ISSUE: Issue = {
  id: 'issue-race-1',
  identifier: 'H-RACE-1',
  title: 'Race test issue',
  description: 'd',
  priority: 1,
  state: 'planned',
  branchName: 'feat/race',
  url: null,
  labels: [],
  blockedBy: [],
  spec: null,
  plans: [],
  createdAt: null,
  updatedAt: null,
  externalId: null,
} as unknown as Issue;

/** A fake `AgentRunner` whose session generator pauses on an externally-controlled gate. */
function makeGatedRunner(): { runner: unknown; release: () => void } {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Intentionally yields nothing: simulates a real backend whose process was
  // SIGTERM'd mid-turn with no further events to drain. The for-await loop in
  // runAgentInBackgroundTask completes with zero iterations, and control
  // falls through to the post-loop abort check.
  const runner = {
    // eslint-disable-next-line require-yield
    runSession: async function* () {
      await gate;
    },
  };
  return { runner, release };
}

async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe('runAgentInBackgroundTask — stale-abort cross-attempt contamination', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-stale-abort-'));
    execSync(
      'git init && git config user.email "t@t" && git config user.name "t" && git commit --allow-empty -m init',
      { cwd: tmpDir, stdio: 'ignore' }
    );
    fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });

    orchestrator = new Orchestrator(makeConfig(), 'TEMPLATE', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
    });
  });

  afterEach(async () => {
    if (orchestrator) await orchestrator.stop();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  it('does not fire emitWorkerExit for a stale aborted attempt once a newer attempt owns the running entry', async () => {
    const orch = orchestrator as unknown as {
      state: { running: Map<string, unknown> };
      runAgentInBackgroundTask: (
        issue: Issue,
        workspacePath: string,
        prompt: string,
        attempt: number | null,
        runner: unknown,
        routedBackendName?: string
      ) => void;
      stopIssue: (issueId: string) => Promise<void>;
      emitWorkerExit: (...args: unknown[]) => Promise<void>;
    };

    const emitWorkerExitSpy = vi
      .spyOn(orch, 'emitWorkerExit')
      .mockResolvedValue(undefined as unknown as void);

    const workspacePath = path.join(tmpDir, '.harness', 'workspaces', 'h-race-1');
    fs.mkdirSync(workspacePath, { recursive: true });

    // --- Attempt 1: dispatched, then stalls and gets stopped ---
    orch.state.running.set(ISSUE.id, {
      issueId: ISSUE.id,
      identifier: ISSUE.identifier,
      issue: ISSUE,
      attempt: 1,
      workspacePath,
      startedAt: new Date().toISOString(),
      phase: 'StreamingTurn',
      session: null,
    });

    const attempt1 = makeGatedRunner();
    orch.runAgentInBackgroundTask(ISSUE, workspacePath, 'prompt-1', 1, attempt1.runner, 'mock');

    // Let the background IIFE actually start and reach `await gate`.
    await flush();

    // Stall detected -> handleEffect('stop') -> stopIssue(). Aborts attempt 1's
    // controller. Does NOT touch state.running (mirrors real stall handling,
    // which removes the running entry via the state machine's own effects,
    // orthogonal to stopIssue's abort side of the world).
    await orch.stopIssue(ISSUE.id);

    // --- Attempt 2: a retry fires and redispatches the SAME issue.id BEFORE
    // attempt 1's generator has noticed the abort (it is still parked on its
    // gate) ---
    orch.state.running.set(ISSUE.id, {
      issueId: ISSUE.id,
      identifier: ISSUE.identifier,
      issue: ISSUE,
      attempt: 2,
      workspacePath,
      startedAt: new Date().toISOString(),
      phase: 'StreamingTurn',
      session: null,
    });

    const attempt2 = makeGatedRunner();
    orch.runAgentInBackgroundTask(ISSUE, workspacePath, 'prompt-2', 2, attempt2.runner, 'mock');
    await flush();

    // Now let attempt 1's stale generator settle. It sees its OWN
    // abortController aborted, and the (buggy) guard only checks
    // `state.running.has(issue.id)` — true, because attempt 2 legitimately
    // owns that entry now. It should NOT treat attempt 2's live run as its
    // own abort outcome.
    attempt1.release();
    await flush(10);

    expect(emitWorkerExitSpy).not.toHaveBeenCalled();
  });
});
