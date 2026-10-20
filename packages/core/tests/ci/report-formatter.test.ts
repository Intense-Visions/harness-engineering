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

describe('formatCIReportAsMarkdown — abstentions (#2071)', () => {
  /**
   * The markdown report is what `harness ci notify` posts as a PR comment, so
   * it is the only one of the three surfaces a reviewer actually reads. It
   * named a non-zero `abstained` count and then rendered the abstaining check
   * identically to an operator `--skip`, with no reason anywhere: the reader
   * saw ❌ and "1 could not run" and could not tell which check or why.
   */
  function reportWithAbstention(): CICheckReport {
    return {
      version: 1,
      project: 'test-project',
      timestamp: '2026-10-19T12:00:00.000Z',
      checks: [
        { name: 'validate', status: 'pass', issues: [], durationMs: 5 },
        // An operator skip: same status, deliberately no reason.
        { name: 'docs', status: 'skip', issues: [], durationMs: 0 },
        {
          name: 'traceability',
          status: 'skip',
          issues: [],
          durationMs: 0,
          skipReason:
            'No knowledge graph was found at /p/.harness/graph, so traceability coverage ' +
            'was never computed and the configured minCoverage of 100% was not evaluated.',
        },
      ],
      summary: { total: 3, passed: 1, failed: 0, warnings: 0, skipped: 2, abstained: 1 },
      exitCode: 1,
    };
  }

  it('names the abstaining check and its reason', () => {
    const md = formatCIReportAsMarkdown(reportWithAbstention());

    expect(md).toContain('### Could not run');
    expect(md).toContain('**traceability:**');
    expect(md).toContain('minCoverage of 100% was not evaluated');
    // The headline count was unasserted: replacing the whole
    // `(**N** could not run)` suffix with '' leaves ALL of `packages/core` green
    // with this assertion removed (494 files / 5757 tests), and the suffix is the
    // only place the abstention appears above the fold.
    expect(md).toContain('**1** could not run');
  });

  it('distinguishes the abstention from the operator skip in the table', () => {
    const md = formatCIReportAsMarkdown(reportWithAbstention());

    expect(md).toContain('| ⏭️ traceability | skip (could not run) |');
    // The operator skip keeps the plain status — that is the distinction.
    expect(md).toContain('| ⏭️ docs | skip |');
  });

  it('says a check that could not run is not a check that passed', () => {
    const md = formatCIReportAsMarkdown(reportWithAbstention());

    expect(md).toContain('A check that could not run is not a check that passed');
  });

  it('adds no panel and no row change when nothing abstained', () => {
    // An abstention-free report must render byte-identically to before.
    const md = formatCIReportAsMarkdown(makeReport());

    expect(md).not.toContain('Could not run');
    expect(md).not.toContain('could not run');
  });

  it('places the abstention panel before the findings detail', () => {
    const report = reportWithAbstention();
    report.checks.push({
      name: 'entropy',
      status: 'warn',
      issues: [{ severity: 'warning', message: 'Dead export: foo' }],
      durationMs: 9,
    });

    const md = formatCIReportAsMarkdown(report);

    // A gate that did not run changes how every other number here reads, so it
    // must not sit below the findings.
    expect(md.indexOf('### Could not run')).toBeLessThan(md.indexOf('### Details'));
  });
});
