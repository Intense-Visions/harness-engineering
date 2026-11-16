/**
 * Cross-PR flake attribution (issue #1839).
 *
 * The `-fleet` family classifies every red check as flake-or-real. A retry that
 * happens to land green is not evidence — it is the flake's own signature. A
 * stronger and cheaper statement is available from history the CI provider
 * already holds: did the SAME test fail in the SAME job on other, unrelated
 * diffs (or on the default branch) within a recent window? If it did, and the
 * PR did not touch the test or its source, the failure is environmental. If the
 * PR touched them, it is in-diff. Otherwise there is not enough evidence and the
 * honest answer is `inconclusive` — retry only then.
 *
 * This module is the pure half: parse failing test names out of a job log,
 * decide whether a test sits inside a PR's diff, and fold per-run observations
 * into a verdict with an explicit denominator. Fetching (via `gh`) is the
 * caller's job, so the decision logic is testable without the network.
 */

/** One failing test parsed from a CI job log. */
export interface FailingTest {
  /** Test file as the runner printed it (package-relative, forward slashes). */
  file: string;
  /** Full test name, suites joined with ` > `. Empty when only the file is known. */
  name: string;
}

/** Final classification of a red check. */
export type FlakeVerdict = 'environmental' | 'in-diff' | 'inconclusive';

/** What one other run of the same job says about one failing test. */
export type RunObservation =
  /** The job failed and its log lists this test as failing. */
  | 'failed-same'
  /** The job failed, the log was read, and this test is NOT among the failures. */
  | 'failed-other'
  /** The job concluded success — the test passed or did not run. */
  | 'passed'
  /** The job failed but its log could not be read (e.g. expired: BlobNotFound). */
  | 'unknown';

/** Where another run came from, relative to the PR under attribution. */
export type RunOrigin = 'main' | 'unrelated-pr' | 'same-branch';

export interface CorrelatedRun {
  runId: number;
  /** Branch the run tested (the PR head branch, or the default branch). */
  branch: string;
  origin: RunOrigin;
  /** Per-test observation, keyed by `testKey(test)`. */
  observations: Record<string, RunObservation>;
}

export interface AttributionInput {
  /** Failing tests parsed from the PR's own failing job log. */
  failingTests: FailingTest[];
  /** Files changed by the PR (`gh pr view --json files`), repo-relative. */
  prFiles: string[];
  /** Other runs of the same job inside the window. */
  runs: CorrelatedRun[];
  /**
   * Minimum number of DISTINCT unrelated diffs (unrelated PR branches + main)
   * that must have failed the same test before `environmental` may be claimed.
   * Clamped to at least 2 — one other failure is an anecdote, not a pattern.
   */
  minIndependentFailures?: number;
  /** Set when the PR's own job log could not be read; the verdict abstains. */
  logUnavailableReason?: string;
}

export interface TestAttribution {
  test: FailingTest;
  verdict: FlakeVerdict;
  /** Whether the test file, or its paired source file, is in the PR's diff. */
  inDiff: boolean;
  /** PR files that matched the test or its source. */
  diffMatches: string[];
  /** Distinct unrelated branches (main counts as one) that failed the same test. */
  independentFailures: number;
  /** Runs (unrelated PRs + main) where this test failed. */
  failedRuns: number;
  /** Runs (unrelated PRs + main) where the job was green. */
  passedRuns: number;
  /** Runs (unrelated PRs + main) where the job failed for a different reason. */
  failedOtherRuns: number;
  /** Runs (unrelated PRs + main) whose log could not be read. */
  unknownRuns: number;
  /** Main-branch runs where this test failed. */
  mainFailures: number;
  /** Runs examined (unrelated PRs + main) — the denominator. */
  denominator: number;
  reason: string;
}

export interface AttributionResult {
  verdict: FlakeVerdict;
  /** True when no verdict could be reached from evidence (inconclusive by abstention). */
  abstained: boolean;
  minIndependentFailures: number;
  tests: TestAttribution[];
  reason: string;
}

/** The floor for `minIndependentFailures` — never claim environmental on one sample. */
export const MIN_INDEPENDENT_FAILURES_FLOOR = 2;

/* eslint-disable no-control-regex -- stripping terminal escape sequences is the point */
/** ANSI CSI sequences, both raw (ESC) and caret-rendered (`^[`) as `gh` may print them. */
const ANSI_PATTERN = /(?:\u001b|\^\[)\[[0-9;?]*[A-Za-z]/g;
/* eslint-enable no-control-regex */

/** Leading `gh run view --log` columns + an ISO timestamp, if present. */
const GH_LOG_PREFIX =
  /^(?:[^\t]*\t[^\t]*\t)?\s*(?:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?)?/;

/** Test-file suffixes the vitest/jest/node:test runners use. */
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** Stable identity used to correlate the same test across runs. */
export function testKey(test: FailingTest): string {
  return test.name ? `${test.file} > ${test.name}` : test.file;
}

/** Strip ANSI and `gh` log-column/timestamp prefixes from one log line. */
export function cleanLogLine(line: string): string {
  return line.replace(ANSI_PATTERN, '').replace(GH_LOG_PREFIX, '');
}

/**
 * Parse failing tests out of a CI job log.
 *
 * Recognised shapes:
 * - vitest / jest summary: ` FAIL  tests/a.test.ts > suite > name`
 * - node:test spec reporter: `test at tests/a.test.ts:12:3` following `✖ name`
 * - TAP (node:test `--test-reporter=tap`): `not ok 3 - name` with a `# Subtest`/
 *   `location: 'file:line'` hint when present
 *
 * Results are de-duplicated (vitest prints each FAIL twice on some reporters).
 */
export function parseFailingTests(log: string): FailingTest[] {
  const seen = new Map<string, FailingTest>();
  const state: NodeTestState = { pending: null };
  for (const raw of log.split(/\r?\n/)) {
    const test = parseFailLine(cleanLogLine(raw), state);
    if (test && !seen.has(testKey(test))) seen.set(testKey(test), test);
  }
  return [...seen.values()];
}

/** node:test prints the failing name on one line and its location on the next. */
interface NodeTestState {
  pending: string | null;
}

function makeTest(file: string, name: string): FailingTest {
  return { file: normalizePath(file.trim()), name: name.trim() };
}

/** vitest / jest: ` FAIL  file > suite > name` (jest prints ` FAIL  file` alone). */
function parseVitestFail(line: string): FailingTest | null {
  const m = /^\s*FAIL\s{1,2}(\S+)(?:\s+>\s+(.*))?$/.exec(line);
  if (!m?.[1] || !TEST_FILE.test(m[1])) return null;
  return makeTest(m[1], (m[2] ?? '').replace(/\s+\[[^\]]*\]$/, ''));
}

const NODE_TEST_CROSS = /^\s*✖\s+(.+?)(?:\s+\([\d.]+m?s\))?$/;
const NODE_TEST_AT = /^\s*test at (?:file:\/\/)?(.+?):\d+:\d+\s*$/;

/** node:test spec reporter: `✖ name (12.3ms)` then `test at file:line:col`. */
function parseNodeTestFail(line: string, state: NodeTestState): FailingTest | null {
  const name = NODE_TEST_CROSS.exec(line)?.[1];
  if (name !== undefined) {
    state.pending = /^failing tests:?$/i.test(name) ? null : name;
    return null;
  }
  return state.pending ? takeNodeTestLocation(line, state) : null;
}

function takeNodeTestLocation(line: string, state: NodeTestState): FailingTest | null {
  const file = NODE_TEST_AT.exec(line)?.[1];
  if (file === undefined || state.pending === null) return null;
  const test = makeTest(stripToRepoRelative(file), state.pending);
  state.pending = null;
  return test;
}

/** TAP: `not ok 3 - name` — the file is unknown, so the test is keyed by name alone. */
function parseTapFail(line: string): FailingTest | null {
  const m = /^\s*not ok \d+ - (.+?)(?:\s+#.*)?$/.exec(line);
  return m?.[1] ? makeTest('', m[1]) : null;
}

function parseFailLine(line: string, state: NodeTestState): FailingTest | null {
  return parseVitestFail(line) ?? parseNodeTestFail(line, state) ?? parseTapFail(line);
}

/** Trim an absolute CI path down to the part after `packages/` or the repo root. */
function stripToRepoRelative(p: string): string {
  const n = normalizePath(p);
  const idx = n.search(/(?:^|\/)(?:packages|apps|libs|tests?|src)\//);
  if (idx < 0) return n;
  return n.slice(n[idx] === '/' ? idx + 1 : idx);
}

/** Candidate source files a test file most plausibly exercises. */
export function pairedSourceCandidates(testFile: string): string[] {
  const f = normalizePath(testFile);
  const stripped = f
    .replace(/\.(?:test|spec|e2e)(?=\.[cm]?[jt]sx?$)/, '')
    .replace(/\.e2e(?=\.)/, '');
  if (stripped === f) return [];
  const out = new Set<string>([stripped]);
  // tests/x/foo.test.ts -> src/x/foo.ts (the repo's tests/ <-> src/ mirror).
  if (/(?:^|\/)tests?\//.test(stripped)) {
    out.add(stripped.replace(/(^|\/)tests?\//, '$1src/'));
  }
  return [...out];
}

function pathMatches(prFile: string, rel: string): boolean {
  if (!rel) return false;
  const a = normalizePath(prFile);
  const b = normalizePath(rel);
  return a === b || a.endsWith(`/${b}`);
}

/**
 * Whether a failing test is inside the PR's diff: the test file itself, or its
 * paired source, was changed. Matching is suffix-based because runners print
 * package-relative paths while `gh pr view --json files` is repo-relative; an
 * ambiguous suffix errs toward `in-diff`, the direction that never wrongly
 * excuses a failure as environmental.
 */
export function matchDiff(test: FailingTest, prFiles: string[]): string[] {
  const targets = [test.file, ...pairedSourceCandidates(test.file)].filter(Boolean);
  return prFiles.filter((f) => targets.some((t) => pathMatches(f, t)));
}

function attributeOne(
  test: FailingTest,
  input: AttributionInput,
  minIndependent: number
): TestAttribution {
  const key = testKey(test);
  const diffMatches = matchDiff(test, input.prFiles);
  const inDiff = diffMatches.length > 0;
  const independentBranches = new Set<string>();
  let failedRuns = 0;
  let passedRuns = 0;
  let failedOtherRuns = 0;
  let unknownRuns = 0;
  let mainFailures = 0;
  let denominator = 0;

  for (const run of input.runs) {
    if (run.origin === 'same-branch') continue;
    const obs = run.observations[key];
    if (!obs) continue;
    denominator++;
    if (obs === 'failed-same') {
      failedRuns++;
      independentBranches.add(run.origin === 'main' ? '\u0000main' : run.branch);
      if (run.origin === 'main') mainFailures++;
    } else if (obs === 'passed') passedRuns++;
    else if (obs === 'failed-other') failedOtherRuns++;
    else unknownRuns++;
  }

  const independentFailures = independentBranches.size;
  const tally =
    `${independentFailures} independent diff(s) failed it (${mainFailures} on main), ` +
    `${passedRuns} green, ${failedOtherRuns} red for another reason, ${unknownRuns} unreadable — ` +
    `denominator ${denominator}`;

  let verdict: FlakeVerdict;
  let reason: string;
  if (inDiff) {
    verdict = 'in-diff';
    reason = `The PR changes ${diffMatches.join(', ')}; ${tally}.`;
  } else if (independentFailures >= minIndependent) {
    verdict = 'environmental';
    reason = `Not in the diff and ${tally} (threshold ${minIndependent}).`;
  } else {
    verdict = 'inconclusive';
    reason =
      denominator === 0
        ? 'No other run of this job in the window — zero denominator, nothing to correlate.'
        : `Not in the diff, but only ${independentFailures} independent failure(s) (threshold ${minIndependent}); ${tally}.`;
  }

  return {
    test,
    verdict,
    inDiff,
    diffMatches,
    independentFailures,
    failedRuns,
    passedRuns,
    failedOtherRuns,
    unknownRuns,
    mainFailures,
    denominator,
    reason,
  };
}

/**
 * Fold per-run observations into a verdict.
 *
 * - `in-diff` if ANY failing test (or its source) is in the PR's diff — the PR
 *   plausibly caused it, whatever else is failing elsewhere.
 * - `environmental` only if EVERY failing test failed on at least
 *   `minIndependentFailures` (≥ 2) distinct unrelated diffs or main.
 * - `inconclusive` otherwise, including the abstentions: the PR's log could not
 *   be read, or no failing test could be parsed from it.
 */
export function attributeFailure(input: AttributionInput): AttributionResult {
  const minIndependentFailures = Math.max(
    MIN_INDEPENDENT_FAILURES_FLOOR,
    Math.floor(input.minIndependentFailures ?? MIN_INDEPENDENT_FAILURES_FLOOR)
  );
  const abstain = (reason: string): AttributionResult => ({
    verdict: 'inconclusive',
    abstained: true,
    minIndependentFailures,
    tests: [],
    reason,
  });

  if (input.logUnavailableReason) {
    return abstain(
      `Abstained: the failing job's log could not be read (${input.logUnavailableReason}).`
    );
  }
  if (input.failingTests.length === 0) {
    return abstain(
      'Abstained: no failing test names could be parsed from the job log (the job may have failed outside a test step).'
    );
  }

  const tests = input.failingTests.map((t) => attributeOne(t, input, minIndependentFailures));
  return { minIndependentFailures, tests, ...combineVerdicts(tests, minIndependentFailures) };
}

/** Fold per-test verdicts: any in-diff wins, environmental needs all, else inconclusive. */
function combineVerdicts(
  tests: TestAttribution[],
  minIndependentFailures: number
): Pick<AttributionResult, 'verdict' | 'abstained' | 'reason'> {
  const inDiff = tests.filter((t) => t.verdict === 'in-diff').length;
  if (inDiff > 0) {
    return {
      verdict: 'in-diff',
      abstained: false,
      reason: `${inDiff} of ${tests.length} failing test(s) are in the PR's diff — treat as a real failure.`,
    };
  }
  if (tests.every((t) => t.verdict === 'environmental')) {
    return {
      verdict: 'environmental',
      abstained: false,
      reason: `All ${tests.length} failing test(s) also failed on ≥${minIndependentFailures} unrelated diffs or main and are outside the PR's diff.`,
    };
  }
  const noDenominator = tests.every((t) => t.denominator === 0);
  return {
    verdict: 'inconclusive',
    abstained: noDenominator,
    reason: noDenominator
      ? 'Zero denominator: no other run of this job in the window to correlate against.'
      : 'Insufficient cross-PR evidence for at least one failing test — a single retry is the remaining tool.',
  };
}
