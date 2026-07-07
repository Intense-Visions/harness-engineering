import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { Orchestrator } from '../../src/orchestrator';
import { MockBackend } from '../../src/agent/backends/mock';
import { PoolManager } from '@harness-engineering/local-models';
import type {
  WorkflowConfig,
  IssueTrackerClient,
  LocalModelsConfig,
} from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { noopExecFile } from '../helpers/noop-exec-file';

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
  };
}

function makeConfig(localModels?: LocalModelsConfig): WorkflowConfig {
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
  } as unknown as WorkflowConfig & { localModels?: LocalModelsConfig };
  if (localModels) config.localModels = localModels;
  return config;
}

function makeOrchestrator(config: WorkflowConfig): Orchestrator {
  return new Orchestrator(config, 'Prompt', {
    tracker: makeMockTracker(),
    backend: new MockBackend(),
    execFileFn: noopExecFile,
  });
}

/** Test-only: TypeScript private fields are structurally accessible at runtime. */
function modelPoolOf(orch: Orchestrator): PoolManager | null {
  return (orch as unknown as { modelPool: PoolManager | null }).modelPool;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-orch-pool-'));
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

describe('Orchestrator LMLM Phase 6 — live PoolManager (Task 14)', () => {
  it('constructs a PoolManager reachable via modelPool when localModels.enabled', () => {
    const orch = makeOrchestrator(makeConfig(localModelsConfig()));
    const pool = modelPoolOf(orch);
    expect(pool).not.toBeNull();
    expect(pool).toBeInstanceOf(PoolManager);
  });

  it('leaves modelPool null when localModels is absent (LMLM disabled, N4/N9)', () => {
    const orch = makeOrchestrator(makeConfig());
    expect(modelPoolOf(orch)).toBeNull();
  });

  it('leaves modelPool null when localModels.enabled is false', () => {
    const orch = makeOrchestrator(makeConfig({ ...localModelsConfig(), enabled: false }));
    expect(modelPoolOf(orch)).toBeNull();
  });
});
