import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync, type execFile } from 'node:child_process';
import type { WorkflowConfig, IssueTrackerClient } from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { Orchestrator } from './orchestrator.js';
import { MockBackend } from './agent/backends/mock.js';

/**
 * AMR Phase 5 (D1/D5): runtime routing-policy ingestion at the orchestrator
 * level — `ingestRoutingPolicy` hot-swaps `adaptiveRouter` with the correct
 * null / setPolicy / construct branch, and `getRoutingTelemetry` projects.
 *   SC1 — an existing router is UPDATED in place (same instance ⇒ EscalationState
 *         preserved), not reconstructed.
 *   SC2 — an empty {} policy restores default-off (adaptiveRouter = null).
 *   D5  — pushing a policy onto a from-null orchestrator constructs a router.
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

const withPolicy = (): WorkflowConfig =>
  makeConfig({
    backends: BACKENDS,
    routing: {
      default: 'strong',
      policy: { budget: { capUsd: 10, onBudgetExhausted: 'degrade' } },
    },
  });
const withoutPolicy = (): WorkflowConfig =>
  makeConfig({ backends: BACKENDS, routing: { default: 'strong' } });

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-amr-ingest-'));
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

describe('Orchestrator.ingestRoutingPolicy', () => {
  it('SC1: updates an existing router IN PLACE (same instance ⇒ escalation preserved)', () => {
    const orch = newOrch(withPolicy());
    const before = orch.getAdaptiveRouter();
    expect(before).not.toBeNull();

    orch.ingestRoutingPolicy({
      privacyFloor: 'on-device',
      budget: { capUsd: 20, onBudgetExhausted: 'pause' },
    });

    const after = orch.getAdaptiveRouter();
    expect(after).not.toBeNull();
    // Same instance ⇒ setPolicy path, not reconstruct ⇒ EscalationState kept.
    expect(after).toBe(before);
  });

  it('SC2/D5: an empty {} policy restores default-off (adaptiveRouter = null)', () => {
    const orch = newOrch(withPolicy());
    expect(orch.getAdaptiveRouter()).not.toBeNull();

    orch.ingestRoutingPolicy({});
    expect(orch.getAdaptiveRouter()).toBeNull();
  });

  it('D5: pushing a non-empty policy onto an off orchestrator CONSTRUCTS a router', () => {
    const orch = newOrch(withoutPolicy());
    expect(orch.getAdaptiveRouter()).toBeNull(); // default-off

    orch.ingestRoutingPolicy({ allowedProviders: ['mock'] });
    expect(orch.getAdaptiveRouter()).not.toBeNull();
  });

  it('reconstructs (new instance) when re-enabled after being turned off', () => {
    const orch = newOrch(withPolicy());
    const first = orch.getAdaptiveRouter();

    orch.ingestRoutingPolicy({}); // off
    expect(orch.getAdaptiveRouter()).toBeNull();

    orch.ingestRoutingPolicy({ budget: { capUsd: 5, onBudgetExhausted: 'degrade' } }); // on
    const third = orch.getAdaptiveRouter();
    expect(third).not.toBeNull();
    expect(third).not.toBe(first); // a fresh construction after off
  });

  it('getRoutingTelemetry returns an empty payload when routing is off', () => {
    const orch = newOrch(withoutPolicy());
    expect(orch.getRoutingTelemetry()).toEqual({ decisions: [], spentUsd: 0 });
  });
});
