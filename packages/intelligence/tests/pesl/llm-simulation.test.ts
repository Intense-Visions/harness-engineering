import { describe, it, expect, vi } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import type { AnalysisProvider } from '../../src/analysis-provider/interface.js';
import { runLlmSimulation } from '../../src/pesl/llm-simulation.js';
import type { EnrichedSpec, ComplexityScore } from '../../src/types.js';

function makeSpec(overrides: Partial<EnrichedSpec> = {}): EnrichedSpec {
  return {
    id: 'spec-2',
    title: 'Add notification service',
    intent: 'Implement email + in-app notifications on account changes',
    summary: 'Users receive notifications when their account is modified',
    affectedSystems: [
      {
        name: 'user-service',
        graphNodeId: 'mod-users',
        confidence: 0.9,
        transitiveDeps: ['mod-auth', 'mod-db'],
        testCoverage: 5,
        owner: null,
      },
      {
        name: 'email-service',
        graphNodeId: null,
        confidence: 0,
        transitiveDeps: [],
        testCoverage: 0,
        owner: null,
      },
    ],
    functionalRequirements: ['Send email on account modification', 'Store in-app notification'],
    nonFunctionalRequirements: ['Notifications sent within 30 seconds'],
    apiChanges: ['POST /api/notifications'],
    dbChanges: ['Add notifications table'],
    integrationPoints: ['Email provider API'],
    assumptions: ['SMTP credentials configured'],
    unknowns: ['Email provider rate limits'],
    ambiguities: ['Which account changes trigger notifications'],
    riskSignals: ['New external dependency on email provider'],
    initialComplexityHints: { textualComplexity: 0.5, structuralComplexity: 0.6 },
    ...overrides,
  };
}

function makeScore(overrides: Partial<ComplexityScore> = {}): ComplexityScore {
  return {
    overall: 0.55,
    confidence: 0.7,
    riskLevel: 'medium',
    blastRadius: { services: 2, modules: 3, filesEstimated: 15, testFilesAffected: 3 },
    dimensions: { structural: 0.4, semantic: 0.5, historical: 0 },
    reasoning: ['Medium complexity -- multi-service change'],
    recommendedRoute: 'simulation-required',
    ...overrides,
  };
}

function makeMockProvider(
  response?: Partial<{
    simulatedPlan: string[];
    predictedFailures: string[];
    riskHotspots: string[];
    missingSteps: string[];
    testGaps: string[];
    recommendedChanges: string[];
  }>
): AnalysisProvider {
  return {
    analyze: vi.fn().mockResolvedValue({
      result: {
        simulatedPlan: [
          'Create notification types',
          'Add notifications table migration',
          'Implement NotificationService',
          'Wire into user update endpoint',
        ],
        predictedFailures: [
          'Missing email provider mock in tests',
          'Race condition on concurrent account updates',
        ],
        riskHotspots: ['user-service/handlers/update.ts', 'email-service/client.ts'],
        missingSteps: ['Add retry logic for email send failures'],
        testGaps: [
          'No integration test for notification-on-update flow',
          'No test for email provider failure handling',
        ],
        recommendedChanges: ['Add circuit breaker for email provider'],
        ...response,
      },
      tokenUsage: { inputTokens: 500, outputTokens: 300, totalTokens: 800 },
      model: 'claude-sonnet-4-20250514',
      latencyMs: 1500,
    }),
  };
}

describe('runLlmSimulation', () => {
  it('produces a full-simulation SimulationResult with LLM-derived content', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();
    const spec = makeSpec();
    const score = makeScore();

    const result = await runLlmSimulation(spec, score, store, provider);

    expect(result.tier).toBe('full-simulation');
    expect(result.simulatedPlan.length).toBeGreaterThan(0);
    expect(result.predictedFailures.length).toBeGreaterThan(0);
    expect(result.testGaps.length).toBeGreaterThan(0);
    expect(result.riskHotspots.length).toBeGreaterThan(0);
    expect(result.missingSteps.length).toBeGreaterThan(0);
    expect(result.executionConfidence).toBeGreaterThanOrEqual(0);
    expect(result.executionConfidence).toBeLessThanOrEqual(1);
    expect(result.abort).toBe(false);
  });

  it('calls AnalysisProvider with PESL prompts', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();

    await runLlmSimulation(makeSpec(), makeScore(), store, provider);

    expect(provider.analyze).toHaveBeenCalledOnce();
    const call = (provider.analyze as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.prompt).toContain('Add notification service');
    expect(call.systemPrompt).toContain('pre-execution simulation');
  });

  it('passes model override when provided', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();

    await runLlmSimulation(makeSpec(), makeScore(), store, provider, 'claude-opus-4-20250514');

    const call = (provider.analyze as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.model).toBe('claude-opus-4-20250514');
  });

  it('merges graph check results with LLM results', async () => {
    const store = new GraphStore();
    store.addNode({ id: 'mod-users', name: 'user-service', type: 'module' });
    store.addNode({ id: 'mod-auth', name: 'auth-module', type: 'module' });
    store.addNode({ id: 'mod-db', name: 'db-module', type: 'module' });
    store.addEdge({ from: 'mod-users', to: 'mod-auth', type: 'imports' });
    store.addEdge({ from: 'mod-users', to: 'mod-db', type: 'imports' });

    const provider = makeMockProvider();
    const result = await runLlmSimulation(makeSpec(), makeScore(), store, provider);

    expect(result.simulatedPlan.length).toBeGreaterThan(0);
    expect(result.tier).toBe('full-simulation');
  });

  it('computes confidence from combined graph + LLM signals', async () => {
    const provider = makeMockProvider({
      predictedFailures: ['fail1', 'fail2', 'fail3', 'fail4', 'fail5'],
      testGaps: ['gap1', 'gap2', 'gap3', 'gap4'],
    });
    const store = new GraphStore();

    const result = await runLlmSimulation(makeSpec(), makeScore(), store, provider);

    expect(result.executionConfidence).toBeLessThan(0.7);
  });
});
