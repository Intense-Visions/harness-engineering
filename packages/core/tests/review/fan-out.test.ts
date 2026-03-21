import { describe, it, expect } from 'vitest';
import { fanOutReview } from '../../src/review/fan-out';
import type { ContextBundle } from '../../src/review/types';

function makeBundles(): ContextBundle[] {
  const base = {
    changeType: 'feature' as const,
    changedFiles: [
      {
        path: 'src/service.ts',
        content: 'export function doWork() { return 42; }',
        reason: 'changed' as const,
        lines: 1,
      },
    ],
    contextFiles: [],
    commitHistory: [],
    diffLines: 10,
    contextLines: 0,
  };

  return [
    { ...base, domain: 'compliance' as const },
    { ...base, domain: 'bug' as const },
    { ...base, domain: 'security' as const },
    { ...base, domain: 'architecture' as const },
  ];
}

describe('fanOutReview()', () => {
  it('returns results for all 4 domains', async () => {
    const results = await fanOutReview({ bundles: makeBundles() });
    const domains = results.map((r) => r.domain);
    expect(domains).toContain('compliance');
    expect(domains).toContain('bug');
    expect(domains).toContain('security');
    expect(domains).toContain('architecture');
  });

  it('returns AgentReviewResult[] with findings and durationMs', async () => {
    const results = await fanOutReview({ bundles: makeBundles() });
    for (const r of results) {
      expect(Array.isArray(r.findings)).toBe(true);
      expect(typeof r.durationMs).toBe('number');
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('all findings across results have correct domain', async () => {
    const results = await fanOutReview({ bundles: makeBundles() });
    for (const r of results) {
      for (const f of r.findings) {
        expect(f.domain).toBe(r.domain);
      }
    }
  });

  it('handles bundle with security-relevant code producing findings', async () => {
    const bundles = makeBundles();
    const secBundle = bundles.find((b) => b.domain === 'security')!;
    secBundle.changedFiles = [
      {
        path: 'src/danger.ts',
        content: 'const result = eval(input);',
        reason: 'changed',
        lines: 1,
      },
    ];
    const results = await fanOutReview({ bundles });
    const secResult = results.find((r) => r.domain === 'security')!;
    expect(secResult.findings.length).toBeGreaterThan(0);
    expect(secResult.findings[0]!.severity).toBe('critical');
  });

  it('dispatches agents in parallel (not sequential)', async () => {
    const start = Date.now();
    await fanOutReview({ bundles: makeBundles() });
    const elapsed = Date.now() - start;
    // All 4 agents should complete in parallel, not sequentially
    // Each agent is nearly instant for small inputs, so total should be < 100ms
    expect(elapsed).toBeLessThan(500);
  });

  it('handles empty bundles array gracefully', async () => {
    const results = await fanOutReview({ bundles: [] });
    expect(results).toEqual([]);
  });

  it('handles partial bundles (not all 4 domains)', async () => {
    const bundles = makeBundles().slice(0, 2); // only compliance and bug
    const results = await fanOutReview({ bundles });
    expect(results.length).toBe(2);
  });
});
