import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync, type execFile } from 'node:child_process';
import type { WorkflowConfig, IssueTrackerClient, Issue } from '@harness-engineering/types';
import { Ok, RoutingError } from '@harness-engineering/types';
import { Orchestrator } from '../orchestrator.js';

/**
 * AMR D8 hard cap, `onBudgetExhausted: 'human'` — at/above the cap, `route()`
 * throws a fail-closed `RoutingError('budget-exhausted')` and the dispatch
 * boundary must treat it EXACTLY like the privacy-no-match terminal path: surface
 * ONE steward escalation, enqueue NO retry, and drive the unit terminal — never
 * fall through to `emitWorkerExit('error')` (whose error branch would retry into
 * the same wall up to `maxRetries` times).
 *
 * Mirrors adaptive-router.privacy-terminal.test.ts (the sibling deterministic
 * fail-closed path) — the only differences are the thrown error code and the
 * steward tag (`routing:budget-exhausted`).
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

const BACKENDS = {
  cheapFast: {
    type: 'mock' as const,
    capabilities: {
      tier: 'fast' as const,
      costPer1kTokens: 0,
      privacyClass: 'on-device' as const,
      contextWindow: 8192,
    },
  },
  strong: {
    type: 'mock' as const,
    capabilities: {
      tier: 'strong' as const,
      costPer1kTokens: 10,
      privacyClass: 'shared-cloud' as const,
      contextWindow: 200000,
    },
  },
};
const ROUTING = { default: 'strong', 'quick-fix': 'cheapFast' } as const;

function makeConfig(agentOverride: Partial<WorkflowConfig['agent']>): WorkflowConfig {
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
      ...agentOverride,
    } as unknown as WorkflowConfig['agent'],
    server: { port: null },
    intelligence: { enabled: true },
  } as unknown as WorkflowConfig;
}

function livePolicyConfig(): WorkflowConfig {
  return makeConfig({
    backends: BACKENDS,
    routing: { ...ROUTING, policy: { budget: { capUsd: 10, onBudgetExhausted: 'human' } } },
  });
}

function newOrch(cfg: WorkflowConfig): Orchestrator {
  // No `backend` override — an override short-circuits the AMR branch in
  // `dispatchIssue`, so `route()` would never be called and the fail-closed catch
  // could never fire. Dropping it lets the live AdaptiveRouter branch hit the
  // stubbed `route()`.
  return new Orchestrator(cfg, 'Prompt', {
    tracker: makeMockTracker(),
    execFileFn: noopExecFile,
  });
}

interface QueuedInteraction {
  issueId: string;
  type: string;
  reasons: string[];
  context: { issueTitle: string; issueDescription: string | null };
}

const ISSUE = {
  id: 'issue-budget-terminal',
  identifier: 'ISS-budget-terminal',
  title: 'A task dispatched after the routing budget is exhausted',
  description: 'onBudgetExhausted=human should surface to a steward, not route.',
  labels: [],
  externalId: null,
  state: 'planned',
} as unknown as Issue;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-amr-budget-terminal-'));
  execSync(
    'git init && git config user.email "test@test" && git config user.name "test" && git commit --allow-empty -m "init"',
    { cwd: tmpDir, stdio: 'ignore' }
  );
  fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

/**
 * Drive the FULL dispatch catch path: stub the live AdaptiveRouter's `route()` to
 * fail closed with a `budget-exhausted` RoutingError, then dispatch through
 * `dispatchAdHoc` (which seeds running+claimed then calls `dispatchIssue`).
 */
async function dispatchWithBudgetExhausted(): Promise<{
  orch: Orchestrator;
  queued: QueuedInteraction[];
}> {
  const orch = newOrch(livePolicyConfig());
  const router = orch.getAdaptiveRouter();
  expect(router).not.toBeNull();
  vi.spyOn(router!, 'route').mockRejectedValue(
    new RoutingError('budget-exhausted', 'routing budget cap $10 reached; onBudgetExhausted=human')
  );

  const queued: QueuedInteraction[] = [];
  (
    orch as unknown as {
      interactionQueue: { onPush: (fn: (i: QueuedInteraction) => void) => void };
    }
  ).interactionQueue.onPush((interaction) => queued.push(interaction));

  await orch.dispatchAdHoc(ISSUE);
  for (let n = 0; n < 50 && queued.filter((q) => q.issueId === ISSUE.id).length === 0; n++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  return { orch, queued };
}

function snapshotOf(orch: Orchestrator): {
  running: [string, unknown][];
  claimed: string[];
  retryAttempts: [string, unknown][];
} {
  return orch.getSnapshot() as unknown as {
    running: [string, unknown][];
    claimed: string[];
    retryAttempts: [string, unknown][];
  };
}

describe('budget-exhausted (human mode) fail-closed is TERMINAL, not a retry loop', () => {
  it('queues exactly ONE routing:budget-exhausted steward escalation for the unit', async () => {
    const { queued } = await dispatchWithBudgetExhausted();
    const escs = queued.filter((q) => q.issueId === ISSUE.id);
    expect(escs).toHaveLength(1);
    expect(escs[0]!.type).toBe('needs-human');
    expect(escs[0]!.reasons.join(' ')).toMatch(/budget-exhausted/);
  });

  it('enqueues NO retry — auto-retry would just re-hit the same cap', async () => {
    const { orch } = await dispatchWithBudgetExhausted();
    const snap = snapshotOf(orch);
    expect(snap.retryAttempts.find(([id]) => id === ISSUE.id)).toBeUndefined();
    expect(snap.retryAttempts).toHaveLength(0);
  });

  it('reaches a terminal state — out of running and no longer claimed', async () => {
    const { orch } = await dispatchWithBudgetExhausted();
    const snap = snapshotOf(orch);
    expect(snap.running.find(([id]) => id === ISSUE.id)).toBeUndefined();
    expect(snap.claimed).not.toContain(ISSUE.id);
  });
});
