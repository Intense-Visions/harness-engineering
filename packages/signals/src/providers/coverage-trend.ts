import { z } from 'zod';
import { defaultCommandRunner } from '../command-runner';
import { round2, toDate } from '../shared';
import type {
  CommandRunner,
  SignalContext,
  SignalProvider,
  SignalPoint,
  SignalResult,
} from '../types';

const SIGNAL_ID = 'coverage-trend-down-30d' as const;
const LABEL = 'Coverage trend (30d)';
const SOURCE = 'git history of coverage-baselines.json';
const UNIT = '%';
const THRESHOLD = { warn: -1, alert: -5 } as const;
const WINDOW_DAYS = 30;
const COVERAGE_FILE = 'coverage-baselines.json';
const US = '\x1f'; // unit (field) separator within a log record

const ENABLE_TRACKING_HINT =
  'No coverage history found in git for coverage-baselines.json over the last 30 days. ' +
  'Run the test suite with coverage and `node scripts/coverage-ratchet.mjs --update`, then commit, to start tracking.';

/**
 * Shape of a committed `coverage-baselines.json` snapshot: a flat object keyed by
 * package path, each value the four per-package metric percentages.
 */
const CoverageBaselinesSchema = z.record(
  z.string(),
  z.object({
    lines: z.number(),
    branches: z.number(),
    functions: z.number(),
    statements: z.number(),
  })
);
type CoverageBaselines = z.infer<typeof CoverageBaselinesSchema>;

/**
 * Reduce one commit's snapshot to a single coverage scalar = the MEAN of every
 * package's `lines` percentage.
 *
 * [ASSUMPTION] `lines` is the chosen aggregate (the metric `coverage-ratchet.mjs`
 * reports first and the most intuitive headline number). If the team later prefers
 * weighted-by-LOC or `statements`, change ONLY this function.
 */
function aggregateCoverage(parsed: CoverageBaselines): number {
  const lines = Object.values(parsed).map((m) => m.lines);
  if (lines.length === 0) return 0;
  return lines.reduce((sum, v) => sum + v, 0) / lines.length;
}

/** One `git log` record: a commit sha paired with its `YYYY-MM-DD` commit date. */
type LogRecord = readonly [sha: string, date: string];

/**
 * Parse `git log --pretty=format:%H<US>%cd` output into `[sha, date]` records.
 *
 * `--pretty=format:` separates records with a NEWLINE (no trailing terminator);
 * each record's fields are joined by US. Order is preserved: git emits
 * newest→oldest.
 */
function parseLogRecords(logOut: string): LogRecord[] {
  return logOut
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0)
    .map((r) => r.split(US))
    .filter((parts): parts is [string, string] => parts[0] !== undefined && parts[1] !== undefined)
    .map(([sha, date]) => [sha.trim(), date.trim()] as const);
}

/**
 * Walk each commit's snapshot and bucket the mean line-coverage by day.
 *
 * git log emits newest→oldest, so the FIRST record seen for a given day is the
 * LATEST commit on that day. We keep that one (`if (!buckets.has(date))`) and
 * ignore later (older) same-day commits, so each day's value is its latest
 * commit's coverage (spec truth #2). Unparseable / non-conforming snapshots are
 * skipped defensively.
 */
async function loadDailyBuckets(
  records: readonly LogRecord[],
  runCommand: CommandRunner
): Promise<Map<string, number>> {
  const buckets = new Map<string, number>();
  for (const [sha, date] of records) {
    if (buckets.has(date)) continue; // newest same-day commit already recorded; keep it
    const raw = await runCommand('git', ['show', `${sha}:${COVERAGE_FILE}`]);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      continue; // unparseable snapshot for this commit — skip defensively
    }
    const parsed = CoverageBaselinesSchema.safeParse(json);
    if (!parsed.success) continue;
    if (Object.keys(parsed.data).length === 0) continue; // empty snapshot {} — not 0% coverage; skip
    buckets.set(date, aggregateCoverage(parsed.data));
  }
  return buckets;
}

/** Trend/status/detail derived purely from the sorted daily history. */
interface TrendSummary {
  trend: SignalResult['trend'];
  status: SignalResult['status'];
  detail: string;
}

/**
 * Derive trend, threshold status, and the human-readable detail from history.
 * Status is driven by the 30-day delta `latest − earliest` (percentage points):
 * `<= alert(-5) → 'alert'`, `<= warn(-1) → 'warn'`, else `'ok'`.
 */
function deriveTrendStatus(history: readonly SignalPoint[]): TrendSummary {
  const latest = history[history.length - 1]!.value;
  const earliest = history[0]!.value;
  const delta = latest - earliest; // percentage points

  const trend: SignalResult['trend'] =
    history.length < 2 || latest === earliest ? 'flat' : latest > earliest ? 'up' : 'down';

  const status: SignalResult['status'] =
    delta <= THRESHOLD.alert ? 'alert' : delta <= THRESHOLD.warn ? 'warn' : 'ok';

  const detail =
    history.length < 2
      ? `Coverage is ${latest}%; no prior 30-day snapshot to trend against.`
      : `Coverage ${latest}% (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp over ${WINDOW_DAYS}d).`;

  return { trend, status, detail };
}

/** Build a degraded `error` result that never crashes the panel. */
function errorResult(detail: string): SignalResult {
  return {
    id: SIGNAL_ID,
    label: LABEL,
    value: null,
    unit: UNIT,
    trend: 'flat',
    betterDirection: 'up',
    status: 'error',
    threshold: { ...THRESHOLD },
    history: [],
    detail,
    source: SOURCE,
  };
}

/**
 * `coverage-trend-down-30d` — derives a 30-day line-coverage trend from the git
 * history of the repo-root `coverage-baselines.json`. There is no native coverage
 * time-series (the file is a point-in-time snapshot overwritten by
 * `scripts/coverage-ratchet.mjs --update`), so this provider walks git: one
 * `git log --since=30.days -- coverage-baselines.json` lists `<sha> <YYYY-MM-DD>`
 * over the window, then per commit `git show <sha>:coverage-baselines.json` reads
 * that snapshot. Each commit's scalar is the MEAN `lines%` across all packages
 * (see `aggregateCoverage`). Commits are bucketed by day (the latest commit per
 * day wins — git log is newest→oldest, so the first-seen record for a day is kept),
 * backfilled into the shared `SignalTimelineStore`, and the current day mirrored.
 *
 * The 30-day delta `latest − earliest` (percentage points) drives status:
 * `<= alert(-5) → 'alert'`, `<= warn(-1) → 'warn'`, else `'ok'`; healthier is `up`.
 *
 * If git rejects, the file was never tracked (empty log), or no commit yields a
 * parseable snapshot, the provider degrades to `status: 'error'` with an
 * enable-tracking hint — it never throws.
 *
 * @internal Called with project-resolved paths, not from HTTP input.
 */
export const coverageTrendProvider: SignalProvider = {
  id: SIGNAL_ID,
  label: LABEL,
  async compute(ctx: SignalContext): Promise<SignalResult> {
    const runCommand = ctx.runCommand ?? defaultCommandRunner;
    try {
      const logOut = await runCommand('git', [
        'log',
        `--since=${WINDOW_DAYS}.days`,
        `--pretty=format:%H${US}%cd`,
        '--date=short',
        '--',
        COVERAGE_FILE,
      ]);

      const records = parseLogRecords(logOut);
      if (records.length === 0) {
        return errorResult(ENABLE_TRACKING_HINT);
      }

      const buckets = await loadDailyBuckets(records, runCommand);
      if (buckets.size === 0) {
        return errorResult(ENABLE_TRACKING_HINT);
      }

      const history: SignalPoint[] = [...buckets.entries()]
        .map(([date, value]) => ({ date, value: round2(value) }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      const value = round2(history[history.length - 1]!.value);
      const { trend, status, detail } = deriveTrendStatus(history);

      ctx.timeline.backfill(SIGNAL_ID, history);
      ctx.timeline.appendPoint(SIGNAL_ID, toDate(ctx.now.toISOString()), value);

      return {
        id: SIGNAL_ID,
        label: LABEL,
        value,
        unit: UNIT,
        trend,
        betterDirection: 'up',
        status,
        threshold: { ...THRESHOLD },
        history,
        detail,
        source: SOURCE,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Failed to read coverage history: ${message}`);
    }
  },
};
