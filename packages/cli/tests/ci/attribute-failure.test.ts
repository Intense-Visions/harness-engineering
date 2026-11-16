import { describe, expect, it, vi } from 'vitest';
import {
  attributePrFailure,
  describeLogFailure,
  type GhRunner,
} from '../../src/ci/attribute-failure';
import { runAttributeFailure } from '../../src/commands/ci/attribute-failure';

/**
 * Fake `gh`: routes by argv to canned responses. Every call is recorded so a
 * test can assert what was (and was not) fetched. No network is ever touched.
 */
const REPO = 'acme/widgets';
const JOB = 'build-and-test (macos-latest, 22)';
const TEST_FILE = 'tests/integration/telemetry-latency.test.ts';
const TEST_NAME = 'telemetry latency budget > p99 added overhead < 5 ms';

function failLog(file = TEST_FILE, name = TEST_NAME): string {
  return [
    `${JOB}\tUNKNOWN STEP\t2026-11-16T15:30:57.0730420Z  ❯ ${file} (1 test | 1 failed) 3647ms`,
    `${JOB}\tUNKNOWN STEP\t2026-11-16T15:30:57.1481770Z ^[[41m^[[1m FAIL ^[[22m^[[49m ${file}^[[2m > ^[[22m${name}`,
    `${JOB}\tUNKNOWN STEP\t2026-11-16T15:30:58.0000000Z ##[error]Process completed with exit code 1.`,
  ].join('\n');
}

interface OtherRun {
  id: number;
  branch: string;
  event?: string;
  conclusion: 'success' | 'failure' | 'cancelled';
  jobId: number;
  createdAt?: string;
  /** Log for a failed job; `null` = BlobNotFound. */
  log?: string | null;
}

interface Fixture {
  prFiles?: string[];
  ownLog?: string | null;
  others?: OtherRun[];
}

function fakeGh(fx: Fixture): { gh: GhRunner; calls: string[][] } {
  const calls: string[][] = [];
  const ok = (v: unknown) => ({
    code: 0,
    stdout: typeof v === 'string' ? v : JSON.stringify(v),
    stderr: '',
  });
  const blob = {
    code: 1,
    stdout: '',
    stderr: 'failed to get run log: HTTP 404: BlobNotFound: The specified blob does not exist.',
  };
  const gh: GhRunner = async (args) => {
    calls.push(args);
    const a = args.join(' ');
    if (a === `api repos/${REPO}`) return ok({ full_name: REPO, default_branch: 'main' });
    if (a.startsWith(`pr view 42 --repo ${REPO}`)) {
      return ok({
        headRefName: 'feat/mine',
        headRefOid: 'a'.repeat(40),
        files: (fx.prFiles ?? ['packages/cli/src/unrelated.ts']).map((path) => ({ path })),
        statusCheckRollup: [
          {
            __typename: 'CheckRun',
            name: JOB,
            conclusion: 'FAILURE',
            detailsUrl: `https://github.com/${REPO}/actions/runs/100/job/1000`,
          },
          {
            __typename: 'CheckRun',
            name: 'lint',
            conclusion: 'SUCCESS',
            detailsUrl: `https://github.com/${REPO}/actions/runs/100/job/1001`,
          },
        ],
      });
    }
    if (a === `api repos/${REPO}/actions/jobs/1000`) {
      return ok({
        id: 1000,
        name: JOB,
        run_id: 100,
        started_at: '2026-11-15T12:00:00Z',
        workflow_name: 'CI',
        conclusion: 'failure',
        steps: [{ name: 'Test', conclusion: 'failure' }],
      });
    }
    if (a === `api repos/${REPO}/actions/runs/100`)
      return ok({ id: 100, head_branch: 'feat/mine', event: 'pull_request', workflow_id: 7 });
    if (a.startsWith(`api repos/${REPO}/actions/workflows/7/runs?`)) {
      return ok({
        workflow_runs: [
          { id: 100, head_branch: 'feat/mine', event: 'pull_request', workflow_id: 7 },
          ...(fx.others ?? []).map((o) => ({
            id: o.id,
            head_branch: o.branch,
            event: o.event ?? 'pull_request',
            workflow_id: 7,
            created_at: o.createdAt ?? '2026-11-15T12:05:00Z',
          })),
        ],
      });
    }
    const runJobs = /^api repos\/acme\/widgets\/actions\/runs\/(\d+)\/jobs/.exec(a);
    if (runJobs) {
      const o = (fx.others ?? []).find((x) => x.id === Number(runJobs[1]));
      return ok({
        jobs: o
          ? [{ id: o.jobId, name: JOB, run_id: o.id, run_attempt: 1, conclusion: o.conclusion }]
          : [],
      });
    }
    const logFor = /^run view --repo acme\/widgets --job (\d+) --log$/.exec(a);
    if (logFor) {
      const id = Number(logFor[1]);
      if (id === 1000) return fx.ownLog === null ? blob : ok(fx.ownLog ?? failLog());
      const o = (fx.others ?? []).find((x) => x.jobId === id);
      if (!o || o.log === null) return blob;
      return ok(o.log ?? failLog());
    }
    return { code: 1, stdout: '', stderr: `fake gh: unrouted ${a}` };
  };
  return { gh, calls };
}

const OPTS = {
  pr: 42,
  repo: REPO,
  windowHours: 24,
  maxRuns: 40,
  maxLogs: 15,
  minIndependentFailures: 2,
  now: new Date('2026-11-16T20:00:00Z'),
};

describe('attributePrFailure (fake gh)', () => {
  it('environmental: the same test failed on two unrelated PRs and on main', async () => {
    const { gh } = fakeGh({
      others: [
        { id: 201, branch: 'fix/a', conclusion: 'failure', jobId: 2010 },
        { id: 202, branch: 'fix/b', conclusion: 'failure', jobId: 2020 },
        { id: 203, branch: 'main', event: 'push', conclusion: 'failure', jobId: 2030 },
        { id: 204, branch: 'fix/c', conclusion: 'success', jobId: 2040 },
      ],
    });
    const report = await attributePrFailure(gh, OPTS);
    expect(report.verdict).toBe('environmental');
    expect(report.abstained).toBe(false);
    const t = report.jobs[0]!.result.tests[0]!;
    expect(t).toMatchObject({
      independentFailures: 3,
      mainFailures: 1,
      passedRuns: 1,
      denominator: 4,
    });
  });

  it('in-diff: the PR changes the failing test, even though it failed elsewhere too', async () => {
    const { gh } = fakeGh({
      prFiles: [`packages/orchestrator/${TEST_FILE}`],
      others: [
        { id: 201, branch: 'fix/a', conclusion: 'failure', jobId: 2010 },
        { id: 202, branch: 'fix/b', conclusion: 'failure', jobId: 2020 },
      ],
    });
    const report = await attributePrFailure(gh, OPTS);
    expect(report.verdict).toBe('in-diff');
    expect(report.jobs[0]!.result.tests[0]!.diffMatches).toEqual([
      `packages/orchestrator/${TEST_FILE}`,
    ]);
  });

  it('inconclusive: one unrelated failure plus greens is below the floor, denominator reported', async () => {
    const { gh } = fakeGh({
      others: [
        { id: 201, branch: 'fix/a', conclusion: 'failure', jobId: 2010 },
        { id: 202, branch: 'fix/b', conclusion: 'success', jobId: 2020 },
        {
          id: 203,
          branch: 'fix/c',
          conclusion: 'failure',
          jobId: 2030,
          log: failLog('tests/other.test.ts', 'x'),
        },
        { id: 204, branch: 'feat/mine', conclusion: 'failure', jobId: 2040 },
      ],
    });
    const report = await attributePrFailure(gh, OPTS);
    expect(report.verdict).toBe('inconclusive');
    expect(report.abstained).toBe(false);
    const t = report.jobs[0]!.result.tests[0]!;
    // same-branch run 204 is excluded from the denominator.
    expect(t).toMatchObject({
      independentFailures: 1,
      passedRuns: 1,
      failedOtherRuns: 1,
      denominator: 3,
    });
  });

  it('inconclusive + abstained: zero other runs in the window', async () => {
    const { gh } = fakeGh({ others: [] });
    const report = await attributePrFailure(gh, OPTS);
    expect(report).toMatchObject({ verdict: 'inconclusive', abstained: true });
    expect(report.jobs[0]!.result.tests[0]!.denominator).toBe(0);
  });

  it('BlobNotFound on the PR’s own log: abstains honestly and fetches nothing else', async () => {
    const { gh, calls } = fakeGh({
      ownLog: null,
      others: [{ id: 201, branch: 'fix/a', conclusion: 'failure', jobId: 2010 }],
    });
    const report = await attributePrFailure(gh, OPTS);
    expect(report).toMatchObject({ verdict: 'inconclusive', abstained: true });
    expect(report.jobs[0]!.log).toBe('unavailable');
    expect(report.jobs[0]!.logError).toMatch(/BlobNotFound/);
    expect(calls.some((c) => c.join(' ').includes('/workflows/7/runs'))).toBe(false);
  });

  it('BlobNotFound on another run’s log counts as unreadable, never as a failure', async () => {
    const { gh } = fakeGh({
      others: [
        { id: 201, branch: 'fix/a', conclusion: 'failure', jobId: 2010 },
        { id: 202, branch: 'fix/b', conclusion: 'failure', jobId: 2020, log: null },
        { id: 203, branch: 'fix/c', conclusion: 'failure', jobId: 2030, log: null },
      ],
    });
    const report = await attributePrFailure(gh, OPTS);
    expect(report.verdict).toBe('inconclusive');
    const t = report.jobs[0]!.result.tests[0]!;
    expect(t).toMatchObject({ independentFailures: 1, unknownRuns: 2, denominator: 3 });
    expect(report.jobs[0]!.examinedRuns.filter((r) => r.log === 'unavailable')).toHaveLength(2);
  });

  it('a job that failed outside any test step abstains with its failing step named', async () => {
    const { gh } = fakeGh({
      ownLog: `${JOB}\tUNKNOWN STEP\t2026-11-16T15:30:58Z x 8 source-stale unit(s)`,
    });
    const report = await attributePrFailure(gh, OPTS);
    expect(report).toMatchObject({ verdict: 'inconclusive', abstained: true });
    expect(report.jobs[0]!.failingSteps).toEqual(['Test']);
  });

  it('respects the --max-logs budget: unfetched failures are unknown, not failures', async () => {
    const { gh, calls } = fakeGh({
      others: [
        { id: 201, branch: 'fix/a', conclusion: 'failure', jobId: 2010 },
        { id: 202, branch: 'fix/b', conclusion: 'failure', jobId: 2020 },
      ],
    });
    const report = await attributePrFailure(gh, { ...OPTS, maxLogs: 1 });
    expect(calls.filter((c) => c[0] === 'run' && c[1] === 'view')).toHaveLength(2); // own + 1
    expect(report.jobs[0]!.result.tests[0]).toMatchObject({
      independentFailures: 1,
      unknownRuns: 1,
    });
    expect(report.verdict).toBe('inconclusive');
  });
});

describe('correlation window', () => {
  it('centres the window on the failing job (not now) and examines the nearest runs first', async () => {
    const { gh, calls } = fakeGh({
      others: [
        {
          id: 301,
          branch: 'fix/far',
          conclusion: 'success',
          jobId: 3010,
          createdAt: '2026-11-16T10:00:00Z',
        },
        {
          id: 302,
          branch: 'fix/near',
          conclusion: 'failure',
          jobId: 3020,
          createdAt: '2026-11-15T12:07:00Z',
        },
      ],
    });
    const report = await attributePrFailure(gh, { ...OPTS, maxRuns: 1 });
    const listing = calls.map((c) => c.join(' ')).find((c) => c.includes('/workflows/7/runs?'));
    // started_at 2026-11-15T12:00Z ± 24h — anchored on the failure, not on now (2026-11-16T20:00Z).
    expect(listing).toContain('created=2026-11-14T12:00:00Z..2026-11-16T12:00:00Z');
    expect(report.jobs[0]!.examinedRuns.map((r) => r.runId)).toEqual([302]);
  });
});

describe('describeLogFailure', () => {
  it.each([
    'HTTP 404: BlobNotFound: The specified blob does not exist.',
    'HTTP 410: Gone',
    'log not found: 123',
  ])('names expiry for %s', (stderr) => {
    expect(describeLogFailure(stderr)).toMatch(/^BlobNotFound/);
  });

  it('passes other errors through', () => {
    expect(describeLogFailure('HTTP 403: rate limited\nmore')).toBe('HTTP 403: rate limited');
  });
});

describe('runAttributeFailure (exit codes + JSON)', () => {
  const cli = {
    pr: '42',
    repo: REPO,
    windowHours: '24',
    maxRuns: '40',
    maxLogs: '15',
    minFailures: '2',
  };

  it('exits 0 with a JSON report on a reached verdict', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { gh } = fakeGh({
      others: [
        { id: 201, branch: 'fix/a', conclusion: 'failure', jobId: 2010 },
        { id: 203, branch: 'main', event: 'push', conclusion: 'failure', jobId: 2030 },
      ],
    });
    const code = await runAttributeFailure(cli, { json: true }, gh);
    const out = JSON.parse(String(log.mock.calls[0]?.[0])) as { verdict: string };
    log.mockRestore();
    expect(code).toBe(0);
    expect(out.verdict).toBe('environmental');
  });

  it('exits 3 (zero denominator) when it abstains', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { gh } = fakeGh({ ownLog: null });
    const code = await runAttributeFailure(cli, { json: true }, gh);
    log.mockRestore();
    expect(code).toBe(3);
  });

  it('exits 2 on a bad --pr', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { gh } = fakeGh({});
    const code = await runAttributeFailure({ ...cli, pr: 'abc' }, { json: true }, gh);
    log.mockRestore();
    expect(code).toBe(2);
  });
});
