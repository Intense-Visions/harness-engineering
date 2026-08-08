import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line import/no-relative-packages -- test reaches into repo-root scripts/ on purpose
import {
  extractFailures,
  formatSummary,
  findReportPaths,
} from '../../../../scripts/summarize-test-failures.mjs';

const fixture = {
  testResults: [
    {
      name: 'tests/api/server.test.ts',
      status: 'failed',
      assertionResults: [
        {
          status: 'passed',
          title: 'starts',
          ancestorTitles: ['orchestrator API'],
          failureMessages: [],
        },
        {
          status: 'failed',
          title: 'binds an ephemeral port',
          ancestorTitles: ['orchestrator API'],
          failureMessages: ['AssertionError: expected 19458 to be free\n  at line 2'],
        },
      ],
    },
  ],
};

describe('extractFailures', () => {
  it('extracts only failed assertions with title, file, and first failure line', () => {
    const out = extractFailures(fixture);
    expect(out).toEqual([
      {
        title: 'orchestrator API › binds an ephemeral port',
        file: 'tests/api/server.test.ts',
        firstFailureLine: 'AssertionError: expected 19458 to be free',
      },
    ]);
  });

  it('falls back to a suite-level failure when a suite failed to load with no assertions', () => {
    const collectionError = {
      testResults: [
        {
          name: 'tests/broken.test.ts',
          status: 'failed',
          message: 'Error: Cannot find module ./missing\n  at import',
          assertionResults: [],
        },
      ],
    };
    const out = extractFailures(collectionError);
    expect(out).toHaveLength(1);
    expect(out[0].file).toBe('tests/broken.test.ts');
    expect(out[0].firstFailureLine).toBe('Error: Cannot find module ./missing');
  });

  it('returns [] for a passing report', () => {
    expect(
      extractFailures({ testResults: [{ name: 'x', status: 'passed', assertionResults: [] }] })
    ).toEqual([]);
  });
});

describe('formatSummary', () => {
  it('renders a grouped, counted summary for failures', () => {
    const s = formatSummary({ orchestrator: extractFailures(fixture) });
    expect(s).toContain('Pre-push test gate FAILED — failing tests:');
    expect(s).toContain('@harness-engineering/orchestrator');
    expect(s).toContain('binds an ephemeral port');
    expect(s).toContain('1 failing test(s) across 1 package(s).');
  });

  it('degrades gracefully to an honest "no reports" line when empty', () => {
    const s = formatSummary({});
    expect(s).toContain('no machine-readable reports found');
    expect(s).not.toContain('failing test(s) across');
  });
});

describe('findReportPaths', () => {
  it('returns [] when the packages dir is absent (never throws)', () => {
    const empty = mkdtempSync(join(tmpdir(), 'prepush-none-'));
    expect(findReportPaths(empty)).toEqual([]);
  });

  it('discovers per-package report files', () => {
    const root = mkdtempSync(join(tmpdir(), 'prepush-'));
    mkdirSync(join(root, 'packages', 'orchestrator'), { recursive: true });
    writeFileSync(join(root, 'packages', 'orchestrator', '.vitest-report.json'), '{}');
    const found = findReportPaths(root);
    expect(found).toHaveLength(1);
    expect(found[0].pkg).toBe('orchestrator');
  });
});
