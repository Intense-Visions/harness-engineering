import { describe, it, expect } from 'vitest';
import { renderAnalysisComment } from '../../src/core/analysis-comment';
import type { AnalysisRecord } from '../../src/core/analysis-archive';

function makeRecord(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    issueId: 'test-issue-1',
    identifier: 'test-feature-abc123',
    spec: null,
    score: {
      overall: 0.65,
      confidence: 0.82,
      riskLevel: 'medium',
      blastRadius: { filesEstimated: 5, modules: 2, services: 1 },
      dimensions: { structural: 0.5, semantic: 0.7, historical: 0.6 },
      reasoning: ['Touches shared utility module', 'No prior changes in this area'],
      recommendedRoute: 'human',
    },
    simulation: null,
    analyzedAt: '2026-04-15T12:00:00Z',
    externalId: 'github:owner/repo#42',
    ...overrides,
  };
}

describe('renderAnalysisComment', () => {
  it('includes the summary header with risk, route, confidence, and analyzedAt', () => {
    const result = renderAnalysisComment(makeRecord());
    expect(result).toContain('## Harness Analysis: test-feature-abc123');
    expect(result).toContain('**Risk:** medium (82% confidence)');
    expect(result).toContain('**Route:** human');
    expect(result).toContain('**Analyzed:** 2026-04-15T12:00:00Z');
  });

  it('includes reasoning bullets', () => {
    const result = renderAnalysisComment(makeRecord());
    expect(result).toContain('- Touches shared utility module');
    expect(result).toContain('- No prior changes in this area');
  });

  it('includes a <details> block with discriminator JSON', () => {
    const record = makeRecord();
    const result = renderAnalysisComment(record);
    expect(result).toContain('<details>');
    expect(result).toContain('<summary>Full Analysis Data</summary>');
    expect(result).toContain('```json');
    expect(result).toContain('</details>');

    const jsonMatch = result.match(/```json\n([\s\S]*?)\n```/);
    expect(jsonMatch).not.toBeNull();
    const parsed = JSON.parse(jsonMatch![1]!);
    expect(parsed._harness_analysis).toBe(true);
    expect(parsed._version).toBe(1);
    expect(parsed.issueId).toBe('test-issue-1');
  });

  it('handles record with no score gracefully', () => {
    const result = renderAnalysisComment(makeRecord({ score: null }));
    expect(result).toContain('## Harness Analysis: test-feature-abc123');
    expect(result).toContain('_harness_analysis');
    expect(result).not.toContain('**Risk:**');
  });

  it('renders high risk level correctly', () => {
    const record = makeRecord({
      score: {
        overall: 0.9,
        confidence: 0.95,
        riskLevel: 'high',
        blastRadius: { filesEstimated: 20, modules: 5, services: 3 },
        dimensions: { structural: 0.9, semantic: 0.8, historical: 0.85 },
        reasoning: ['Major cross-cutting change'],
        recommendedRoute: 'simulation-required',
      },
    });
    const result = renderAnalysisComment(record);
    expect(result).toContain('**Risk:** high (95% confidence)');
    expect(result).toContain('**Route:** simulation-required');
  });
});
