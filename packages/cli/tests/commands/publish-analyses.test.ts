import { describe, it, expect } from 'vitest';
import { renderAnalysisComment } from '@harness-engineering/orchestrator';

describe('publish-analyses CLI', () => {
  it('can import renderAnalysisComment from orchestrator', () => {
    expect(typeof renderAnalysisComment).toBe('function');
  });

  it('renders a valid analysis comment', () => {
    const result = renderAnalysisComment({
      issueId: 'smoke-test',
      identifier: 'smoke-feature-abc123',
      spec: null,
      score: {
        overall: 0.5,
        confidence: 0.8,
        riskLevel: 'low',
        blastRadius: { filesEstimated: 1, modules: 1, services: 1 },
        dimensions: { structural: 0.5, semantic: 0.5, historical: 0.5 },
        reasoning: ['Smoke test'],
        recommendedRoute: 'local',
      },
      simulation: null,
      analyzedAt: '2026-04-15T00:00:00Z',
      externalId: 'github:owner/repo#1',
    });
    expect(result).toContain('## Harness Analysis:');
    expect(result).toContain('_harness_analysis');
  });
});
