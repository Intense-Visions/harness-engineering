import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  it('returns snapshotAge "cached" when using cached snapshot', async () => {
    (loadCachedSnapshot as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_SNAPSHOT);
    (isSnapshotFresh as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const result = await runRecommend({ cwd: '/tmp/test' });

    expect(result.snapshotAge).toBe('cached');
  });

  it('returns snapshotAge "fresh" when capturing new snapshot', async () => {
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);

    const result = await runRecommend({ cwd: '/tmp/test', noCache: true });

    expect(result.snapshotAge).toBe('fresh');
  });

  it('defaults top to 5 when not provided', async () => {
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);

    await runRecommend({ cwd: '/tmp/test', noCache: true });

    expect(recommend).toHaveBeenCalledWith(MOCK_SNAPSHOT, expect.any(Object), { top: 5 });
  });

  it('defaults cwd to process.cwd() when not provided', async () => {
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);
    const originalCwd = process.cwd();

    await runRecommend({ noCache: true });

    expect(captureHealthSnapshot).toHaveBeenCalledWith(originalCwd);
  });

  it('builds skills record from index and passes to recommend', async () => {
    const customIndex = {
      ...MOCK_INDEX,
      skills: {
        'skill-a': {
          tier: 1,
          description: 'A',
          keywords: [],
          stackSignals: [],
          cognitiveMode: undefined,
          phases: [],
          source: 'bundled' as const,
          addresses: [{ type: 'mcp', uri: 'mcp://test' }],
          dependsOn: ['skill-b'],
        },
        'skill-b': {
          tier: 2,
          description: 'B',
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
    (loadOrRebuildIndex as ReturnType<typeof vi.fn>).mockReturnValue(customIndex);
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);

    await runRecommend({ cwd: '/tmp/test', noCache: true });

    expect(recommend).toHaveBeenCalledWith(
      MOCK_SNAPSHOT,
      expect.objectContaining({
        'skill-a': expect.objectContaining({ dependsOn: ['skill-b'] }),
        'skill-b': expect.objectContaining({ dependsOn: [] }),
      }),
      { top: 5 }
    );
  });

  it('handles config without skills.tierOverrides gracefully', async () => {
    const { resolveConfig } = await import('../../src/config/loader');
    (resolveConfig as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: false,
      error: 'no config',
    });
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);

    // Should not throw
    const result = await runRecommend({ cwd: '/tmp/test', noCache: true });
    expect(result).toHaveProperty('recommendations');
  });
});

describe('createRecommendCommand - action', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let logOutput: string[];
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logOutput = [];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logOutput.push(args.join(' '));
    });
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    (loadOrRebuildIndex as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_INDEX);
    (recommend as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_RESULT);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('outputs JSON when --json flag is used', async () => {
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);

    const { Command } = await import('commander');
    const program = new Command();
    program.option('--json', 'JSON output');
    program.addCommand(createRecommendCommand());

    await program.parseAsync(['node', 'harness', 'recommend', '--no-cache', '--json']);

    const jsonLine = logOutput.find((line) => line.includes('recommendations'));
    expect(jsonLine).toBeDefined();
    const output = JSON.parse(jsonLine!);
    expect(output).toHaveProperty('recommendations');
    expect(output).toHaveProperty('sequenceReasoning');
  });

  it('outputs text with recommendation list', async () => {
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);

    const { Command } = await import('commander');
    const program = new Command();
    program.option('--json', 'JSON output');
    program.addCommand(createRecommendCommand());

    await program.parseAsync(['node', 'harness', 'recommend', '--no-cache']);

    const allOutput = logOutput.join('\n');
    expect(allOutput).toContain('Recommended workflow');
    expect(allOutput).toContain('Sequence reasoning');
  });

  it('shows "No recommendations" when result is empty', async () => {
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);
    (recommend as ReturnType<typeof vi.fn>).mockReturnValue({
      recommendations: [],
      snapshotAge: 'fresh',
      sequenceReasoning: 'None needed.',
    });

    const { Command } = await import('commander');
    const program = new Command();
    program.option('--json', 'JSON output');
    program.addCommand(createRecommendCommand());

    await program.parseAsync(['node', 'harness', 'recommend', '--no-cache']);

    const allOutput = logOutput.join('\n');
    expect(allOutput).toContain('No recommendations');
  });

  it('formats critical recommendations with [CRITICAL] tag', async () => {
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);

    const { Command } = await import('commander');
    const program = new Command();
    program.option('--json', 'JSON output');
    program.addCommand(createRecommendCommand());

    await program.parseAsync(['node', 'harness', 'recommend', '--no-cache']);

    const allOutput = logOutput.join('\n');
    expect(allOutput).toContain('CRITICAL');
    expect(allOutput).toContain('harness-enforce-architecture');
  });

  it('handles errors by printing to stderr and exiting', async () => {
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('snapshot failed')
    );

    const errOutput: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      errOutput.push(args.join(' '));
    });

    const { Command } = await import('commander');
    const program = new Command();
    program.option('--json', 'JSON output');
    program.addCommand(createRecommendCommand());

    await program.parseAsync(['node', 'harness', 'recommend', '--no-cache']);

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
