import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync, type execFile } from 'node:child_process';
import type {
  WorkflowConfig,
  IssueTrackerClient,
  RoutingUseCase,
} from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { Orchestrator } from '../orchestrator.js';
import { MockBackend } from './backends/mock.js';
import { BackendRouter } from './backend-router.js';

/**
 * Inline no-op `execFile` (mirrors tests/helpers/noop-exec-file). Kept local so
 * this `src/`-rooted test never imports across the tsconfig rootDir boundary.
 * Prevents PRDetector from shelling out to `gh`; promisify() resolves 0 open PRs.
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

/**
 * AMR Phase 3 (D11 / SC8 / SC17 / SC19): the default-off adopter-portability
 * guarantee. With NO `routing.policy`, the orchestrator must NOT construct an
 * `AdaptiveRouter`, `classify()` must never run, and dispatch resolution must be
 * BYTE-IDENTICAL to the shipped `BackendRouter`.
 */

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

function getAdaptiveRouter(orch: Orchestrator): unknown {
  return (orch as unknown as { getAdaptiveRouter: () => unknown }).getAdaptiveRouter();
}

// A representative spread of use cases spanning every resolution path.
const USE_CASES: RoutingUseCase[] = [
  { kind: 'tier', tier: 'quick-fix' },
  { kind: 'tier', tier: 'guided-change' },
  { kind: 'tier', tier: 'full-exploration' },
  { kind: 'tier', tier: 'diagnostic' },
  { kind: 'intelligence', layer: 'sel' },
  { kind: 'maintenance' },
  { kind: 'chat' },
];

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

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-amr-defaultoff-'));
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
    /* best-effort cleanup */
  }
});

describe('AMR default-off gate (D11/SC8/SC17/SC19)', () => {
  it('no routing.policy ⇒ AdaptiveRouter is NOT constructed', () => {
    const orch = newOrch(makeConfig({ backends: BACKENDS, routing: ROUTING }));
    expect(getAdaptiveRouter(orch)).toBeNull();
  });

  it('empty routing.policy {} ⇒ AdaptiveRouter is NOT constructed (D11: present AND non-empty)', () => {
    const orch = newOrch(makeConfig({ backends: BACKENDS, routing: { ...ROUTING, policy: {} } }));
    expect(getAdaptiveRouter(orch)).toBeNull();
  });

  it('non-empty routing.policy ⇒ AdaptiveRouter IS constructed', () => {
    const orch = newOrch(
      makeConfig({
        backends: BACKENDS,
        routing: { ...ROUTING, policy: { budget: { capUsd: 10, onBudgetExhausted: 'degrade' } } },
      })
    );
    expect(getAdaptiveRouter(orch)).not.toBeNull();
  });

  it('no policy ⇒ dispatch resolution is BYTE-IDENTICAL to a bare BackendRouter (SC8/SC19)', () => {
    const orch = newOrch(makeConfig({ backends: BACKENDS, routing: ROUTING }));
    const factoryRouter = (
      orch as unknown as { getBackendRouter(): BackendRouter | null }
    ).getBackendRouter();
    expect(factoryRouter).not.toBeNull();

    const bare = new BackendRouter({ backends: BACKENDS, routing: ROUTING });

    for (const useCase of USE_CASES) {
      const viaOrch = factoryRouter!.resolve(useCase);
      const viaBare = bare.resolve(useCase);
      expect({
        backendName: viaOrch.backendName,
        backendType: viaOrch.backendType,
        resolutionPath: viaOrch.resolutionPath,
      }).toEqual({
        backendName: viaBare.backendName,
        backendType: viaBare.backendType,
        resolutionPath: viaBare.resolutionPath,
      });
    }
  });

  it('no policy ⇒ classify() can never run (no AdaptiveRouter exists to call it) (SC17)', () => {
    // SC17: with no policy, the AdaptiveRouter — and therefore the classify seam
    // it owns — is never constructed. There is no code path on which classify()
    // could be invoked. Proven structurally: the accessor is null, so dispatch
    // routes through the raw BackendRouter with zero complexity/cost telemetry.
    const orch = newOrch(makeConfig({ backends: BACKENDS, routing: ROUTING }));
    expect(getAdaptiveRouter(orch)).toBeNull();
  });
});
