import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Issue } from '@harness-engineering/types';
import type { EnrichedSpec } from '@harness-engineering/intelligence';
import { IntelligencePipelineRunner, type TickActivityCallback } from './pipeline-runner';
import type { OrchestratorContext } from '../types/orchestrator-context';

/**
 * Observable-contract coverage for `IntelligencePipelineRunner`.
 *
 * The runner orchestrates enrichment / scoring / simulation / archiving /
 * publishing. These tests pin the OUTPUT CONTRACT of `run()` and the
 * no-op guarantees of `loadPersistedData()` using a minimal fake context
 * (pipeline and graph store absent), rather than reaching into private
 * helpers. A real temp `projectRoot` is used so tracker-config lookup finds
 * nothing on disk and auto-publish short-circuits.
 */

interface Harness {
  ctx: OrchestratorContext;
  tick: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  enrichedSpecsByIssue: Map<string, EnrichedSpec>;
  analysisFailureCache: Map<string, number>;
  cleanup(): void;
}

function makeHarness(): Harness {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-'));
  const enrichedSpecsByIssue = new Map<string, EnrichedSpec>();
  const analysisFailureCache = new Map<string, number>();
  const save = vi.fn().mockResolvedValue(undefined);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

  const ctx = {
    config: { agent: {}, workspace: { root: path.join(projectRoot, '.harness', 'workspaces') } },
    projectRoot,
    logger,
    pipeline: null,
    graphStore: null,
    analysisArchive: { list: vi.fn().mockResolvedValue([]), save },
    enrichedSpecsByIssue,
    analysisFailureCache,
  } as unknown as OrchestratorContext;

  return {
    ctx,
    tick: vi.fn(),
    save,
    enrichedSpecsByIssue,
    analysisFailureCache,
    cleanup: () => fs.rmSync(projectRoot, { recursive: true, force: true }),
  };
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'ISSUE-1',
    identifier: 'CORE-1',
    title: 'A thing',
    description: null,
    priority: null,
    state: 'open',
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    spec: null,
    plans: [],
    ...overrides,
  } as Issue;
}

let h: Harness;
beforeEach(() => {
  h = makeHarness();
});
afterEach(() => {
  h.cleanup();
  vi.clearAllMocks();
});

describe('IntelligencePipelineRunner.run — output contract', () => {
  it('returns the five result maps, all empty, for no candidates', async () => {
    const runner = new IntelligencePipelineRunner(h.ctx);
    const result = await runner.run([], h.tick as unknown as TickActivityCallback);

    expect(result.concernSignals.size).toBe(0);
    expect(result.enrichedSpecs.size).toBe(0);
    expect(result.complexityScores.size).toBe(0);
    expect(result.simulationResults.size).toBe(0);
    expect(result.personaRecommendations.size).toBe(0);
  });

  it('drives the activity callback through the analyzing phase', async () => {
    const runner = new IntelligencePipelineRunner(h.ctx);
    await runner.run([], h.tick as unknown as TickActivityCallback);

    const phases = h.tick.mock.calls.map((c) => c[0]);
    expect(phases).toContain('analyzing');
    // The PESL / archive / publish / persona steps each announce themselves.
    const details = h.tick.mock.calls.map((c) => c[1]);
    expect(details).toContain('PESL: Running simulations');
    expect(details).toContain('Archiving analysis results');
  });

  it('seeds the returned enrichedSpecs from the pre-existing cache', async () => {
    const cachedSpec = { unknowns: [], ambiguities: [] } as unknown as EnrichedSpec;
    h.enrichedSpecsByIssue.set('ISSUE-1', cachedSpec);

    const runner = new IntelligencePipelineRunner(h.ctx);
    const result = await runner.run([], h.tick as unknown as TickActivityCallback);

    expect(result.enrichedSpecs.get('ISSUE-1')).toBe(cachedSpec);
  });

  it('does not invoke the (absent) pipeline for an already-cached candidate', async () => {
    // A candidate whose spec is cached is filtered out of analysis, so the
    // null pipeline is never dereferenced — run resolves without throwing.
    const cachedSpec = { unknowns: [], ambiguities: [] } as unknown as EnrichedSpec;
    h.enrichedSpecsByIssue.set('ISSUE-1', cachedSpec);

    const runner = new IntelligencePipelineRunner(h.ctx);
    const result = await runner.run(
      [makeIssue({ id: 'ISSUE-1' })],
      h.tick as unknown as TickActivityCallback
    );

    // Cached spec still surfaces, and its analysis is archived.
    expect(result.enrichedSpecs.get('ISSUE-1')).toBe(cachedSpec);
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.save.mock.calls[0]![0]).toMatchObject({ issueId: 'ISSUE-1', identifier: 'CORE-1' });
  });

  it('evicts expired entries from the analysis failure cache before analyzing', async () => {
    // An old failure (well past the default 300s TTL) is dropped on the next run.
    h.analysisFailureCache.set('STALE', Date.now() - 10 * 60_000);
    const runner = new IntelligencePipelineRunner(h.ctx);
    await runner.run([], h.tick as unknown as TickActivityCallback);
    expect(h.analysisFailureCache.has('STALE')).toBe(false);
  });
});

describe('IntelligencePipelineRunner.loadPersistedData — guards', () => {
  it('is a no-op (resolves without throwing) when pipeline and graph store are absent', async () => {
    const runner = new IntelligencePipelineRunner(h.ctx);
    await expect(runner.loadPersistedData()).resolves.toBeUndefined();
  });
});
