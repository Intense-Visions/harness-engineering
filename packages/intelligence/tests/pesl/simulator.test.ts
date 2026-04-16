import { describe, it, expect, vi } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import type { AnalysisProvider } from '../../src/analysis-provider/interface.js';
import { PeslSimulator } from '../../src/pesl/simulator.js';
import type { EnrichedSpec, ComplexityScore } from '../../src/types.js';

function makeSpec(overrides: Partial<EnrichedSpec> = {}): EnrichedSpec {
  return {
    id: 'spec-1',
    title: 'Test spec',
    intent: 'Test intent',
    summary: 'Test summary',
    affectedSystems: [],
    functionalRequirements: [],
    nonFunctionalRequirements: [],
    apiChanges: [],
    dbChanges: [],
    integrationPoints: [],
    assumptions: [],
    unknowns: [],
    ambiguities: [],
    riskSignals: [],
    initialComplexityHints: { textualComplexity: 0.1, structuralComplexity: 0.1 },
    ...overrides,
  };
}

function makeLowScore(): ComplexityScore {
  return {
    overall: 0.15,
    confidence: 0.5,
    riskLevel: 'low',
    blastRadius: { services: 0, modules: 1, filesEstimated: 2, testFilesAffected: 1 },
    dimensions: { structural: 0.1, semantic: 0.1, historical: 0 },
    reasoning: ['Low complexity'],
    recommendedRoute: 'local',
  };
}

function makeMediumScore(): ComplexityScore {
  return {
    overall: 0.55,
    confidence: 0.7,
    riskLevel: 'medium',
    blastRadius: { services: 2, modules: 3, filesEstimated: 15, testFilesAffected: 3 },
    dimensions: { structural: 0.4, semantic: 0.5, historical: 0 },
    reasoning: ['Medium complexity'],
    recommendedRoute: 'simulation-required',
  };
}

function makeMockProvider(): AnalysisProvider {
  return {
    analyze: vi.fn().mockResolvedValue({
      result: {
        simulatedPlan: ['Step 1', 'Step 2'],
        predictedFailures: ['Possible type error'],
        riskHotspots: ['module-a/index.ts'],
        missingSteps: ['Add migration rollback'],
        testGaps: ['No test for error path'],
        recommendedChanges: ['Add retry logic'],
      },
      tokenUsage: { inputTokens: 400, outputTokens: 200, totalTokens: 600 },
      model: 'claude-sonnet-4-20250514',
      latencyMs: 1200,
    }),
  };
}

describe('PeslSimulator', () => {
  it('runs graph-only checks for quick-fix tier', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();
    const simulator = new PeslSimulator(provider, store);

    const result = await simulator.simulate(makeSpec(), makeLowScore(), 'quick-fix');

    expect(result.tier).toBe('graph-only');
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it('runs graph-only checks for diagnostic tier', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();
    const simulator = new PeslSimulator(provider, store);

    const result = await simulator.simulate(makeSpec(), makeLowScore(), 'diagnostic');

    expect(result.tier).toBe('graph-only');
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it('runs full simulation for guided-change tier', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();
    const simulator = new PeslSimulator(provider, store);

    const result = await simulator.simulate(makeSpec(), makeMediumScore(), 'guided-change');

    expect(result.tier).toBe('full-simulation');
    expect(provider.analyze).toHaveBeenCalledOnce();
    expect(result.simulatedPlan.length).toBeGreaterThan(0);
  });

  it('runs full simulation when recommendedRoute is simulation-required', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();
    const simulator = new PeslSimulator(provider, store);

    const score = makeLowScore();
    score.recommendedRoute = 'simulation-required';

    const result = await simulator.simulate(makeSpec(), score, 'quick-fix');

    expect(result.tier).toBe('full-simulation');
    expect(provider.analyze).toHaveBeenCalledOnce();
  });

  it('returns abort: true when confidence is below threshold', async () => {
    const provider: AnalysisProvider = {
      analyze: vi.fn().mockResolvedValue({
        result: {
          simulatedPlan: ['Step 1'],
          predictedFailures: [
            'fail1',
            'fail2',
            'fail3',
            'fail4',
            'fail5',
            'fail6',
            'fail7',
            'fail8',
          ],
          riskHotspots: ['hot1', 'hot2', 'hot3'],
          missingSteps: ['miss1', 'miss2', 'miss3', 'miss4'],
          testGaps: ['gap1', 'gap2', 'gap3', 'gap4', 'gap5'],
          recommendedChanges: ['change1'],
        },
        tokenUsage: { inputTokens: 400, outputTokens: 200, totalTokens: 600 },
        model: 'claude-sonnet-4-20250514',
        latencyMs: 1200,
      }),
    };
    const store = new GraphStore();
    const simulator = new PeslSimulator(provider, store);

    const score = makeMediumScore();
    score.overall = 0.8;
    score.riskLevel = 'critical';

    const result = await simulator.simulate(makeSpec(), score, 'guided-change');

    expect(result.abort).toBe(true);
    expect(result.executionConfidence).toBeLessThan(0.3);
  });

  it('passes model override to LLM simulation', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();
    const simulator = new PeslSimulator(provider, store, { model: 'claude-opus-4-20250514' });

    await simulator.simulate(makeSpec(), makeMediumScore(), 'guided-change');

    const call = (provider.analyze as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.model).toBe('claude-opus-4-20250514');
  });
});
