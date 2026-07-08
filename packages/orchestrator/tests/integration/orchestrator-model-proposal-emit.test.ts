import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import * as localModels from '@harness-engineering/local-models';
import { RefreshScheduler } from '@harness-engineering/local-models';
import type { ModelProposalContent, TickResult } from '@harness-engineering/local-models';
import { Orchestrator } from '../../src/orchestrator';
import { MockBackend } from '../../src/agent/backends/mock';
import type {
  WorkflowConfig,
  IssueTrackerClient,
  LocalModelsConfig,
} from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { noopExecFile } from '../helpers/noop-exec-file';

// Phase 7 Task 6: the background scheduler's `emitProposal` seam persists a
// proposal then emits `local-models:proposal { status: 'created' }` on the bus.
// The native recommender ships with an empty candidate set (Phase 2 gap), so a
// real tick never crosses the proposal threshold. We mock ONLY `runRefreshTick`
// (spreading the rest of the package so PoolManager/RefreshScheduler stay real)
// to drive `deps.emitProposal(...)` deterministically. Scoped to this file so
// the reconcile-driven Phase 6 lifecycle tests keep the real tick.
vi.mock('@harness-engineering/local-models', async (importActual) => {
  const actual = await importActual<typeof import('@harness-engineering/local-models')>();
  return { ...actual, runRefreshTick: vi.fn() };
});

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

function localModelsConfig(): LocalModelsConfig {
  return {
    enabled: true,
    pool: { diskBudgetGb: 100, allowedOrgs: ['Qwen'], allowedFamilies: [] },
    refresh: { intervalMs: 86_400_000, proposalThreshold: 5, jitterMs: 600_000 },
    installer: { backend: 'ollama', ollamaEndpoint: 'http://localhost:11434' },
    hardware: { override: { platform: 'macos', vramGb: 48, bandwidthGbps: 400 } },
  };
}

function makeConfig(): WorkflowConfig {
  const config = {
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
    localModels: localModelsConfig(),
  } as unknown as WorkflowConfig;
  return config;
}

const noopTimer = {
  setTimer: (): { unref(): void } => ({ unref() {} }),
  clearTimer: (): void => {},
};

function schedulerOf(orch: Orchestrator): RefreshScheduler | null {
  return (orch as unknown as { refreshScheduler: RefreshScheduler | null }).refreshScheduler;
}

function initPipeline(orch: Orchestrator): Promise<void> {
  return (
    orch as unknown as { initLocalModelAndPipeline(): Promise<void> }
  ).initLocalModelAndPipeline();
}

const PROPOSAL_CONTENT: ModelProposalContent = {
  action: 'add',
  target: { hfRepoId: 'Qwen/Qwen3-32B-GGUF', ollamaName: 'qwen3:32b' },
  scoreDelta: 8.1,
  justification: {
    summary: 'A newer model beats the current pool member.',
    benchmarkBasis: ['mmlu'],
    hardwareFit: '27GB',
    evidence: 'direct',
    freshness: '2026-05-21',
  },
  diskImpactGb: 3.2,
};

const TICK_RESULT: TickResult = {
  candidatesEvaluated: 1,
  proposalsEmitted: 1,
  reconciledRemoved: [],
  snapshotLoaded: true,
  hfReachable: true,
  warnings: [],
  errors: [],
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-orch-emit-'));
  execSync(
    'git init && git config user.email "test@test" && git config user.name "test" && git commit --allow-empty -m "init"',
    { cwd: tmpDir, stdio: 'ignore' }
  );
  fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });
});

afterEach(() => {
  vi.mocked(localModels.runRefreshTick).mockReset();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

describe('Orchestrator LMLM Phase 7 — scheduler emits local-models:proposal (Task 6)', () => {
  it('emits { status: created } on the bus after a tick creates a proposal', async () => {
    // Drive the emitProposal seam that the orchestrator wired into runRefreshTick.
    vi.mocked(localModels.runRefreshTick).mockImplementation(
      async (deps: Parameters<typeof localModels.runRefreshTick>[0]): Promise<TickResult> => {
        await deps.emitProposal(PROPOSAL_CONTENT);
        return TICK_RESULT;
      }
    );

    const orch = new Orchestrator(makeConfig(), 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
      schedulerTimer: noopTimer,
    });

    const emitted: unknown[] = [];
    orch.on('local-models:proposal', (d) => emitted.push(d));

    await initPipeline(orch);
    await schedulerOf(orch)!.forceRefresh();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual(
      expect.objectContaining({
        status: 'created',
        action: 'add',
        target: 'qwen3:32b',
      })
    );
    // The id comes from the persisted record, so it is a non-empty string.
    expect((emitted[0] as { id: string }).id).toMatch(/.+/);

    await orch.stop();
  });
});
