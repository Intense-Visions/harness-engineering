import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Issue } from '@harness-engineering/types';
import type { EnrichedSpec } from '@harness-engineering/intelligence';
import { IntelligencePipelineRunner, type TickActivityCallback } from './pipeline-runner';
import type { OrchestratorContext } from '../types/orchestrator-context';

/**
 * Behavior coverage for `IntelligencePipelineRunner` that exercises the code
 * paths the co-located `pipeline-runner.test.ts` leaves uncovered: candidate
 * analysis via an injected fake pipeline (success, SEL threshold signals,
 * non-fatal failure caching, connection-error circuit breaker), eligibility
 * filtering, PESL simulation (success + non-fatal failure), archive-error
 * tolerance, persona-recommendation short-circuit, and the
 * `loadPersistedData()` hydration path.
 *
 * A real temp `projectRoot` is used so on-disk tracker-config lookup finds
 * nothing and auto-publish short-circuits. No source is modified.
 */

interface FakePipeline {
  preprocessIssue: ReturnType<typeof vi.fn>;
  simulate: ReturnType<typeof vi.fn>;
}

interface Harness {
  ctx: OrchestratorContext;
  tick: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> };
  pipeline: FakePipeline;
  graphLoad: ReturnType<typeof vi.fn>;
  enrichedSpecsByIssue: Map<string, EnrichedSpec>;
  analysisFailureCache: Map<string, number>;
  cleanup(): void;
}

interface HarnessOpts {
  withPipeline?: boolean;
  withGraphStore?: boolean;
  intelligence?: Record<string, unknown>;
  saveImpl?: () => Promise<unknown>;
  listImpl?: () => Promise<unknown[]>;
}

function makeHarness(opts: HarnessOpts = {}): Harness {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runner-behavior-'));
  const enrichedSpecsByIssue = new Map<string, EnrichedSpec>();
  const analysisFailureCache = new Map<string, number>();
  const save = vi.fn(opts.saveImpl ?? (() => Promise.resolve(undefined)));
  const list = vi.fn(opts.listImpl ?? (() => Promise.resolve([])));
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

  const pipeline: FakePipeline = {
    preprocessIssue: vi.fn(),
    simulate: vi.fn(),
  };

  const graphLoad = vi.fn().mockResolvedValue(true);
  const graphStore = opts.withGraphStore ? { load: graphLoad } : null;

  const ctx = {
    config: {
      agent: {},
      workspace: { root: path.join(projectRoot, '.harness', 'workspaces') },
      intelligence: opts.intelligence,
    },
    projectRoot,
    logger,
    pipeline: opts.withPipeline ? pipeline : null,
    graphStore,
    analysisArchive: { list, save },
    enrichedSpecsByIssue,
    analysisFailureCache,
  } as unknown as OrchestratorContext;

  return {
    ctx,
    tick: vi.fn(),
    save,
    list,
    logger,
    pipeline,
    graphLoad,
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
    externalId: null,
    ...overrides,
  } as Issue;
}

function spec(unknowns = 0, ambiguities = 0): EnrichedSpec {
  return {
    unknowns: Array.from({ length: unknowns }, (_, i) => `u${i}`),
    ambiguities: Array.from({ length: ambiguities }, (_, i) => `a${i}`),
  } as unknown as EnrichedSpec;
}

const tickFn = (h: Harness) => h.tick as unknown as TickActivityCallback;

let h: Harness;
afterEach(() => {
  h?.cleanup();
  vi.clearAllMocks();
});

describe('IntelligencePipelineRunner.run — candidate analysis via injected pipeline', () => {
  beforeEach(() => {
    h = makeHarness({ withPipeline: true });
  });

  it('enriches an eligible candidate: populates specs, scores, signals, and simulation', async () => {
    const enriched = spec();
    const score = { level: 'medium' } as unknown;
    const sim = { verdict: 'ok' } as unknown;
    h.pipeline.preprocessIssue.mockResolvedValue({
      signals: [{ name: 'base-signal', reason: 'because' }],
      spec: enriched,
      score,
    });
    h.pipeline.simulate.mockResolvedValue(sim);

    const runner = new IntelligencePipelineRunner(h.ctx);
    const result = await runner.run([makeIssue()], tickFn(h));

    expect(h.pipeline.preprocessIssue).toHaveBeenCalledTimes(1);
    expect(result.enrichedSpecs.get('ISSUE-1')).toBe(enriched);
    expect(result.complexityScores.get('ISSUE-1')).toBe(score);
    expect(result.concernSignals.get('ISSUE-1')).toEqual([{ name: 'base-signal', reason: 'because' }]);
    // Spec is also written back into the shared cross-tick cache.
    expect(h.enrichedSpecsByIssue.get('ISSUE-1')).toBe(enriched);
    // PESL ran on the freshly enriched candidate.
    expect(h.pipeline.simulate).toHaveBeenCalledTimes(1);
    expect(result.simulationResults.get('ISSUE-1')).toBe(sim);
    // Archived once.
    expect(h.save).toHaveBeenCalledTimes(1);
  });

  it('appends high-unknowns and high-ambiguities SEL signals past their thresholds', async () => {
    h.pipeline.preprocessIssue.mockResolvedValue({
      signals: [],
      spec: spec(4, 6), // unknowns > 3, ambiguities > 5
      score: { level: 'high' },
    });
    h.pipeline.simulate.mockResolvedValue({});

    const runner = new IntelligencePipelineRunner(h.ctx);
    const result = await runner.run([makeIssue()], tickFn(h));

    const names = (result.concernSignals.get('ISSUE-1') ?? []).map((s) => s.name);
    expect(names).toContain('high-unknowns');
    expect(names).toContain('high-ambiguities');
  });

  it('does not emit threshold signals at or below the thresholds', async () => {
    h.pipeline.preprocessIssue.mockResolvedValue({
      signals: [],
      spec: spec(3, 5), // exactly at thresholds -> no extra signals
      score: { level: 'low' },
    });
    h.pipeline.simulate.mockResolvedValue({});

    const runner = new IntelligencePipelineRunner(h.ctx);
    const result = await runner.run([makeIssue()], tickFn(h));

    // No base signals and no threshold signals -> no entry at all.
    expect(result.concernSignals.has('ISSUE-1')).toBe(false);
  });

  it('caches a non-connection analysis failure and leaves the spec unset (non-fatal)', async () => {
    h.pipeline.preprocessIssue.mockRejectedValue(new Error('boom parsing spec'));

    const runner = new IntelligencePipelineRunner(h.ctx);
    const result = await runner.run([makeIssue()], tickFn(h));

    expect(result.enrichedSpecs.has('ISSUE-1')).toBe(false);
    expect(h.analysisFailureCache.has('ISSUE-1')).toBe(true);
    expect(h.logger.error).toHaveBeenCalled();
    // No spec/score/sim -> nothing archived.
    expect(h.save).not.toHaveBeenCalled();
  });

  it('trips the connection-error circuit breaker and caches all remaining candidates', async () => {
    h.pipeline.preprocessIssue.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:11434'));
    const issues = [
      makeIssue({ id: 'A', identifier: 'CORE-A' }),
      makeIssue({ id: 'B', identifier: 'CORE-B' }),
      makeIssue({ id: 'C', identifier: 'CORE-C' }),
    ];

    const runner = new IntelligencePipelineRunner(h.ctx);
    await runner.run(issues, tickFn(h));

    // Threshold default is 2: A (count 1) then B (count 2 -> break), C never attempted.
    expect(h.pipeline.preprocessIssue).toHaveBeenCalledTimes(2);
    // All three end up cached (A+B from their own failures, C from the skip loop).
    expect(h.analysisFailureCache.has('A')).toBe(true);
    expect(h.analysisFailureCache.has('B')).toBe(true);
    expect(h.analysisFailureCache.has('C')).toBe(true);
    // The breaker announces the skip.
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('unreachable'),
      expect.any(Object)
    );
  });

  it('honors a custom circuitBreakerThreshold from config', async () => {
    h = makeHarness({ withPipeline: true, intelligence: { circuitBreakerThreshold: 1 } });
    h.pipeline.preprocessIssue.mockRejectedValue(new Error('fetch failed'));
    const issues = [
      makeIssue({ id: 'A', identifier: 'CORE-A' }),
      makeIssue({ id: 'B', identifier: 'CORE-B' }),
    ];

    const runner = new IntelligencePipelineRunner(h.ctx);
    await runner.run(issues, tickFn(h));

    // Threshold 1 -> breaks on the very first connection error.
    expect(h.pipeline.preprocessIssue).toHaveBeenCalledTimes(1);
    expect(h.analysisFailureCache.has('A')).toBe(true);
    expect(h.analysisFailureCache.has('B')).toBe(true);
  });
});

describe('IntelligencePipelineRunner.run — eligibility filtering', () => {
  beforeEach(() => {
    h = makeHarness({ withPipeline: true });
  });

  it('skips analysis for an auto-execute scope tier (scope:quick-fix)', async () => {
    h.pipeline.preprocessIssue.mockResolvedValue({ signals: [], spec: spec(), score: {} });

    const runner = new IntelligencePipelineRunner(h.ctx);
    await runner.run([makeIssue({ labels: ['scope:quick-fix'] })], tickFn(h));

    expect(h.pipeline.preprocessIssue).not.toHaveBeenCalled();
  });

  it('skips a candidate already present in the analysis failure cache', async () => {
    h.analysisFailureCache.set('ISSUE-1', Date.now());
    h.pipeline.preprocessIssue.mockResolvedValue({ signals: [], spec: spec(), score: {} });

    const runner = new IntelligencePipelineRunner(h.ctx);
    await runner.run([makeIssue()], tickFn(h));

    expect(h.pipeline.preprocessIssue).not.toHaveBeenCalled();
  });
});

describe('IntelligencePipelineRunner.run — PESL simulation edge behavior', () => {
  beforeEach(() => {
    h = makeHarness({ withPipeline: true });
  });

  it('treats a simulation failure as non-fatal and records no result for that issue', async () => {
    h.pipeline.preprocessIssue.mockResolvedValue({ signals: [], spec: spec(), score: {} });
    h.pipeline.simulate.mockRejectedValue(new Error('sim exploded'));

    const runner = new IntelligencePipelineRunner(h.ctx);
    const result = await runner.run([makeIssue()], tickFn(h));

    expect(result.simulationResults.has('ISSUE-1')).toBe(false);
    expect(h.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('PESL simulation failed'),
      expect.any(Object)
    );
    // The issue still enriches and archives despite the sim failure.
    expect(result.enrichedSpecs.has('ISSUE-1')).toBe(true);
  });

  it('skips simulation when a candidate has a spec but no complexity score', async () => {
    // Cached spec (eligibility filter skips analysis) means score map stays empty.
    h.enrichedSpecsByIssue.set('ISSUE-1', spec());

    const runner = new IntelligencePipelineRunner(h.ctx);
    const result = await runner.run([makeIssue()], tickFn(h));

    expect(h.pipeline.simulate).not.toHaveBeenCalled();
    expect(result.simulationResults.size).toBe(0);
  });
});

describe('IntelligencePipelineRunner.run — archive tolerance', () => {
  it('swallows an archive save error and still returns the result maps', async () => {
    h = makeHarness({
      withPipeline: true,
      saveImpl: () => Promise.reject(new Error('disk full')),
    });
    h.pipeline.preprocessIssue.mockResolvedValue({ signals: [], spec: spec(), score: {} });
    h.pipeline.simulate.mockResolvedValue({});

    const runner = new IntelligencePipelineRunner(h.ctx);
    const result = await runner.run([makeIssue()], tickFn(h));

    expect(result.enrichedSpecs.get('ISSUE-1')).toBeDefined();
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to archive analysis'),
      expect.any(Object)
    );
  });
});

describe('IntelligencePipelineRunner.run — persona recommendations', () => {
  it('returns an empty persona map when a candidate carries no system/module labels', async () => {
    h = makeHarness({ withPipeline: true, withGraphStore: true });
    h.pipeline.preprocessIssue.mockResolvedValue({ signals: [], spec: spec(), score: {} });
    h.pipeline.simulate.mockResolvedValue({});

    const runner = new IntelligencePipelineRunner(h.ctx);
    const result = await runner.run([makeIssue({ labels: ['area:core'] })], tickFn(h));

    // Graph store present, but no system:/module: labels -> scorer never consulted.
    expect(result.personaRecommendations.size).toBe(0);
  });
});

describe('IntelligencePipelineRunner.loadPersistedData — hydration path', () => {
  it('loads the graph store and hydrates the spec cache from the archive, once', async () => {
    const archived = [
      { issueId: 'ARCH-1', identifier: 'CORE-A1', spec: spec() },
      { issueId: 'ARCH-2', identifier: 'CORE-A2', spec: spec() },
    ];
    h = makeHarness({
      withPipeline: true,
      withGraphStore: true,
      listImpl: () => Promise.resolve(archived),
    });

    const runner = new IntelligencePipelineRunner(h.ctx);
    await runner.loadPersistedData();

    expect(h.graphLoad).toHaveBeenCalledTimes(1);
    expect(h.enrichedSpecsByIssue.get('ARCH-1')).toBeDefined();
    expect(h.enrichedSpecsByIssue.get('ARCH-2')).toBeDefined();

    // Second call is a guarded no-op: graph store is not reloaded.
    await runner.loadPersistedData();
    expect(h.graphLoad).toHaveBeenCalledTimes(1);
  });

  it('tolerates a graph-store load failure (non-fatal) and still resolves', async () => {
    h = makeHarness({ withPipeline: true, withGraphStore: true });
    h.graphLoad.mockRejectedValue(new Error('corrupt graph file'));

    const runner = new IntelligencePipelineRunner(h.ctx);
    await expect(runner.loadPersistedData()).resolves.toBeUndefined();
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load graph store'),
      expect.any(Object)
    );
  });

  it('tolerates an archive list failure during hydration', async () => {
    h = makeHarness({
      withPipeline: true,
      withGraphStore: true,
      listImpl: () => Promise.reject(new Error('archive unreadable')),
    });

    const runner = new IntelligencePipelineRunner(h.ctx);
    await expect(runner.loadPersistedData()).resolves.toBeUndefined();
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load analysis archive'),
      expect.any(Object)
    );
  });
});
