import { describe, it, expect, vi } from 'vitest';
import type { AnalysisProvider, AnalysisResponse } from '../../src/analysis-provider/interface.js';
import type { RawWorkItem, AffectedSystem } from '../../src/types.js';
import type { GraphValidator } from '../../src/sel/graph-validator.js';
import type { SELResponse } from '../../src/sel/prompts.js';
import { enrich } from '../../src/sel/enricher.js';

function makeRawWorkItem(overrides: Partial<RawWorkItem> = {}): RawWorkItem {
  return {
    id: 'item-1',
    title: 'Add rate limiting to API gateway',
    description: 'Implement per-client rate limiting with configurable thresholds.',
    labels: ['backend', 'security'],
    metadata: { priority: 1 },
    linkedItems: ['item-0'],
    comments: [],
    source: 'roadmap',
    ...overrides,
  };
}

function makeSELResponse(overrides: Partial<SELResponse> = {}): SELResponse {
  return {
    intent: 'Add per-client rate limiting to the API gateway',
    summary: 'Implement configurable rate limiting middleware for the API gateway.',
    affectedSystems: [{ name: 'api-gateway' }, { name: 'auth-service' }],
    functionalRequirements: ['Rate limit per client IP', 'Configurable thresholds'],
    nonFunctionalRequirements: ['Sub-millisecond overhead per request'],
    apiChanges: ['New X-RateLimit-* response headers'],
    dbChanges: ['Add rate_limits table'],
    integrationPoints: ['Redis for rate counter storage'],
    assumptions: ['Redis is already deployed'],
    unknowns: ['Exact default threshold values'],
    ambiguities: ['Whether rate limiting applies to internal services'],
    riskSignals: ['Potential latency increase under high load'],
    initialComplexityHints: {
      textualComplexity: 0.4,
      structuralComplexity: 0.6,
    },
    ...overrides,
  };
}

function makeMockProvider(response: SELResponse): AnalysisProvider {
  return {
    analyze: vi.fn().mockResolvedValue({
      result: response,
      tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      model: 'test-model',
      latencyMs: 50,
    } satisfies AnalysisResponse<SELResponse>),
  };
}

function makeMockGraphValidator(validatedSystems?: AffectedSystem[]): GraphValidator {
  const defaultSystems: AffectedSystem[] = [
    {
      name: 'api-gateway',
      graphNodeId: 'node-gw-1',
      confidence: 0.9,
      transitiveDeps: ['node-dep-1'],
      testCoverage: 3,
      owner: 'platform-team',
    },
    {
      name: 'auth-service',
      graphNodeId: null,
      confidence: 0,
      transitiveDeps: [],
      testCoverage: 0,
      owner: null,
    },
  ];

  return {
    validate: vi.fn().mockReturnValue(validatedSystems ?? defaultSystems),
  } as unknown as GraphValidator;
}

describe('enrich', () => {
  it('produces schema-compliant output for valid input', async () => {
    const item = makeRawWorkItem();
    const selResponse = makeSELResponse();
    const provider = makeMockProvider(selResponse);
    const validator = makeMockGraphValidator();

    const result = await enrich(item, provider, validator);

    expect(result.id).toBe('item-1');
    expect(result.title).toBe('Add rate limiting to API gateway');
    expect(result.intent).toBe('Add per-client rate limiting to the API gateway');
    expect(result.summary).toContain('rate limiting');
    expect(result.affectedSystems).toHaveLength(2);
    expect(result.affectedSystems[0]!.graphNodeId).toBe('node-gw-1');
    expect(result.affectedSystems[1]!.graphNodeId).toBeNull();
    expect(result.functionalRequirements).toHaveLength(2);
    expect(result.nonFunctionalRequirements).toHaveLength(1);
    expect(result.apiChanges).toHaveLength(1);
    expect(result.dbChanges).toHaveLength(1);
    expect(result.integrationPoints).toHaveLength(1);
    expect(result.assumptions).toHaveLength(1);
    expect(result.unknowns).toHaveLength(1);
    expect(result.ambiguities).toHaveLength(1);
    expect(result.riskSignals).toHaveLength(1);
    expect(result.initialComplexityHints.textualComplexity).toBe(0.4);
    expect(result.initialComplexityHints.structuralComplexity).toBe(0.6);
  });

  it('handles null description', async () => {
    const item = makeRawWorkItem({ description: null });
    const selResponse = makeSELResponse({
      unknowns: ['No description provided — scope unclear'],
    });
    const provider = makeMockProvider(selResponse);
    const validator = makeMockGraphValidator();

    const result = await enrich(item, provider, validator);

    expect(result.id).toBe('item-1');
    expect(result.unknowns).toContain('No description provided — scope unclear');

    // Verify the provider was called (prompt should note missing description)
    expect(provider.analyze).toHaveBeenCalledTimes(1);
  });

  it('marks unknown systems with graphNodeId: null', async () => {
    const unknownSystems: AffectedSystem[] = [
      {
        name: 'unknown-service',
        graphNodeId: null,
        confidence: 0,
        transitiveDeps: [],
        testCoverage: 0,
        owner: null,
      },
    ];

    const item = makeRawWorkItem();
    const selResponse = makeSELResponse({
      affectedSystems: [{ name: 'unknown-service' }],
    });
    const provider = makeMockProvider(selResponse);
    const validator = makeMockGraphValidator(unknownSystems);

    const result = await enrich(item, provider, validator);

    expect(result.affectedSystems).toHaveLength(1);
    expect(result.affectedSystems[0]!.name).toBe('unknown-service');
    expect(result.affectedSystems[0]!.graphNodeId).toBeNull();
    expect(result.affectedSystems[0]!.confidence).toBe(0);
    expect(result.affectedSystems[0]!.transitiveDeps).toEqual([]);
    expect(result.affectedSystems[0]!.testCoverage).toBe(0);
    expect(result.affectedSystems[0]!.owner).toBeNull();
  });

  it('passes the LLM affectedSystems to the graph validator', async () => {
    const item = makeRawWorkItem();
    const selResponse = makeSELResponse();
    const provider = makeMockProvider(selResponse);
    const validator = makeMockGraphValidator();

    await enrich(item, provider, validator);

    expect(validator.validate).toHaveBeenCalledWith([
      { name: 'api-gateway' },
      { name: 'auth-service' },
    ]);
  });

  it('preserves id and title from the original work item', async () => {
    const item = makeRawWorkItem({ id: 'custom-id', title: 'Custom Title' });
    const selResponse = makeSELResponse();
    const provider = makeMockProvider(selResponse);
    const validator = makeMockGraphValidator();

    const result = await enrich(item, provider, validator);

    expect(result.id).toBe('custom-id');
    expect(result.title).toBe('Custom Title');
  });
});
