import { describe, expect, it } from 'vitest';
import {
  attributeFailure,
  matchDiff,
  pairedSourceCandidates,
  parseFailingTests,
  testKey,
  type CorrelatedRun,
  type FailingTest,
} from '../../src/ci/flake-attribution';

// Excerpts shaped exactly like `gh run view --job <id> --log` output from this
// repo's CI (job/step columns, ISO timestamps, caret-rendered ANSI).
const VITEST_LOG = [
  'build-and-test (macos-latest, 22)\tUNKNOWN STEP\t2026-11-16T15:30:57.0730420Z  ❯ tests/integration/telemetry-latency.test.ts (1 test | 1 failed) 3647ms',
  'build-and-test (macos-latest, 22)\tUNKNOWN STEP\t2026-11-16T15:30:57.0730850Z      ^[[31m×^[[39m p99 added overhead < 5 ms vs disabled-exporter baseline 3645ms',
  'build-and-test (macos-latest, 22)\tUNKNOWN STEP\t2026-11-16T15:30:57.1480730Z ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯',
  'build-and-test (macos-latest, 22)\tUNKNOWN STEP\t2026-11-16T15:30:57.1481770Z ^[[41m^[[1m FAIL ^[[22m^[[49m tests/integration/telemetry-latency.test.ts^[[2m > ^[[22mtelemetry latency budget (Phase 5 Task 14)^[[2m > ^[[22mp99 added overhead < 5 ms vs disabled-exporter baseline',
  'build-and-test (macos-latest, 22)\tUNKNOWN STEP\t2026-11-16T15:30:57.1481770Z  FAIL  tests/integration/telemetry-latency.test.ts > telemetry latency budget (Phase 5 Task 14) > p99 added overhead < 5 ms vs disabled-exporter baseline',
  // A passing test whose NAME contains "FAIL" must not be parsed as a failure.
  'build-and-test (macos-latest, 22)\tUNKNOWN STEP\t2026-11-16T15:30:42.1797100Z      ✓ measures a project it can analyse: a dead file makes health FAIL  1366ms',
].join('\n');

const TELEMETRY: FailingTest = {
  file: 'tests/integration/telemetry-latency.test.ts',
  name: 'telemetry latency budget (Phase 5 Task 14) > p99 added overhead < 5 ms vs disabled-exporter baseline',
};

function run(
  runId: number,
  branch: string,
  origin: CorrelatedRun['origin'],
  obs: CorrelatedRun['observations'][string],
  test: FailingTest = TELEMETRY
): CorrelatedRun {
  return { runId, branch, origin, observations: { [testKey(test)]: obs } };
}

describe('parseFailingTests', () => {
  it('extracts the vitest FAIL line, de-duplicated, ignoring passing tests named "FAIL"', () => {
    expect(parseFailingTests(VITEST_LOG)).toEqual([TELEMETRY]);
  });

  it('parses node:test spec-reporter failures with their file', () => {
    const log = [
      '✖ failing tests:',
      '',
      '✖ writes the ledger atomically (12.5ms)',
      '  test at file:///home/runner/work/repo/repo/packages/core/tests/ledger.test.mjs:14:3',
    ].join('\n');
    expect(parseFailingTests(log)).toEqual([
      { file: 'packages/core/tests/ledger.test.mjs', name: 'writes the ledger atomically' },
    ]);
  });

  it('parses TAP "not ok" lines by name', () => {
    expect(parseFailingTests('ok 1 - a\nnot ok 2 - b fails # time=3ms\n')).toEqual([
      { file: '', name: 'b fails' },
    ]);
  });

  it('returns nothing for a job that failed outside any test (e.g. a comprehend --check step)', () => {
    const log =
      'job\tUNKNOWN STEP\t2026-11-16T18:19:34.7763940Z x 8 source-stale unit(s): packages/cli/src/commands\n' +
      'job\tUNKNOWN STEP\t2026-11-16T18:19:34.7971520Z ##[error]Process completed with exit code 1.';
    expect(parseFailingTests(log)).toEqual([]);
  });
});

describe('matchDiff / pairedSourceCandidates', () => {
  it('maps tests/ to src/ and strips .test / .e2e', () => {
    expect(pairedSourceCandidates('tests/comprehension/comprehend-smoke.e2e.test.ts')).toEqual([
      'tests/comprehension/comprehend-smoke.ts',
      'src/comprehension/comprehend-smoke.ts',
    ]);
  });

  it('suffix-matches a package-relative test path against repo-relative PR files', () => {
    expect(
      matchDiff(TELEMETRY, [
        'packages/orchestrator/tests/integration/telemetry-latency.test.ts',
        'README.md',
      ])
    ).toEqual(['packages/orchestrator/tests/integration/telemetry-latency.test.ts']);
  });

  it('matches the paired source file', () => {
    expect(matchDiff({ file: 'src/a/b.test.ts', name: 'x' }, ['packages/core/src/a/b.ts'])).toEqual(
      ['packages/core/src/a/b.ts']
    );
  });

  it('does not match a file that merely shares a basename suffix', () => {
    expect(
      matchDiff(TELEMETRY, ['packages/x/tests/integration/other-telemetry-latency.test.ts'])
    ).toEqual([]);
  });
});

describe('attributeFailure', () => {
  it('environmental: same test failed on two unrelated PRs and main, not in diff', () => {
    const result = attributeFailure({
      failingTests: [TELEMETRY],
      prFiles: ['packages/cli/src/commands/foo.ts'],
      runs: [
        run(1, 'fix/a', 'unrelated-pr', 'failed-same'),
        run(2, 'fix/b', 'unrelated-pr', 'failed-same'),
        run(3, 'main', 'main', 'failed-same'),
        run(4, 'fix/c', 'unrelated-pr', 'passed'),
      ],
    });
    expect(result.verdict).toBe('environmental');
    expect(result.abstained).toBe(false);
    expect(result.tests[0]).toMatchObject({
      independentFailures: 3,
      mainFailures: 1,
      passedRuns: 1,
      denominator: 4,
    });
  });

  it('in-diff: the PR touches the failing test, even though it also fails elsewhere', () => {
    const result = attributeFailure({
      failingTests: [TELEMETRY],
      prFiles: ['packages/orchestrator/tests/integration/telemetry-latency.test.ts'],
      runs: [
        run(1, 'fix/a', 'unrelated-pr', 'failed-same'),
        run(2, 'fix/b', 'unrelated-pr', 'failed-same'),
      ],
    });
    expect(result.verdict).toBe('in-diff');
    expect(result.tests[0]?.diffMatches).toEqual([
      'packages/orchestrator/tests/integration/telemetry-latency.test.ts',
    ]);
  });

  it('inconclusive: a single other failure never establishes environmental', () => {
    const result = attributeFailure({
      failingTests: [TELEMETRY],
      prFiles: [],
      runs: [
        run(1, 'fix/a', 'unrelated-pr', 'failed-same'),
        run(2, 'fix/b', 'unrelated-pr', 'passed'),
      ],
    });
    expect(result.verdict).toBe('inconclusive');
    expect(result.abstained).toBe(false);
    expect(result.tests[0]?.denominator).toBe(2);
    expect(result.tests[0]?.reason).toMatch(/only 1 independent failure/);
  });

  it('counts repeated failures on ONE unrelated branch as one independent diff', () => {
    const result = attributeFailure({
      failingTests: [TELEMETRY],
      prFiles: [],
      runs: [
        run(1, 'fix/a', 'unrelated-pr', 'failed-same'),
        run(2, 'fix/a', 'unrelated-pr', 'failed-same'),
      ],
    });
    expect(result.verdict).toBe('inconclusive');
    expect(result.tests[0]?.independentFailures).toBe(1);
  });

  it('ignores same-branch reruns in the denominator', () => {
    const result = attributeFailure({
      failingTests: [TELEMETRY],
      prFiles: [],
      runs: [
        run(1, 'me', 'same-branch', 'failed-same'),
        run(2, 'me', 'same-branch', 'failed-same'),
      ],
    });
    expect(result.verdict).toBe('inconclusive');
    expect(result.abstained).toBe(true);
    expect(result.reason).toMatch(/Zero denominator/);
  });

  it('clamps minIndependentFailures to the floor of 2', () => {
    const result = attributeFailure({
      failingTests: [TELEMETRY],
      prFiles: [],
      minIndependentFailures: 1,
      runs: [run(1, 'fix/a', 'unrelated-pr', 'failed-same')],
    });
    expect(result.minIndependentFailures).toBe(2);
    expect(result.verdict).toBe('inconclusive');
  });

  it('abstains when the PR job log is unavailable (BlobNotFound)', () => {
    const result = attributeFailure({
      failingTests: [],
      prFiles: [],
      runs: [],
      logUnavailableReason: 'BlobNotFound — job logs expired',
    });
    expect(result).toMatchObject({ verdict: 'inconclusive', abstained: true });
    expect(result.reason).toMatch(/BlobNotFound/);
  });

  it('abstains when no failing test could be parsed', () => {
    const result = attributeFailure({ failingTests: [], prFiles: [], runs: [] });
    expect(result).toMatchObject({ verdict: 'inconclusive', abstained: true });
  });

  it('is inconclusive when only one of two failing tests is environmental', () => {
    const other: FailingTest = { file: 'tests/b.test.ts', name: 'b' };
    const result = attributeFailure({
      failingTests: [TELEMETRY, other],
      prFiles: [],
      runs: [
        {
          runId: 1,
          branch: 'fix/a',
          origin: 'unrelated-pr',
          observations: { [testKey(TELEMETRY)]: 'failed-same', [testKey(other)]: 'passed' },
        },
        {
          runId: 2,
          branch: 'main',
          origin: 'main',
          observations: { [testKey(TELEMETRY)]: 'failed-same', [testKey(other)]: 'passed' },
        },
      ],
    });
    expect(result.tests.map((t) => t.verdict)).toEqual(['environmental', 'inconclusive']);
    expect(result.verdict).toBe('inconclusive');
  });
});
