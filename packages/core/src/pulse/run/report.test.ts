import { describe, it, expect } from 'vitest';
import { assembleReport } from './report';
import type { OrchestratorResult } from './orchestrator';

const baseResult: OrchestratorResult = {
  sources: [
    {
      kind: 'analytics',
      name: 'mock',
      result: { fields: { event_name: 'click', count: 100 }, distributions: {} },
    },
  ],
  sourcesQueried: ['mock'],
  sourcesSkipped: [],
  durationMs: 250,
};

describe('assembleReport', () => {
  it('produces a report <=40 lines with all 4 sections', () => {
    const out = assembleReport(baseResult, 'TestProduct', '24h');
    const lines = out.split('\n');
    expect(lines.length).toBeLessThanOrEqual(40);
    expect(out).toContain('# TestProduct Pulse');
    expect(out).toContain('## Headlines');
    expect(out).toContain('## Usage');
    expect(out).toContain('## System performance');
    expect(out).toContain('## Followups');
  });

  it('truncates Followups section when output exceeds 40 lines', () => {
    const fat: OrchestratorResult = {
      ...baseResult,
      sourcesSkipped: Array.from({ length: 80 }, (_, i) => ({
        name: `s${i}`,
        kind: 'analytics' as const,
        reason: 'long reason text that produces a wide followups list',
      })),
    };
    const out = assembleReport(fat, 'P', '24h');
    expect(out.split('\n').length).toBeLessThanOrEqual(40);
  });

  it('contains no PII denylisted patterns in the final output (final sweep)', () => {
    // Force a result that somehow slips through — verify the final sweep
    const tainted: OrchestratorResult = {
      sources: [
        {
          kind: 'analytics',
          name: 'leak',
          result: { fields: { event_name: 'leak', count: 1 }, distributions: {} },
        },
      ],
      sourcesQueried: ['leak'],
      sourcesSkipped: [{ name: 'oops', kind: 'analytics', reason: 'contained user_id in error' }],
      durationMs: 1,
    };
    const out = assembleReport(tainted, 'P', '24h');
    expect(out).not.toMatch(/user_id|email|session_id/i);
  });

  it('renders System performance section with distributions when a tracing source is present', () => {
    const withTracing: OrchestratorResult = {
      sources: [
        {
          kind: 'analytics',
          name: 'mock',
          result: { fields: { event_name: 'click', count: 100 }, distributions: {} },
        },
        {
          kind: 'tracing',
          name: 'mockTracing',
          result: {
            fields: { event_name: 'trace', count: 5 },
            distributions: { p50: { ok: 12 }, p95: { ok: 87 } },
          },
        },
      ],
      sourcesQueried: ['mock', 'mockTracing'],
      sourcesSkipped: [],
      durationMs: 100,
    };
    const out = assembleReport(withTracing, 'P', '24h');
    // Should NOT contain the placeholder when tracing is configured.
    expect(out).not.toContain('_(no tracing source configured)_');
    // Should contain a distribution line (p50/p95 keys are not on the PII denylist).
    expect(out).toMatch(/p50|p95/);
  });
});
