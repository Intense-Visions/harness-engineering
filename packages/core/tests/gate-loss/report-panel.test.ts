import { describe, it, expect } from 'vitest';
import { formatCIReportAsMarkdown } from '../../src/ci/report-formatter';
import type { CICheckReport } from '@harness-engineering/types';

function makeReport(overrides: Partial<CICheckReport> = {}): CICheckReport {
  return {
    version: 1,
    project: 'test-project',
    timestamp: '2026-08-31T12:00:00.000Z',
    checks: [{ name: 'validate', status: 'pass', issues: [], durationMs: 10 }],
    summary: { total: 1, passed: 1, failed: 0, warnings: 0, skipped: 0 },
    exitCode: 0,
    ...overrides,
  };
}

describe('report loss panel (#1673)', () => {
  it('is absent when no check emitted measurements (byte-additive)', () => {
    const md = formatCIReportAsMarkdown(makeReport());
    expect(md).not.toMatch(/Continuous loss/);
  });

  it('renders the loss panel when a thresholded check emitted measurements', () => {
    const md = formatCIReportAsMarkdown(
      makeReport({
        checks: [
          {
            name: 'traceability',
            status: 'pass',
            issues: [],
            durationMs: 20,
            measurements: [
              {
                gate: 'traceability.coverage:auth',
                measured: 82,
                target: 80,
                bound: 'lower',
                unit: '%',
              },
            ],
          },
        ],
      })
    );
    expect(md).toMatch(/Continuous loss \(distance-to-threshold\)/);
    expect(md).toMatch(/traceability.coverage:auth/);
    // A green verdict that barely cleared the floor still surfaces a loss near 1.
    expect(md).toMatch(/Accumulated loss/);
  });
});
