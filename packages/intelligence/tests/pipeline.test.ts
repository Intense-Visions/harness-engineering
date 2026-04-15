import { describe, it, expect, vi } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import type { Issue, EscalationConfig } from '@harness-engineering/types';
import type { AnalysisProvider } from '../src/analysis-provider/interface.js';
import { IntelligencePipeline } from '../src/pipeline.js';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'issue-1',
    identifier: 'TEST-1',
    title: 'Implement feature X',
    description: 'A detailed description of feature X',
    priority: 1,
    state: 'planned',
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: '2026-04-14T00:00:00Z',
    updatedAt: '2026-04-14T00:00:00Z',
    ...overrides,
  };
}

const defaultEscalationConfig: EscalationConfig = {
  alwaysHuman: ['full-exploration'],
  autoExecute: ['quick-fix', 'diagnostic'],
  signalGated: ['guided-change'],
  diagnosticRetryBudget: 1,
};

function makeMockProvider(): AnalysisProvider {
  return {
    analyze: vi.fn().mockResolvedValue({
      result: {
        intent: 'Add feature X to the system',
        summary: 'This task adds a new feature X',
        affectedSystems: [{ name: 'core-module' }],
        functionalRequirements: ['Must support X'],
        nonFunctionalRequirements: ['Must be fast'],
        apiChanges: [],
        dbChanges: [],
        integrationPoints: [],
        assumptions: ['Existing API is stable'],
        unknowns: ['Performance impact unclear'],
        ambiguities: [],
        riskSignals: [],
        initialComplexityHints: { textualComplexity: 0.3, structuralComplexity: 0.2 },
      },
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      model: 'claude-sonnet-4-20250514',
      latencyMs: 500,
    }),
  };
}

describe('IntelligencePipeline', () => {
  it('runs full pipeline for signalGated tier (guided-change)', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();
    const pipeline = new IntelligencePipeline(provider, store);

    const result = await pipeline.preprocessIssue(
      makeIssue(),
      'guided-change',
      defaultEscalationConfig
    );

    // SEL should have run
    expect(result.spec).not.toBeNull();
    expect(result.spec!.intent).toBe('Add feature X to the system');
    expect(result.spec!.id).toBe('issue-1');
    expect(result.spec!.title).toBe('Implement feature X');

    // CML should have run
    expect(result.score).not.toBeNull();
    expect(result.score!.overall).toBeGreaterThanOrEqual(0);
    expect(result.score!.overall).toBeLessThanOrEqual(1);
    expect(result.score!.reasoning.length).toBeGreaterThan(0);

    // Signals derived from score
    expect(Array.isArray(result.signals)).toBe(true);

    // Simulation not run during preprocessing
    expect(result.simulation).toBeNull();

    // Provider was called (SEL)
    expect(provider.analyze).toHaveBeenCalledOnce();
  });

  it('skips everything for autoExecute tier (quick-fix)', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();
    const pipeline = new IntelligencePipeline(provider, store);

    const result = await pipeline.preprocessIssue(
      makeIssue(),
      'quick-fix',
      defaultEscalationConfig
    );

    expect(result.spec).toBeNull();
    expect(result.score).toBeNull();
    expect(result.signals).toEqual([]);
    expect(result.simulation).toBeNull();

    // No LLM calls
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it('skips everything for autoExecute tier (diagnostic)', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();
    const pipeline = new IntelligencePipeline(provider, store);

    const result = await pipeline.preprocessIssue(
      makeIssue(),
      'diagnostic',
      defaultEscalationConfig
    );

    expect(result.spec).toBeNull();
    expect(result.score).toBeNull();
    expect(result.signals).toEqual([]);
    expect(result.simulation).toBeNull();
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it('runs SEL but skips CML for alwaysHuman tier (full-exploration)', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();
    const pipeline = new IntelligencePipeline(provider, store);

    const result = await pipeline.preprocessIssue(
      makeIssue(),
      'full-exploration',
      defaultEscalationConfig
    );

    // SEL ran — spec is enriched
    expect(result.spec).not.toBeNull();
    expect(result.spec!.intent).toBe('Add feature X to the system');
    expect(result.spec!.affectedSystems).toHaveLength(1);
    expect(result.spec!.unknowns).toContain('Performance impact unclear');

    // CML skipped — no score
    expect(result.score).toBeNull();

    // No signals (routing already decided)
    expect(result.signals).toEqual([]);

    // Simulation not run during preprocessing
    expect(result.simulation).toBeNull();

    // Provider was called exactly once (SEL only)
    expect(provider.analyze).toHaveBeenCalledOnce();
  });

  it('simulate() delegates to PeslSimulator for graph-only tier', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();
    const pipeline = new IntelligencePipeline(provider, store);

    const result = await pipeline.preprocessIssue(
      makeIssue(),
      'guided-change',
      defaultEscalationConfig
    );

    const simResult = await pipeline.simulate(result.spec!, result.score!, 'quick-fix');
    expect(simResult.tier).toBe('graph-only');
    expect(simResult.abort).toBe(false);
    // Only SEL call from preprocessing -- no additional LLM call for graph-only sim
    expect(provider.analyze).toHaveBeenCalledOnce();
  });

  it('preserves issue identity through the pipeline', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();
    const pipeline = new IntelligencePipeline(provider, store);

    const issue = makeIssue({ id: 'custom-42', title: 'Custom title' });
    const result = await pipeline.preprocessIssue(issue, 'guided-change', defaultEscalationConfig);

    expect(result.spec!.id).toBe('custom-42');
    expect(result.spec!.title).toBe('Custom title');
  });
});
