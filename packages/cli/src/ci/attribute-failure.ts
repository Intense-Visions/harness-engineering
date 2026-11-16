/**
 * Gatherer for `harness ci attribute-failure` (issue #1839).
 *
 * Collects the cross-PR evidence the pure core classifier
 * (`attributeFailure` in `@harness-engineering/core`) needs: the failing job's
 * own log, the PR's changed files, and the same job's other runs — unrelated
 * PRs and the default branch — inside a time window. Every GitHub call goes
 * through an injected {@link GhRunner}, so tests drive it with a fake and never
 * touch the network.
 */
import { execFile } from 'node:child_process';
import {
  attributeFailure,
  parseFailingTests,
  testKey,
  type AttributionResult,
  type CorrelatedRun,
  type FailingTest,
  type FlakeVerdict,
  type RunObservation,
  type RunOrigin,
} from '@harness-engineering/core';

export interface GhResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs `gh <args>`; resolves (never rejects) with the exit code and output. */
export type GhRunner = (args: string[]) => Promise<GhResult>;

/** The real runner: `gh` on PATH, no shell, large buffer for job logs. */
export const execGh: GhRunner = (args) =>
  new Promise((resolve) => {
    execFile(
      'gh',
      args,
      { encoding: 'utf-8', maxBuffer: 512 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const raw = (error as { code?: unknown } | null)?.code;
        const code = !error ? 0 : typeof raw === 'number' ? raw : 1;
        resolve({ code, stdout: String(stdout), stderr: String(stderr || error?.message || '') });
      }
    );
  });

export interface AttributeFailureOptions {
  pr: number;
  /** Restrict to failing checks whose name contains this string. */
  job?: string;
  /** Attribute this specific job id (e.g. a superseded attempt) instead of the PR's current failing checks. */
  jobId?: number;
  /** `owner/repo`; resolved from the current directory when omitted. */
  repo?: string;
  /**
   * Correlation window half-width in hours, centred on the failing job's start
   * (clipped at now). Centring matters: on a busy repo the most recent runs are
   * not the ones that shared the failure's environment.
   */
  windowHours: number;
  /** Most recent other runs of the workflow to examine. */
  maxRuns: number;
  /** Cap on failed-job logs fetched for correlation (each is megabytes). */
  maxLogs: number;
  minIndependentFailures: number;
  now?: Date;
}

export interface ExaminedRun {
  runId: number;
  attempt: number;
  branch: string;
  origin: RunOrigin;
  conclusion: string;
  /** `read`, `unavailable` (fetch failed), `skipped` (log budget spent), or `not-needed` (green). */
  log: 'read' | 'unavailable' | 'skipped' | 'not-needed';
}

export interface JobAttribution {
  jobId: number;
  jobName: string;
  runId: number;
  workflow: string;
  failingSteps: string[];
  log: 'read' | 'unavailable';
  logError?: string;
  failingTests: FailingTest[];
  examinedRuns: ExaminedRun[];
  result: AttributionResult;
}

export interface AttributeFailureReport {
  repo: string;
  pr: number;
  branch: string;
  headSha: string;
  /** Half-width of the correlation window, in hours, around each failing job's start. */
  windowHours: number;
  verdict: FlakeVerdict;
  abstained: boolean;
  jobs: JobAttribution[];
  reason: string;
}

export class AttributeFailureError extends Error {}

const FAILING_CONCLUSIONS = new Set(['FAILURE', 'TIMED_OUT', 'STARTUP_FAILURE']);

async function ghJson<T>(gh: GhRunner, args: string[], what: string): Promise<T> {
  const res = await gh(args);
  if (res.code !== 0) {
    throw new AttributeFailureError(
      `${what} failed: ${res.stderr.trim() || `gh exited ${res.code}`}`
    );
  }
  try {
    return JSON.parse(res.stdout) as T;
  } catch {
    throw new AttributeFailureError(`${what} returned unparseable JSON`);
  }
}

/** Describe a log-fetch failure; GitHub log blobs expire (BlobNotFound / HTTP 410). */
export function describeLogFailure(stderr: string): string {
  const s = stderr.trim();
  if (/BlobNotFound|HTTP 410|\bGone\b|log not found|logs? (?:have|has) expired/i.test(s)) {
    return `BlobNotFound — the job log has expired or was deleted${s ? ` (${s.split('\n')[0]})` : ''}`;
  }
  return s.split('\n')[0] || 'log fetch failed';
}

async function fetchLog(
  gh: GhRunner,
  repo: string,
  jobId: number
): Promise<{ ok: true; log: string } | { ok: false; error: string }> {
  const res = await gh(['run', 'view', '--repo', repo, '--job', String(jobId), '--log']);
  if (res.code !== 0 || res.stdout.length === 0) {
    return { ok: false, error: describeLogFailure(res.stderr) };
  }
  return { ok: true, log: res.stdout };
}

interface PrView {
  headRefName: string;
  headRefOid: string;
  files?: Array<{ path: string }>;
  statusCheckRollup?: Array<{
    __typename?: string;
    name?: string;
    conclusion?: string | null;
    detailsUrl?: string;
  }>;
}

interface ApiJob {
  id: number;
  name: string;
  run_id: number;
  run_attempt?: number;
  head_branch?: string;
  conclusion: string | null;
  started_at?: string | null;
  workflow_name?: string;
  steps?: Array<{ name: string; conclusion: string | null }>;
}

interface ApiRun {
  id: number;
  head_branch: string;
  event: string;
  workflow_id: number;
  created_at?: string;
}

function jobIdFromUrl(url: string | undefined): number | null {
  const m = /\/job\/(\d+)/.exec(url ?? '');
  return m && m[1] ? Number(m[1]) : null;
}

const MAX_LISTING_PAGES = 5;

function isoSeconds(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Other runs of the same workflow within ±windowHours of the failing job's
 * start, nearest in time first, capped at `maxRuns`.
 */
async function listNearbyRuns(
  gh: GhRunner,
  ctx: { repo: string; now: Date },
  workflowId: number,
  job: ApiJob,
  opts: AttributeFailureOptions
): Promise<ApiRun[]> {
  const anchor = job.started_at ? new Date(job.started_at) : ctx.now;
  const half = opts.windowHours * 3600_000;
  const from = new Date(anchor.getTime() - half);
  const to = new Date(Math.min(ctx.now.getTime(), anchor.getTime() + half));
  const range = `${isoSeconds(from)}..${isoSeconds(to)}`;
  const all: ApiRun[] = [];
  for (let page = 1; page <= MAX_LISTING_PAGES; page++) {
    const listing = await ghJson<{ workflow_runs?: ApiRun[] }>(
      gh,
      [
        'api',
        `repos/${ctx.repo}/actions/workflows/${workflowId}/runs?created=${range}&per_page=100&page=${page}`,
      ],
      'workflow run listing'
    );
    const batch = listing.workflow_runs ?? [];
    all.push(...batch);
    if (batch.length < 100) break;
  }
  const distance = (r: ApiRun): number =>
    r.created_at
      ? Math.abs(new Date(r.created_at).getTime() - anchor.getTime())
      : Number.MAX_SAFE_INTEGER;
  return all
    .filter((r) => r.id !== job.run_id)
    .sort((a, b) => distance(a) - distance(b))
    .slice(0, Math.max(0, opts.maxRuns));
}

function classifyOrigin(run: ApiRun, prBranch: string, defaultBranch: string): RunOrigin {
  if (run.head_branch === prBranch) return 'same-branch';
  if (run.head_branch === defaultBranch && run.event !== 'pull_request') return 'main';
  return 'unrelated-pr';
}

function observationsFor(
  tests: FailingTest[],
  fill: (key: string) => RunObservation
): Record<string, RunObservation> {
  const out: Record<string, RunObservation> = {};
  for (const t of tests) out[testKey(t)] = fill(testKey(t));
  return out;
}

async function listRunJobs(gh: GhRunner, repo: string, runId: number): Promise<ApiJob[]> {
  const res = await gh(['api', `repos/${repo}/actions/runs/${runId}/jobs?filter=all&per_page=100`]);
  if (res.code !== 0) return [];
  try {
    return (JSON.parse(res.stdout) as { jobs?: ApiJob[] }).jobs ?? [];
  } catch {
    return [];
  }
}

/**
 * What one attempt of the same job says about the failing tests, or `null`
 * when its conclusion carries no signal (cancelled / skipped / in progress).
 * Failed jobs cost a log fetch, bounded by the shared `budget`.
 */
async function observeJob(
  gh: GhRunner,
  repo: string,
  j: ApiJob,
  origin: RunOrigin,
  failingTests: FailingTest[],
  budget: { logsLeft: number }
): Promise<{ log: ExaminedRun['log']; observe: (key: string) => RunObservation } | null> {
  if (j.conclusion === 'success') return { log: 'not-needed', observe: () => 'passed' };
  if (j.conclusion !== 'failure' && j.conclusion !== 'timed_out') return null;
  if (origin === 'same-branch' || budget.logsLeft === 0) {
    return { log: 'skipped', observe: () => 'unknown' };
  }
  budget.logsLeft--;
  const other = await fetchLog(gh, repo, j.id);
  if (!other.ok) return { log: 'unavailable', observe: () => 'unknown' };
  const theirs = new Set(parseFailingTests(other.log).map(testKey));
  const ours = new Set(failingTests.map(testKey));
  return {
    log: 'read',
    observe: (k) => (theirs.has(k) && ours.has(k) ? 'failed-same' : 'failed-other'),
  };
}

async function attributeJob(
  gh: GhRunner,
  ctx: { repo: string; prBranch: string; defaultBranch: string; prFiles: string[]; now: Date },
  jobId: number,
  opts: AttributeFailureOptions
): Promise<JobAttribution> {
  const job = await ghJson<ApiJob>(
    gh,
    ['api', `repos/${ctx.repo}/actions/jobs/${jobId}`],
    `job ${jobId} lookup`
  );
  const ownRun = await ghJson<ApiRun>(
    gh,
    ['api', `repos/${ctx.repo}/actions/runs/${job.run_id}`],
    `run ${job.run_id} lookup`
  );
  const failingSteps = (job.steps ?? [])
    .filter((s) => s.conclusion === 'failure')
    .map((s) => s.name);

  const own = await fetchLog(gh, ctx.repo, jobId);
  const failingTests = own.ok ? parseFailingTests(own.log) : [];
  const base: Omit<JobAttribution, 'result' | 'examinedRuns'> = {
    jobId,
    jobName: job.name,
    runId: job.run_id,
    workflow: job.workflow_name ?? '',
    failingSteps,
    log: own.ok ? 'read' : 'unavailable',
    ...(own.ok ? {} : { logError: own.error }),
    failingTests,
  };

  if (!own.ok || failingTests.length === 0) {
    const result = attributeFailure({
      failingTests,
      prFiles: ctx.prFiles,
      runs: [],
      minIndependentFailures: opts.minIndependentFailures,
      ...(own.ok ? {} : { logUnavailableReason: own.error }),
    });
    return { ...base, examinedRuns: [], result };
  }

  const others = await listNearbyRuns(gh, ctx, ownRun.workflow_id, job, opts);

  const runs: CorrelatedRun[] = [];
  const examinedRuns: ExaminedRun[] = [];
  const budget = { logsLeft: Math.max(0, opts.maxLogs) };

  for (const run of others) {
    const origin = classifyOrigin(run, ctx.prBranch, ctx.defaultBranch);
    const jobs = await listRunJobs(gh, ctx.repo, run.id);
    for (const j of jobs.filter((x) => x.name === job.name)) {
      const seen = await observeJob(gh, ctx.repo, j, origin, failingTests, budget);
      if (!seen) continue; // cancelled / skipped / still running say nothing about the test.
      examinedRuns.push({
        runId: run.id,
        attempt: j.run_attempt ?? 1,
        branch: run.head_branch,
        origin,
        conclusion: j.conclusion ?? 'pending',
        log: seen.log,
      });
      runs.push({
        runId: run.id,
        branch: run.head_branch,
        origin,
        observations: observationsFor(failingTests, seen.observe),
      });
    }
  }

  const result = attributeFailure({
    failingTests,
    prFiles: ctx.prFiles,
    runs,
    minIndependentFailures: opts.minIndependentFailures,
  });
  return { ...base, examinedRuns, result };
}

function aggregate(jobs: JobAttribution[]): {
  verdict: FlakeVerdict;
  abstained: boolean;
  reason: string;
} {
  if (jobs.length === 0) {
    return {
      verdict: 'inconclusive',
      abstained: true,
      reason: 'Abstained: the PR has no failing check to attribute.',
    };
  }
  if (jobs.some((j) => j.result.verdict === 'in-diff')) {
    return {
      verdict: 'in-diff',
      abstained: false,
      reason: 'At least one failing test is in the PR’s diff — treat as real.',
    };
  }
  if (jobs.every((j) => j.result.verdict === 'environmental')) {
    return {
      verdict: 'environmental',
      abstained: false,
      reason:
        'Every failing test also failed on unrelated diffs or main and is outside the PR’s diff — do not spend a retry to prove it.',
    };
  }
  const abstained = jobs.every((j) => j.result.abstained);
  return {
    verdict: 'inconclusive',
    abstained,
    reason: abstained
      ? 'Abstained: no correlatable evidence (unreadable log, no parsed tests, or zero denominator).'
      : 'Insufficient cross-PR evidence — a single retry is the remaining tool.',
  };
}

/** Collect cross-PR evidence for a PR's failing check(s) and classify it. */
export async function attributePrFailure(
  gh: GhRunner,
  opts: AttributeFailureOptions
): Promise<AttributeFailureReport> {
  const repoArg = opts.repo;
  const repoInfo = await ghJson<{ full_name: string; default_branch: string }>(
    gh,
    ['api', repoArg ? `repos/${repoArg}` : 'repos/{owner}/{repo}'],
    'repository lookup'
  );
  const repo = repoInfo.full_name;
  const pr = await ghJson<PrView>(
    gh,
    [
      'pr',
      'view',
      String(opts.pr),
      '--repo',
      repo,
      '--json',
      'headRefName,headRefOid,files,statusCheckRollup',
    ],
    `PR #${opts.pr} lookup`
  );
  const prFiles = (pr.files ?? []).map((f) => f.path);
  const now = opts.now ?? new Date();

  let jobIds: number[];
  if (opts.jobId !== undefined) {
    jobIds = [opts.jobId];
  } else {
    jobIds = (pr.statusCheckRollup ?? [])
      .filter((c) => FAILING_CONCLUSIONS.has(String(c.conclusion ?? '').toUpperCase()))
      .filter((c) => !opts.job || (c.name ?? '').includes(opts.job))
      .map((c) => jobIdFromUrl(c.detailsUrl))
      .filter((id): id is number => id !== null);
  }

  const ctx = {
    repo,
    prBranch: pr.headRefName,
    defaultBranch: repoInfo.default_branch,
    prFiles,
    now,
  };
  const jobs: JobAttribution[] = [];
  for (const id of jobIds) jobs.push(await attributeJob(gh, ctx, id, opts));

  return {
    repo,
    pr: opts.pr,
    branch: pr.headRefName,
    headSha: pr.headRefOid,
    windowHours: opts.windowHours,
    ...aggregate(jobs),
    jobs,
  };
}
