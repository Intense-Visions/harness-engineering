import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { Ok } from '@harness-engineering/types';
import type {
  Issue,
  StageRun,
  WorkflowConfig,
  BackendCapabilities,
  ComplexityVerdict,
} from '@harness-engineering/types';
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

const twoStages = [
  { skill: 'stage-a', produces: 'x' },
  { skill: 'stage-b', produces: 'y', expects: 'x' },
];

/** Build an orchestrator wired so dispatchIssue reaches the workflow branch. */
function makeDispatchOrch(workflows?: WorkflowConfig['workflows']): Orchestrator {
  const workspacePath = path.join(tmpDir, '.harness', 'workspaces', 'ws');
  vi.spyOn(WorkspaceManager.prototype, 'ensureWorkspace').mockImplementation(async () => {
    fs.mkdirSync(workspacePath, { recursive: true });
    return Ok(workspacePath);
  });
  const mockTracker = {
    fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([])),
    fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
    fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
    markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
    claimIssue: vi.fn().mockResolvedValue(Ok(undefined)),
    releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
  };
  return new Orchestrator(createConfig(workflows), 'Prompt', {
    tracker: mockTracker as never,
    backend: new MockBackend(),
  });
}

async function dispatch(orch: Orchestrator, issue: Issue): Promise<void> {
  // Seed the running entry the claim effect would have created, so dispatchIssue's
  // `state.running.get(issue.id)` finds it (SC5: the branch is after the claim).
  seedRunning(orch, issue);
  await (
    orch as unknown as { dispatchIssue: (i: Issue, a: number | null) => Promise<void> }
  ).dispatchIssue(issue, 0);
}

describe('dispatchIssue workflow branch (SC4 identity / D13 / workflow entry)', () => {
  let orch: Orchestrator;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-wfd-'));
    execSync(
      'git init && git config user.email "t@t" && git config user.name "t" && git commit --allow-empty -m init',
      { cwd: tmpDir, stdio: 'ignore' }
    );
    fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });
    vi.spyOn(WorkspaceManager.prototype, 'findPushedBranch').mockResolvedValue(null);
    vi.spyOn(WorkspaceManager.prototype, 'removeWorkspace').mockResolvedValue(Ok(undefined));
  });

  afterEach(async () => {
    if (orch) await orch.stop();
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('SC4: NO workflows declared → single-agent path (runAgentInBackgroundTask), executeWorkflow NOT entered', async () => {
    orch = makeDispatchOrch(undefined);
    const bgSpy = vi
      .spyOn(
        orch as unknown as { runAgentInBackgroundTask: (...a: unknown[]) => void },
        'runAgentInBackgroundTask'
      )
      .mockImplementation(() => {});
    const wfSpy = vi.spyOn(
      orch as unknown as { settleWorkflowSuccess: (...a: unknown[]) => Promise<void> },
      'settleWorkflowSuccess'
    );

    await dispatch(orch, makeIssue({ identifier: 'REV-1' }));

    expect(bgSpy).toHaveBeenCalledTimes(1);
    expect(wfSpy).not.toHaveBeenCalled();
  });

  it('SC4/D13: a 1-stage decl → single-agent path (workflowFor returns undefined)', async () => {
    orch = makeDispatchOrch([
      { name: 'single', match: { identifierPrefix: 'REV-' }, stages: [twoStages[0]!] },
    ]);
    const bgSpy = vi
      .spyOn(
        orch as unknown as { runAgentInBackgroundTask: (...a: unknown[]) => void },
        'runAgentInBackgroundTask'
      )
      .mockImplementation(() => {});

    await dispatch(orch, makeIssue({ identifier: 'REV-1' }));

    expect(bgSpy).toHaveBeenCalledTimes(1);
  });

  it('SC4: a NON-matching 2-stage decl → single-agent path (predicate no-match)', async () => {
    orch = makeDispatchOrch([
      { name: 'w', match: { identifierPrefix: 'BUG-' }, stages: twoStages },
    ]);
    const bgSpy = vi
      .spyOn(
        orch as unknown as { runAgentInBackgroundTask: (...a: unknown[]) => void },
        'runAgentInBackgroundTask'
      )
      .mockImplementation(() => {});

    await dispatch(orch, makeIssue({ identifier: 'REV-1' }));

    expect(bgSpy).toHaveBeenCalledTimes(1);
  });

  it('workflow entry: a matching 2-stage decl → executeWorkflow runs; single-agent path NOT taken', async () => {
    orch = makeDispatchOrch([
      { name: 'w', match: { identifierPrefix: 'REV-' }, stages: twoStages },
    ]);
    const bgSpy = vi
      .spyOn(
        orch as unknown as { runAgentInBackgroundTask: (...a: unknown[]) => void },
        'runAgentInBackgroundTask'
      )
      .mockImplementation(() => {});
    const successSpy = vi.spyOn(
      orch as unknown as { settleWorkflowSuccess: (...a: unknown[]) => Promise<void> },
      'settleWorkflowSuccess'
    );
    const recorder = (
      orch as unknown as { recorder: { startRecording: (...a: unknown[]) => void } }
    ).recorder;
    const recSpy = vi.spyOn(recorder, 'startRecording');

    await dispatch(orch, makeIssue({ identifier: 'REV-1' }));
    // executeWorkflow is fire-and-forget; allow the two MockBackend stages to settle.
    await vi.waitFor(() => expect(successSpy).toHaveBeenCalledTimes(1), { timeout: 5000 });

    // single-agent path was NOT taken
    expect(bgSpy).not.toHaveBeenCalled();
    // two per-stage recordings happened (one startRecording per stage)
    const stageRecordCalls = recSpy.mock.calls.filter((c) => c[0] === 'issue-1');
    expect(stageRecordCalls.length).toBeGreaterThanOrEqual(2);
    // running/claimed drained; completed set
    const state = (
      orch as unknown as {
        state: {
          running: Map<string, unknown>;
          claimed: Set<string>;
          completed: Map<string, number>;
        };
      }
    ).state;
    expect(state.running.has('issue-1')).toBe(false);
    expect(state.claimed.has('issue-1')).toBe(false);
    expect(state.completed.has('issue-1')).toBe(true);
  });
});

const cap = (over: Partial<BackendCapabilities> = {}): BackendCapabilities => ({
  tier: 'fast',
  costPer1kTokens: 0,
  privacyClass: 'on-device',
  contextWindow: 8192,
  ...over,
});

const verdict = (level: ComplexityVerdict['level']): ComplexityVerdict => ({
  level,
  confidence: 'high',
  signals: {},
  source: 'static',
});

/** Config with a fast + strong mock backend and routing.policy set (adaptiveRouter !== null). */
function createRoutedConfig(workflows: WorkflowConfig['workflows']): WorkflowConfig {
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
      maxConcurrentAgents: 2,
      maxTurns: 3,
      maxRetryBackoffMs: 1000,
      maxRetries: 5,
      maxConcurrentAgentsByState: { planned: 1 },
      turnTimeoutMs: 5000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 5000,
      backends: {
        fast: { type: 'mock', capabilities: cap({ tier: 'fast', costPer1kTokens: 0 }) },
        strong: { type: 'mock', capabilities: cap({ tier: 'strong', costPer1kTokens: 10 }) },
      },
      // Non-empty policy so the orchestrator's policyActive gate constructs the
      // AdaptiveRouter (orchestrator.ts:701: Object.keys(policy).length > 0).
      routing: { default: 'fast', policy: { escalationThreshold: 2 } },
    },
    server: { port: null },
    workflows,
  } as unknown as WorkflowConfig;
}

describe('SC2 end-to-end — two stages route to two tiers through the real context', () => {
  let orch: Orchestrator;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-sc2-'));
    execSync(
      'git init && git config user.email "t@t" && git config user.name "t" && git commit --allow-empty -m init',
      { cwd: tmpDir, stdio: 'ignore' }
    );
    fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });
    const workspacePath = path.join(tmpDir, '.harness', 'workspaces', 'ws');
    vi.spyOn(WorkspaceManager.prototype, 'ensureWorkspace').mockImplementation(async () => {
      fs.mkdirSync(workspacePath, { recursive: true });
      return Ok(workspacePath);
    });
    vi.spyOn(WorkspaceManager.prototype, 'findPushedBranch').mockResolvedValue(null);
    vi.spyOn(WorkspaceManager.prototype, 'removeWorkspace').mockResolvedValue(Ok(undefined));
  });

  afterEach(async () => {
    if (orch) await orch.stop();
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('a complex-hinted stage routes strong and a trivial-hinted stage routes fast (distinct tiers)', async () => {
    const stages = [
      { skill: 'design', produces: 'plan', routingHint: { complexity: verdict('complex') } },
      {
        skill: 'lint',
        produces: 'clean',
        expects: 'plan',
        routingHint: { complexity: verdict('trivial') },
      },
    ];
    orch = new Orchestrator(
      createRoutedConfig([{ name: 'w', match: { identifierPrefix: 'REV-' }, stages }]),
      'Prompt',
      {
        tracker: {
          fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([])),
          fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
          fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
          markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
          claimIssue: vi.fn().mockResolvedValue(Ok(undefined)),
          releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
        } as never,
      }
    );

    // Capture the per-stage runs by wrapping the success settle.
    let capturedRuns: StageRun[] = [];
    const realSuccess = (
      orch as unknown as { settleWorkflowSuccess: (u: string, r: StageRun[]) => Promise<void> }
    ).settleWorkflowSuccess.bind(orch);
    vi.spyOn(
      orch as unknown as { settleWorkflowSuccess: (u: string, r: StageRun[]) => Promise<void> },
      'settleWorkflowSuccess'
    ).mockImplementation(async (u, r) => {
      capturedRuns = r;
      return realSuccess(u, r);
    });

    await dispatch(orch, makeIssue({ identifier: 'REV-9' }));
    await vi.waitFor(() => expect(capturedRuns.length).toBe(2), { timeout: 5000 });

    // Stage 0 (complex) → strong; stage 1 (trivial) → fast. Distinct tiers + backends.
    const [s0, s1] = capturedRuns;
    expect(s0!.tier).toBe('strong');
    expect(s1!.tier).toBe('fast');
    expect(s0!.decision?.backendName).not.toBe(s1!.decision?.backendName);

    // One completion; state drained.
    const state = (
      orch as unknown as {
        state: {
          running: Map<string, unknown>;
          claimed: Set<string>;
          completed: Map<string, number>;
        };
      }
    ).state;
    expect(state.completed.has('issue-1')).toBe(true);
    expect(state.running.has('issue-1')).toBe(false);
  });
});

describe('D11 restart-from-0 + SC5/SC6/SC7 through the real workflow context', () => {
  let orch: Orchestrator;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-d11-'));
    execSync(
      'git init && git config user.email "t@t" && git config user.name "t" && git commit --allow-empty -m init',
      { cwd: tmpDir, stdio: 'ignore' }
    );
    fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });
    vi.spyOn(WorkspaceManager.prototype, 'findPushedBranch').mockResolvedValue(null);
    vi.spyOn(WorkspaceManager.prototype, 'removeWorkspace').mockResolvedValue(Ok(undefined));
  });

  afterEach(async () => {
    if (orch) await orch.stop();
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('D11: re-dispatch after completion re-runs from stage 0 on a fresh worktree (ensureWorkspace called again)', async () => {
    const workspacePath = path.join(tmpDir, '.harness', 'workspaces', 'ws');
    const ensureSpy = vi
      .spyOn(WorkspaceManager.prototype, 'ensureWorkspace')
      .mockImplementation(async () => {
        fs.mkdirSync(workspacePath, { recursive: true });
        return Ok(workspacePath);
      });
    orch = makeDispatchOrch([
      { name: 'w', match: { identifierPrefix: 'REV-' }, stages: twoStages },
    ]);
    const successSpy = vi.spyOn(
      orch as unknown as { settleWorkflowSuccess: (u: string, r: StageRun[]) => Promise<void> },
      'settleWorkflowSuccess'
    );

    // First dispatch → completes.
    await dispatch(orch, makeIssue({ identifier: 'REV-1' }));
    await vi.waitFor(() => expect(successSpy).toHaveBeenCalledTimes(1), { timeout: 5000 });
    const ensureAfterFirst = ensureSpy.mock.calls.length;
    // clear completed so the re-dispatch is not gated (simulate a process-restart re-pickup)
    (orch as unknown as { state: { completed: Map<string, number> } }).state.completed.clear();

    // Re-dispatch the SAME unit.
    await dispatch(orch, makeIssue({ identifier: 'REV-1' }));
    await vi.waitFor(() => expect(successSpy).toHaveBeenCalledTimes(2), { timeout: 5000 });

    // A fresh worktree was ensured again (no persisted stage cursor — restart from 0).
    expect(ensureSpy.mock.calls.length).toBeGreaterThan(ensureAfterFirst);
  });

  it('SC5: a runner throw inside a stage → exactly one terminal, no orphaned running/claimed', async () => {
    orch = makeDispatchOrch([
      { name: 'w', match: { identifierPrefix: 'REV-' }, stages: twoStages },
    ]);
    const terminalSpy = vi.spyOn(
      orch as unknown as { settleWorkflowTerminal: (...a: unknown[]) => Promise<void> },
      'settleWorkflowTerminal'
    );
    // Make the materialized backend's runner throw by breaking startSession.
    const factory = (
      orch as unknown as { backendFactory: { forUseCase: (...a: unknown[]) => unknown } }
    ).backendFactory;
    vi.spyOn(factory, 'forUseCase').mockImplementation(() => ({
      name: 'boom',
      startSession: async () => {
        throw new Error('startSession blew up');
      },
      stopSession: async () => {},
    }));

    await dispatch(orch, makeIssue({ identifier: 'REV-1' }));
    await vi.waitFor(() => expect(terminalSpy).toHaveBeenCalledTimes(1), { timeout: 5000 });

    const state = (
      orch as unknown as { state: { running: Map<string, unknown>; claimed: Set<string> } }
    ).state;
    expect(state.running.has('issue-1')).toBe(false);
    expect(state.claimed.has('issue-1')).toBe(false);
  });

  it('SC6: a pass-required stage failing both attempts → one terminal + one needs-human', async () => {
    // >= 2 stages so workflowFor selects the plan; the FIRST is pass-required and
    // fails both attempts → terminal before the 2nd stage ever runs.
    const stages = [
      {
        skill: 'gate',
        produces: 'x',
        gate: 'pass-required',
        routingHint: { complexity: verdict('complex') },
      },
      { skill: 'after', produces: 'y', expects: 'x' },
    ];
    orch = new Orchestrator(
      createRoutedConfig([{ name: 'w', match: { identifierPrefix: 'REV-' }, stages }]),
      'Prompt',
      {
        tracker: {
          fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([])),
          fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
          fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
          markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
          claimIssue: vi.fn().mockResolvedValue(Ok(undefined)),
          releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
        } as never,
      }
    );
    const workspacePath = path.join(tmpDir, '.harness', 'workspaces', 'ws');
    vi.spyOn(WorkspaceManager.prototype, 'ensureWorkspace').mockImplementation(async () => {
      fs.mkdirSync(workspacePath, { recursive: true });
      return Ok(workspacePath);
    });
    // Force the runner to always report TurnResult.success=false so the pass-required
    // gate fails on both the attempt-0 and attempt-1 (bumped-floor) runs.
    const factory = (
      orch as unknown as { backendFactory: { forUseCase: (...a: unknown[]) => unknown } }
    ).backendFactory;
    vi.spyOn(factory, 'forUseCase').mockImplementation(
      (_u, opts?: { invocationOverride?: string }) => ({
        name: opts?.invocationOverride ?? 'fast',
        startSession: async () =>
          Ok({ sessionId: 's', workspacePath, backendName: 'x', startedAt: '' }),
        // eslint-disable-next-line require-yield
        async *runTurn() {
          return {
            success: false,
            sessionId: 's',
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
        stopSession: async () => {},
      })
    );
    const terminalSpy = vi.spyOn(
      orch as unknown as { settleWorkflowTerminal: (...a: unknown[]) => Promise<void> },
      'settleWorkflowTerminal'
    );
    const queue = (orch as unknown as { interactionQueue: { push: (i: unknown) => Promise<void> } })
      .interactionQueue;
    const pushSpy = vi.spyOn(queue, 'push');

    await dispatch(orch, makeIssue({ identifier: 'REV-1' }));
    await vi.waitFor(() => expect(terminalSpy).toHaveBeenCalledTimes(1), { timeout: 5000 });

    // Exactly one terminal + exactly one needs-human queued.
    expect(pushSpy).toHaveBeenCalledTimes(1);
    const state = (
      orch as unknown as { state: { running: Map<string, unknown>; claimed: Set<string> } }
    ).state;
    expect(state.running.has('issue-1')).toBe(false);
    expect(state.claimed.has('issue-1')).toBe(false);
  });

  it('SC7: a stage exceeding stageDeadlineMs → treated as failure → terminal', async () => {
    // >= 2 stages so workflowFor selects the plan; the FIRST hangs past the 50ms
    // deadline → stage failure (pass-required) → terminal before stage 2.
    const stages = [
      { skill: 'slow', produces: 'x', gate: 'pass-required' },
      { skill: 'after', produces: 'y', expects: 'x' },
    ];
    orch = makeDispatchOrch([
      { name: 'w', match: { identifierPrefix: 'REV-' }, stages, stageDeadlineMs: 50 },
    ]);
    const workspacePath = path.join(tmpDir, '.harness', 'workspaces', 'ws');
    vi.spyOn(WorkspaceManager.prototype, 'ensureWorkspace').mockImplementation(async () => {
      fs.mkdirSync(workspacePath, { recursive: true });
      return Ok(workspacePath);
    });
    // A runner that never returns within the 50ms deadline (hangs on the first turn).
    const factory = (
      orch as unknown as { backendFactory: { forUseCase: (...a: unknown[]) => unknown } }
    ).backendFactory;
    vi.spyOn(factory, 'forUseCase').mockImplementation(() => ({
      name: 'slow',
      startSession: async () =>
        Ok({ sessionId: 's', workspacePath, backendName: 'slow', startedAt: '' }),
      async *runTurn() {
        // Yield nothing and hang well past the 50ms deadline.
        await new Promise((r) => setTimeout(r, 2000));
        return {
          success: true,
          sessionId: 's',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        };
      },
      stopSession: async () => {},
    }));
    const terminalSpy = vi.spyOn(
      orch as unknown as { settleWorkflowTerminal: (...a: unknown[]) => Promise<void> },
      'settleWorkflowTerminal'
    );

    await dispatch(orch, makeIssue({ identifier: 'REV-1' }));
    await vi.waitFor(() => expect(terminalSpy).toHaveBeenCalledTimes(1), { timeout: 5000 });

    const state = (
      orch as unknown as { state: { running: Map<string, unknown>; claimed: Set<string> } }
    ).state;
    expect(state.running.has('issue-1')).toBe(false);
    expect(state.claimed.has('issue-1')).toBe(false);
  });
});
