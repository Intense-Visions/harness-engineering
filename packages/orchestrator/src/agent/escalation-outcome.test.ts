import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync, type execFile } from 'node:child_process';
import type {
  WorkflowConfig,
  IssueTrackerClient,
  CapabilityTier,
} from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { Orchestrator } from '../orchestrator.js';
import { EscalationState } from './escalation-state.js';
import { MockBackend } from './backends/mock.js';

/**
 * AMR Phase 4 (D10/SC16, Task 9): the quality-outcome → escalation wiring.
 * `emitWorkerExit` feeds ONLY quality outcomes into `AdaptiveRouter.recordOutcome`
 * (keyed on issue.id = coherence unit, at the tier captured at dispatch).
 * Transport/runner failures NEVER reach `recordOutcome` — the shipped per-model
 * breaker owns those (no double-counting).
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

function newOrch(cfg: WorkflowConfig): Orchestrator {
  return new Orchestrator(cfg, 'Prompt', {
    tracker: makeMockTracker(),
    backend: new MockBackend(),
    execFileFn: noopExecFile,
  });
}

/** Policy present ⇒ AdaptiveRouter is live. */
function livePolicyConfig(): WorkflowConfig {
  return makeConfig({
    backends: BACKENDS,
    routing: { ...ROUTING, policy: { budget: { capUsd: 10, onBudgetExhausted: 'degrade' } } },
  });
}

interface QueuedInteraction {
  issueId: string;
  type: string;
  reasons: string[];
  context: { issueTitle: string; issueDescription: string | null };
}

interface OrchInternals {
  adaptiveRouter: {
    recordOutcome: (u: string, t: CapabilityTier, ok: boolean) => void;
    deps: { escalation: EscalationState };
  } | null;
  state: { running: Map<string, { lastRoutedTier?: CapabilityTier }> };
  interactionQueue: { onPush: (fn: (i: QueuedInteraction) => void) => void };
  emitWorkerExit: (
    issueId: string,
    reason: 'normal' | 'error',
    attempt: number | null,
    error?: string,
    outcomeClass?: 'quality-pass' | 'quality-fail' | 'transport' | 'neutral'
  ) => Promise<void>;
}

function internals(orch: Orchestrator): OrchInternals {
  return orch as unknown as OrchInternals;
}

/**
 * `recordAmrOutcome` runs at the TOP of `emitWorkerExit`, before the completion
 * handler / state-machine work. This harness seeds only a minimal running entry,
 * so the downstream `handleWorkerExit` may throw on `reason:'error'`; that is
 * orthogonal to the escalation-wiring assertion under test, so we swallow it.
 */
async function callExitTolerant(
  i: OrchInternals,
  ...args: Parameters<OrchInternals['emitWorkerExit']>
): Promise<void> {
  try {
    await i.emitWorkerExit(...args);
  } catch {
    /* downstream completion-machinery noise, not under test here */
  }
}

function seedRunning(orch: Orchestrator, issueId: string, tier: CapabilityTier): void {
  internals(orch).state.running.set(issueId, {
    issueId,
    identifier: issueId,
    issue: { id: issueId },
    attempt: 1,
    workspacePath: '/tmp/ws',
    startedAt: new Date().toISOString(),
    phase: 'LaunchingAgent',
    session: null,
    lastRoutedTier: tier,
  } as never);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-amr-escoutcome-'));
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

describe('AMR outcome → escalation wiring (D10/SC16, Task 9)', () => {
  it('a quality-fail outcome calls recordOutcome(issue.id, tier, false)', async () => {
    const orch = newOrch(livePolicyConfig());
    const i = internals(orch);
    expect(i.adaptiveRouter).not.toBeNull();
    seedRunning(orch, 'issue-1', 'fast');
    const spy = vi.spyOn(i.adaptiveRouter!, 'recordOutcome');

    await callExitTolerant(i, 'issue-1', 'error', 1, 'gate NOT_SATISFIED', 'quality-fail');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('issue-1', 'fast', false);
  });

  it('a normal (runner) exit is escalation-NEUTRAL — it does NOT call recordOutcome (D10)', async () => {
    // A normal runner exit ≠ quality passed: gates/review/verify run LATER and are
    // the authoritative quality verdict. A premature quality-pass here would clear
    // the unit's in-progress escalation failure count. Only an explicit
    // quality-pass/quality-fail (real quality verdict) may reach EscalationState.
    const orch = newOrch(livePolicyConfig());
    const i = internals(orch);
    seedRunning(orch, 'issue-2', 'standard');
    const spy = vi.spyOn(i.adaptiveRouter!, 'recordOutcome');

    await callExitTolerant(i, 'issue-2', 'normal', 1);

    expect(spy).not.toHaveBeenCalled();
  });

  it('a normal exit does NOT clear a pre-existing escalation failure count (D10 footgun guard)', async () => {
    // Inject an EscalationState carrying a below-threshold in-progress failure for
    // the unit, then take a normal runner exit. The failure count must survive:
    // a premature quality-pass would zero it and mask the accumulating failures.
    const escalation = new EscalationState(2); // threshold 2
    // one quality failure recorded ⇒ in-progress count = 1 (below threshold, no climb yet)
    expect(escalation.recordOutcome('issue-2b', 'fast', false)).toBe('ok');
    expect(escalation.floorFor('issue-2b')).toBe('fast'); // not yet climbed

    const orch = newOrch(livePolicyConfig());
    const i = internals(orch);
    // swap in our seeded escalation state so the count is observable
    (i.adaptiveRouter as unknown as { deps: { escalation: EscalationState } }).deps.escalation =
      escalation;
    seedRunning(orch, 'issue-2b', 'fast');

    await callExitTolerant(i, 'issue-2b', 'normal', 1);

    // The pre-existing failure count is intact: the NEXT quality failure crosses the
    // threshold and climbs. Had the normal exit cleared it, this would still be 'ok'.
    expect(escalation.recordOutcome('issue-2b', 'fast', false)).toBe('escalated');
    expect(escalation.floorFor('issue-2b')).toBe('standard');
  });

  it('a transport error (default for reason=error) does NOT call recordOutcome (breaker owns it)', async () => {
    const orch = newOrch(livePolicyConfig());
    const i = internals(orch);
    seedRunning(orch, 'issue-3', 'fast');
    const spy = vi.spyOn(i.adaptiveRouter!, 'recordOutcome');

    await callExitTolerant(i, 'issue-3', 'error', 1, 'spawn ENOENT'); // no outcomeClass ⇒ transport

    expect(spy).not.toHaveBeenCalled();
  });

  it('never touches recordOutcome when the dispatch was not AMR-routed (no lastRoutedTier)', async () => {
    const orch = newOrch(livePolicyConfig());
    const i = internals(orch);
    // running entry present but NO lastRoutedTier (override/no-policy dispatch)
    internals(orch).state.running.set('issue-4', {
      issueId: 'issue-4',
      identifier: 'issue-4',
      issue: { id: 'issue-4' },
      attempt: 1,
      workspacePath: '/tmp/ws',
      startedAt: new Date().toISOString(),
      phase: 'LaunchingAgent',
      session: null,
    } as never);
    const spy = vi.spyOn(i.adaptiveRouter!, 'recordOutcome');

    await callExitTolerant(i, 'issue-4', 'normal', 1);

    expect(spy).not.toHaveBeenCalled();
  });
});

/**
 * D10 hard-fail-to-human (final-review + Phase-4-review, item 1). When a
 * coherence unit's escalation floor is ALREADY `strong` and a quality failure
 * re-crosses the threshold, `recordOutcome` returns `'exhausted'` and the router
 * fires `onExhausted`. Per spec D10 the task must HARD-FAIL TO A HUMAN — not just
 * log — so `onExhausted` queues a `needs-human` interaction carrying the
 * coherence unit + reason via the SAME mechanism as every other escalation.
 */
describe('AMR escalation-exhausted → needs-human (D10, item 1)', () => {
  /** Force the unit to the strong ceiling with a threshold-crossing failure pending. */
  function seedExhaustedNextFail(orch: Orchestrator, unit: string): void {
    const escalation = (
      internals(orch).adaptiveRouter as unknown as { deps: { escalation: EscalationState } }
    ).deps.escalation;
    // climb fast→standard→strong (threshold 2 ⇒ two fails per step), landing at strong
    for (let n = 0; n < 4; n++) escalation.recordOutcome(unit, 'fast', false);
    expect(escalation.floorFor(unit)).toBe('strong');
    // one more below-threshold failure so the NEXT quality-fail returns 'exhausted'
    expect(escalation.recordOutcome(unit, 'strong', false)).toBe('ok');
  }

  it('queues a needs-human interaction (not just a log) when the strong ceiling re-crosses the threshold', async () => {
    const orch = newOrch(livePolicyConfig());
    const i = internals(orch);
    expect(i.adaptiveRouter).not.toBeNull();

    const queued: QueuedInteraction[] = [];
    i.interactionQueue.onPush((interaction) => queued.push(interaction));

    seedRunning(orch, 'issue-exh', 'strong');
    seedExhaustedNextFail(orch, 'issue-exh');

    // the threshold-crossing quality failure at the strong ceiling ⇒ 'exhausted' ⇒ onExhausted
    await callExitTolerant(i, 'issue-exh', 'error', 1, 'gate NOT_SATISFIED', 'quality-fail');

    // onExhausted fires the queue push fire-and-forget (async fs I/O); poll briefly
    for (let n = 0; n < 50 && queued.filter((q) => q.issueId === 'issue-exh').length === 0; n++) {
      await new Promise((r) => setTimeout(r, 5));
    }

    const escalations = queued.filter((q) => q.issueId === 'issue-exh');
    expect(escalations.length).toBeGreaterThanOrEqual(1);
    const esc = escalations[escalations.length - 1]!;
    expect(esc.type).toBe('needs-human');
    expect(esc.reasons.join(' ')).toMatch(/escalation-exhausted|strong/i);
  });

  it('a below-ceiling climb (escalated, not exhausted) does NOT hard-fail to a human', async () => {
    const orch = newOrch(livePolicyConfig());
    const i = internals(orch);

    const queued: QueuedInteraction[] = [];
    i.interactionQueue.onPush((interaction) => queued.push(interaction));

    seedRunning(orch, 'issue-climb', 'fast');
    // threshold 2: two quality-fails climb fast→standard ('escalated', not 'exhausted')
    await callExitTolerant(i, 'issue-climb', 'error', 1, 'gate NOT_SATISFIED', 'quality-fail');
    await callExitTolerant(i, 'issue-climb', 'error', 1, 'gate NOT_SATISFIED', 'quality-fail');
    // give any (erroneous) fire-and-forget push time to land before asserting none did
    await new Promise((r) => setTimeout(r, 30));

    expect(queued.filter((q) => q.issueId === 'issue-climb')).toHaveLength(0);
    expect(i.adaptiveRouter!.deps.escalation.floorFor('issue-climb')).toBe('standard');
  });
});
