import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRecommendCommand, runRecommend } from '../../src/commands/recommend';

// Mock the heavy dependencies
vi.mock('../../src/skill/health-snapshot', () => ({
  captureHealthSnapshot: vi.fn(),
  loadCachedSnapshot: vi.fn(),
  isSnapshotFresh: vi.fn(),
}));

vi.mock('../../src/skill/recommendation-engine', () => ({
  recommend: vi.fn(),
}));

vi.mock('../../src/skill/index-builder', () => ({
  loadOrRebuildIndex: vi.fn(),
}));

vi.mock('../../src/config/loader', () => ({
  resolveConfig: vi.fn(() => ({ ok: true, value: {} })),
}));

import {
  captureHealthSnapshot,
  loadCachedSnapshot,
  isSnapshotFresh,
} from '../../src/skill/health-snapshot';
import { recommend } from '../../src/skill/recommendation-engine';
import { loadOrRebuildIndex } from '../../src/skill/index-builder';
import type { HealthSnapshot } from '../../src/skill/health-snapshot';
import type { RecommendationResult } from '../../src/skill/recommendation-types';

const MOCK_SNAPSHOT: HealthSnapshot = {
  capturedAt: '2026-04-04T00:00:00.000Z',
  gitHead: 'abc1234',
  projectPath: '/tmp/test',
  checks: {
    deps: { passed: false, issueCount: 3, circularDeps: 2, layerViolations: 1 },
    entropy: { passed: true, deadExports: 0, deadFiles: 0, driftCount: 0 },
    security: { passed: true, findingCount: 0, criticalCount: 0 },
    perf: { passed: true, violationCount: 0 },
    docs: { passed: true, undocumentedCount: 0 },
    lint: { passed: true, issueCount: 0 },
  },
  metrics: {
    avgFanOut: 5,
    maxFanOut: 12,
    avgCyclomaticComplexity: 4,
    maxCyclomaticComplexity: 8,
    avgCouplingRatio: 0.3,
    testCoverage: 72,
    anomalyOutlierCount: 0,
    articulationPointCount: 0,
  },
  signals: ['circular-deps', 'layer-violations'],
};

const MOCK_RESULT: RecommendationResult = {
  recommendations: [
    {
      skillName: 'harness-enforce-architecture',
      score: 1.0,
      urgency: 'critical',
      reasons: ["[CRITICAL] Signal 'circular-deps' is active"],
      sequence: 1,
      triggeredBy: ['circular-deps'],
    },
    {
      skillName: 'harness-dependency-health',
      score: 0.65,
      urgency: 'nice-to-have',
      reasons: ["Signal 'layer-violations' is active (weight 0.5)"],
      sequence: 2,
      triggeredBy: ['layer-violations'],
    },
  ],
  snapshotAge: 'fresh',
  sequenceReasoning:
    '1 critical issue(s) detected. Sequence: 1. harness-enforce-architecture -> 2. harness-dependency-health.',
};

const MOCK_INDEX = {
  version: 1,
  hash: 'test',
  generatedAt: '2026-04-04',
  skills: {
    'harness-enforce-architecture': {
      tier: 1,
      description: 'Enforce architecture',
      keywords: [],
      stackSignals: [],
      cognitiveMode: undefined,
      phases: [],
      source: 'bundled' as const,
      addresses: [],
      dependsOn: [],
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  (loadOrRebuildIndex as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_INDEX);
  (recommend as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_RESULT);
});

describe('createRecommendCommand', () => {
  it('creates command with correct name', () => {
    const cmd = createRecommendCommand();
    expect(cmd.name()).toBe('recommend');
  });

  it('has --no-cache option', () => {
    const cmd = createRecommendCommand();
    const opts = cmd.options.map((o) => o.long);
    expect(opts).toContain('--no-cache');
  });

  it('has --top option', () => {
    const cmd = createRecommendCommand();
    const opts = cmd.options.map((o) => o.long);
    expect(opts).toContain('--top');
  });
});

describe('runRecommend', () => {
  it('uses cached snapshot when fresh and cache not disabled', async () => {
    (loadCachedSnapshot as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_SNAPSHOT);
    (isSnapshotFresh as ReturnType<typeof vi.fn>).mockReturnValue(true);

    await runRecommend({ cwd: '/tmp/test' });

    expect(captureHealthSnapshot).not.toHaveBeenCalled();
    expect(recommend).toHaveBeenCalledWith(MOCK_SNAPSHOT, expect.any(Object), { top: 5 });
  });

  it('captures fresh snapshot when cache is stale', async () => {
    (loadCachedSnapshot as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_SNAPSHOT);
    (isSnapshotFresh as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);

    await runRecommend({ cwd: '/tmp/test' });

    expect(captureHealthSnapshot).toHaveBeenCalledWith('/tmp/test');
  });

  it('forces fresh snapshot when noCache is true', async () => {
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);

    await runRecommend({ cwd: '/tmp/test', noCache: true });

    expect(loadCachedSnapshot).not.toHaveBeenCalled();
    expect(captureHealthSnapshot).toHaveBeenCalledWith('/tmp/test');
  });

  it('passes top option to recommend()', async () => {
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);

    await runRecommend({ cwd: '/tmp/test', noCache: true, top: 3 });

    expect(recommend).toHaveBeenCalledWith(MOCK_SNAPSHOT, expect.any(Object), { top: 3 });
  });

  it('returns RecommendationResult shape', async () => {
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);

    const result = await runRecommend({ cwd: '/tmp/test', noCache: true });

    expect(result).toHaveProperty('recommendations');
    expect(result).toHaveProperty('snapshotAge');
    expect(result).toHaveProperty('sequenceReasoning');
    expect(result.recommendations).toHaveLength(2);
  });

  it('captures fresh snapshot when no cache exists', async () => {
    (loadCachedSnapshot as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);

    await runRecommend({ cwd: '/tmp/test' });

    expect(captureHealthSnapshot).toHaveBeenCalledWith('/tmp/test');
  });
});
