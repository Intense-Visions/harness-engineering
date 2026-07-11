import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync, type execFile } from 'node:child_process';
import type { WorkflowConfig, IssueTrackerClient } from '@harness-engineering/types';
import { Ok, RoutingError } from '@harness-engineering/types';
import { Orchestrator } from '../orchestrator.js';
import { MockBackend } from './backends/mock.js';
import { PrivacyNoMatch } from './capability-registry.js';

/**
 * AMR finding #3 — PrivacyNoMatch → real steward signal at the dispatch boundary.
 * When `AdaptiveRouter.route()` throws `PrivacyNoMatch` (privacy/allowlist
 * fail-closed), the dispatch boundary must:
 *   1. emit a DISTINCT `routing:no-tier-match` steward escalation (needs-human),
 *   2. NOT record it as a generic transport/dispatch failure (no escalation feed),
 *   3. preserve fail-closed (never dispatch to a non-compliant backend).
 * A non-routing error must still fall through to the generic dispatch-error path.
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
    routing: { ...ROUTING, policy: { budget: { capUsd: 10, onBudgetExhausted: 'degrade' } } },
  });
}

function newOrch(cfg: WorkflowConfig): Orchestrator {
  return new Orchestrator(cfg, 'Prompt', {
    tracker: makeMockTracker(),
    backend: new MockBackend(),
    execFileFn: noopExecFile,
  });
}

interface QueuedInteraction {
  issueId: string;
  type: string;
  reasons: string[];
  context: { issueTitle: string; issueDescription: string | null };
}

interface OrchInternals {
  adaptiveRouter: { recordOutcome: (...a: unknown[]) => void } | null;
  interactionQueue: { onPush: (fn: (i: QueuedInteraction) => void) => void };
  handleRoutingFailure: (issue: { id: string; identifier?: string }, error: unknown) => boolean;
}

function internals(orch: Orchestrator): OrchInternals {
  return orch as unknown as OrchInternals;
}

const ISSUE = {
  id: 'issue-privacy',
  identifier: 'ISS-privacy',
  title: 'A vision task requiring an on-device backend',
  description: 'Needs a privacy-floored backend that is not available.',
} as unknown as { id: string; identifier?: string };

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-amr-privacy-'));
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

async function collectPushes(i: OrchInternals): Promise<QueuedInteraction[]> {
  const queued: QueuedInteraction[] = [];
  i.interactionQueue.onPush((interaction) => queued.push(interaction));
  return queued;
}

describe('PrivacyNoMatch → routing:no-tier-match steward escalation (finding #3)', () => {
  it('a PrivacyNoMatch at the dispatch boundary queues a needs-human routing:no-tier-match (not transport)', async () => {
    const orch = newOrch(livePolicyConfig());
    const i = internals(orch);
    expect(i.adaptiveRouter).not.toBeNull();
    const recordSpy = vi.spyOn(i.adaptiveRouter!, 'recordOutcome');
    const queued = await collectPushes(i);

    const handled = i.handleRoutingFailure(ISSUE, new PrivacyNoMatch('no compliant backend'));

    expect(handled).toBe(true); // boundary claimed it — the generic transport path must NOT also run
    for (let n = 0; n < 50 && queued.filter((q) => q.issueId === ISSUE.id).length === 0; n++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    const escs = queued.filter((q) => q.issueId === ISSUE.id);
    expect(escs).toHaveLength(1);
    expect(escs[0]!.type).toBe('needs-human');
    expect(escs[0]!.reasons.join(' ')).toMatch(/no-tier-match|privacy-no-match/);
    // carries the coherenceUnit context
    expect(escs[0]!.context.issueTitle).toBe(ISSUE['title' as keyof typeof ISSUE]);
    // fail-closed: NEVER feeds escalation / never recorded as a quality|transport outcome
    expect(recordSpy).not.toHaveBeenCalled();
  });

  it('accepts a RoutingError(privacy-no-match) too (unified error family, finding #4)', async () => {
    const orch = newOrch(livePolicyConfig());
    const i = internals(orch);
    const queued = await collectPushes(i);

    const handled = i.handleRoutingFailure(
      ISSUE,
      new RoutingError('privacy-no-match', 'allowlist emptied the set')
    );

    expect(handled).toBe(true);
    for (let n = 0; n < 50 && queued.filter((q) => q.issueId === ISSUE.id).length === 0; n++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(queued.filter((q) => q.issueId === ISSUE.id)).toHaveLength(1);
  });

  it('a non-routing error is NOT claimed by the boundary (falls through to the transport path)', async () => {
    const orch = newOrch(livePolicyConfig());
    const i = internals(orch);
    const queued = await collectPushes(i);

    const handled = i.handleRoutingFailure(ISSUE, new Error('spawn ENOENT'));

    expect(handled).toBe(false); // generic dispatch-error path (transport) still owns it
    await new Promise((r) => setTimeout(r, 20));
    expect(queued.filter((q) => q.issueId === ISSUE.id)).toHaveLength(0);
  });

  it('an escalation-exhausted RoutingError is NOT a dispatch-boundary privacy failure', async () => {
    // escalation-exhausted is handled by the onExhausted seam (item 1), not here.
    const orch = newOrch(livePolicyConfig());
    const i = internals(orch);
    const handled = i.handleRoutingFailure(
      ISSUE,
      new RoutingError('escalation-exhausted', 'ceiling re-crossed')
    );
    expect(handled).toBe(false);
  });
});
