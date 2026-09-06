import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { Orchestrator } from '../../src/orchestrator';
import { MockBackend } from '../../src/agent/backends/mock';
import {
  loadFrozenCandidates,
  selectCandidates,
  type FrozenCandidate,
  type RankerCandidate,
} from '@harness-engineering/local-models';
import type {
  WorkflowConfig,
  IssueTrackerClient,
  LocalModelsConfig,
} from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { noopExecFile } from '../helpers/noop-exec-file';

// bug-fleet A5 (orchestrator.ts): `buildHarnessFitDeps` binds the harness-fit
// re-ranker with `createBuildQualityReRanker(this.recommenderCandidates, …)` —
// capturing the candidate ARRAY at build time. The tick's primary `recommend` is
// deliberately LATE-bound (`() => this.modelRecommender!(hardware)`) so a re-seed
// takes effect; the re-ranker is not. `initLocalModelAndPipeline` runs
// `startRefreshScheduler()` (which seeds FROZEN and builds these deps once) and
// only THEN kicks off `refreshCandidatesLive()`, so in production the harness-fit
// re-rank permanently ranks the bundled frozen snapshot while the tick and
// `GET /recommendations` rank the live HuggingFace set. `seedRecommender` keeps
// `recommenderCandidates` updated on every re-seed expressly for this consumer
// ("Hold the candidate set so the harness-fit re-rank can re-run the SAME ranking
// path over it") — but the consumer never re-reads it.

let tmpDir: string;

const POOL_CFG = { diskBudgetGb: 100, allowedOrgs: ['Qwen'], allowedFamilies: [] };

// Two allow-listed live candidates (mirrors the shape the discovery seam returns).
const LIVE_CANDIDATES: FrozenCandidate[] = [
  {
    hfRepoId: 'Qwen/Qwen3-4B-GGUF',
    ollamaName: 'qwen3:4b',
    family: 'qwen3',
    sizeB: 4,
    quant: 'Q4_K_M',
  },
  {
    hfRepoId: 'Qwen/Qwen3-1.7B-GGUF',
    ollamaName: 'qwen3:1.7b',
    family: 'qwen3',
    sizeB: 1.7,
    quant: 'Q4_K_M',
  },
];

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

function localModelsWithHarnessFit(): LocalModelsConfig {
  return {
    enabled: true,
    pool: POOL_CFG,
    refresh: { intervalMs: 86_400_000, proposalThreshold: 5, jitterMs: 600_000 },
    installer: { backend: 'ollama', ollamaEndpoint: 'http://localhost:11434' },
    hardware: { override: { platform: 'macos', vramGb: 48, bandwidthGbps: 400 } },
    harnessFit: {
      enabled: true,
      topN: 3,
      cadenceMs: 604_800_000,
      cacheTtlMs: 2_592_000_000,
    },
  } as unknown as LocalModelsConfig;
}

function makeConfig(localModels: LocalModelsConfig): WorkflowConfig {
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
  config.localModels = localModels;
  return config;
}

// ── structural access to the private seams (same pattern as
//    tests/integration/orchestrator-model-pool.test.ts) ─────────────────────────

type ReRank = (
  hardware: unknown,
  byKey: ReadonlyMap<string, number>
) => Promise<{ ranked: Array<{ hfRepoId: string }> }>;

function seedRecommenderOf(
  orch: Orchestrator
): (candidates: readonly FrozenCandidate[], source: 'frozen' | 'live') => void {
  return (
    orch as unknown as {
      seedRecommender(c: readonly FrozenCandidate[], s: 'frozen' | 'live'): void;
    }
  ).seedRecommender.bind(orch);
}

function buildHarnessFitDepsOf(
  orch: Orchestrator
): (
  endpoint: string | undefined,
  apiKey: string | undefined
) => { reRankWithBuildQuality: ReRank } {
  return (
    orch as unknown as {
      buildHarnessFitDeps(
        e: string | undefined,
        k: string | undefined
      ): { reRankWithBuildQuality: ReRank };
    }
  ).buildHarnessFitDeps.bind(orch);
}

function refreshLiveOf(orch: Orchestrator): () => Promise<{ source: string; count: number }> {
  return (
    orch as unknown as {
      refreshCandidatesLive(): Promise<{ source: 'frozen' | 'live'; count: number }>;
    }
  ).refreshCandidatesLive.bind(orch);
}

function heldCandidatesOf(orch: Orchestrator): readonly RankerCandidate[] {
  return (orch as unknown as { recommenderCandidates: readonly RankerCandidate[] })
    .recommenderCandidates;
}

function recommenderOf(
  orch: Orchestrator
): (hw: unknown) => Promise<{ ranked: Array<{ hfRepoId: string }> }> {
  return (
    orch as unknown as {
      modelRecommender: (hw: unknown) => Promise<{ ranked: Array<{ hfRepoId: string }> }>;
    }
  ).modelRecommender;
}

function detectHardwareOf(orch: Orchestrator): () => Promise<unknown> {
  return (orch as unknown as { detectLmlmHardware(): Promise<unknown> }).detectLmlmHardware.bind(
    orch
  );
}

const repos = (r: { ranked: Array<{ hfRepoId: string }> }): string[] =>
  r.ranked.map((c) => c.hfRepoId).sort();

describe('harness-fit re-ranker vs a live candidate re-seed', () => {
  let orch: Orchestrator;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-bf-a5-fit-'));
    execSync(
      'git init && git config user.email "test@test" && git config user.name "test" && git commit --allow-empty -m "init"',
      { cwd: tmpDir, stdio: 'ignore' }
    );
    fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });
    orch = new Orchestrator(makeConfig(localModelsWithHarnessFit()), 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
      discoverCandidates: async () => ({ candidates: LIVE_CANDIDATES, warnings: [] }),
    });
  });

  afterEach(async () => {
    await orch.stop();
    vi.restoreAllMocks();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  it('re-ranks the CURRENT candidate set, not the set held when the deps were built', async () => {
    // 1. What `startRefreshScheduler()` does first: seed the recommender from the
    //    bundled frozen snapshot, then build the harness-fit deps bundle ONCE.
    const frozen = selectCandidates(loadFrozenCandidates().candidates, POOL_CFG);
    expect(frozen.length).toBeGreaterThan(0);
    seedRecommenderOf(orch)(frozen, 'frozen');
    const deps = buildHarnessFitDepsOf(orch)('http://127.0.0.1:11434/v1', undefined);

    // 2. What `initLocalModelAndPipeline()` does NEXT: the startup live refresh
    //    swaps in a fresh recommender over the discovered candidate set.
    const refreshed = await refreshLiveOf(orch)();
    expect(refreshed).toEqual({ source: 'live', count: 2 });
    expect(
      heldCandidatesOf(orch)
        .map((c) => c.hfRepoId)
        .sort()
    ).toEqual(['Qwen/Qwen3-1.7B-GGUF', 'Qwen/Qwen3-4B-GGUF']);

    const hardware = await detectHardwareOf(orch)();

    // The tick's primary `recommend` is late-bound, so it ranks the LIVE set.
    const primary = await recommenderOf(orch)(hardware);
    expect(repos(primary)).toEqual(['Qwen/Qwen3-1.7B-GGUF', 'Qwen/Qwen3-4B-GGUF']);

    // The harness-fit re-rank must stay on the SAME ranking path over the SAME
    // candidate set — that is the whole point of holding `recommenderCandidates`.
    const reranked = await deps.reRankWithBuildQuality(hardware, new Map());
    expect(repos(reranked)).toEqual(repos(primary));
  }, 30000);
});
