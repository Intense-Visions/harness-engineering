import { describe, it, expect } from 'vitest';
import { formatCIReportAsMarkdown } from '../../src/ci/report-formatter';
import type { CICheckReport } from '@harness-engineering/types';

function makeReport(overrides: Partial<CICheckReport> = {}): CICheckReport {
  return {
    version: 1,
    project: 'test-project',
    timestamp: '2026-04-16T12:00:00.000Z',
    checks: [
      { name: 'validate', status: 'pass', issues: [], durationMs: 50 },
      { name: 'deps', status: 'pass', issues: [], durationMs: 30 },
    ],
    summary: { total: 2, passed: 2, failed: 0, warnings: 0, skipped: 0 },
    exitCode: 0,
    ...overrides,
  };
}

describe('formatCIReportAsMarkdown', () => {
  it('produces markdown with summary table for passing report', () => {
    const md = formatCIReportAsMarkdown(makeReport());

    expect(md).toContain('All Checks Passed');
    expect(md).toContain('| Check | Status | Issues | Duration |');
    expect(md).toContain('validate');
    expect(md).toContain('deps');
    expect(md).toContain('**2** passed');
    expect(md).toContain('**0** failed');
  });

  it('produces failure header when exitCode is non-zero', () => {
    const md = formatCIReportAsMarkdown(
      makeReport({
        exitCode: 1,
        checks: [
          {
            name: 'validate',
            status: 'fail',
            issues: [{ severity: 'error', message: 'AGENTS.md not found' }],
            durationMs: 10,
          },
        ],
        summary: { total: 1, passed: 0, failed: 1, warnings: 0, skipped: 0 },
      })
    );

    expect(md).toContain('Checks Failed');
    expect(md).toContain('AGENTS.md not found');
  });

  it('includes file and line in issue details', () => {
    const md = formatCIReportAsMarkdown(
      makeReport({
        exitCode: 1,
        checks: [
          {
            name: 'deps',
            status: 'fail',
            issues: [
              {
                severity: 'error',
                message: 'Layer violation',
                file: 'src/core/bad.ts',
                line: 42,
              },
            ],
            durationMs: 20,
          },
        ],
        summary: { total: 1, passed: 0, failed: 1, warnings: 0, skipped: 0 },
      })
    );

    expect(md).toContain('`src/core/bad.ts:42`');
    expect(md).toContain('Layer violation');
  });

  it('includes warnings in details section', () => {
    const md = formatCIReportAsMarkdown(
      makeReport({
        checks: [
          {
            name: 'entropy',
            status: 'warn',
            issues: [{ severity: 'warning', message: 'Dead export: foo', file: 'src/utils.ts' }],
            durationMs: 100,
          },
        ],
        summary: { total: 1, passed: 0, failed: 0, warnings: 1, skipped: 0 },
      })
    );

    expect(md).toContain('Dead export: foo');
    expect(md).toContain('`src/utils.ts`');
  });

  it('omits details section when no issues exist', () => {
    const md = formatCIReportAsMarkdown(makeReport());

    expect(md).not.toContain('### Details');
  });

  it('includes footer with timestamp', () => {
    const md = formatCIReportAsMarkdown(makeReport());

    expect(md).toContain('2026-04-16T12:00:00.000Z');
    expect(md).toContain('harness ci notify');
  });
});
