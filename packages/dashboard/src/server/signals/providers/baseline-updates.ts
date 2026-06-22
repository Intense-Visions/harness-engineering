import { defaultCommandRunner } from '../command-runner';
import { bucketsToHistory, deriveEndpointTrend, toDate } from '../shared';
import type {
  CommandRunner,
  SignalContext,
  SignalProvider,
  SignalPoint,
  SignalResult,
} from '../types';

const SIGNAL_ID = 'baseline-auto-update-count' as const;
const LABEL = 'Baseline auto-updates (30d)';
const SOURCE = "git log -- '*-baselines.json'";
const UNIT = 'count';
const THRESHOLD = { warn: 1, alert: 5 } as const;
const WINDOW_DAYS = 30;
const BOT_AUTHOR = 'github-actions[bot]';
const MSG_PREFIX = 'chore: refresh baselines';
const US = '\x1f'; // unit (field) separator within a record

/** Build a degraded `error` result that never crashes the panel. */
function errorResult(detail: string): SignalResult {
  return {
    id: SIGNAL_ID,
    label: LABEL,
    value: null,
    unit: UNIT,
    trend: 'flat',
    betterDirection: 'down',
    status: 'error',
    threshold: { ...THRESHOLD },
    history: [],
    detail,
    source: SOURCE,
  };
}

/**
 * Shell out to `git log --since=30.days -- '*-baselines.json'` and bucket — by commit
 * date — the commits authored by `github-actions[bot]` whose subject begins
 * `chore: refresh baselines`. Both conditions are required so human refresh commits are
 * excluded. The `*-baselines.json` glob covers the arch, coverage, and benchmark files.
 *
 * `git log --pretty=format:` separates records with a NEWLINE (no trailing terminator);
 * each record's fields are joined by the requested US separator. Records missing fields
 * are skipped defensively.
 */
async function loadDailyBuckets(runCommand: CommandRunner): Promise<Map<string, number>> {
  const stdout = await runCommand('git', [
    'log',
    `--since=${WINDOW_DAYS}.days`,
    '--no-merges',
    `--pretty=format:%H${US}%an${US}%s${US}%cd`,
    '--date=short',
    '--',
    '*-baselines.json',
  ]);

  const records = stdout
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);

  const buckets = new Map<string, number>();
  for (const record of records) {
    const [, author, subject, date] = record.split(US);
    if (author === undefined || subject === undefined || date === undefined) continue;
    if (author !== BOT_AUTHOR || !subject.startsWith(MSG_PREFIX)) continue;
    buckets.set(date.trim(), (buckets.get(date.trim()) ?? 0) + 1);
  }
  return buckets;
}

/** Human-readable one-liner for the current count. */
function buildDetail(value: number): string {
  return value === 0
    ? `No baseline auto-updates in the last ${WINDOW_DAYS} days.`
    : `${value} baseline auto-update${value === 1 ? '' : 's'} in the last ${WINDOW_DAYS} days.`;
}

/**
 * `baseline-auto-update-count` — counts CI-driven baseline-refresh commits over the
 * last 30 days. Shells out (via the injected `CommandRunner`, defaulting to
 * `defaultCommandRunner`) to `git log --since=30.days -- '*-baselines.json'` and keeps
 * only commits authored by `github-actions[bot]` whose message begins
 * `chore: refresh baselines` — the verified key emitted by the "Commit refreshed
 * baselines" step in `.github/workflows/ci.yml`. The `*-baselines.json` glob covers the
 * arch, coverage, and benchmark baseline files. Human `chore: refresh/update baselines`
 * commits are excluded by requiring BOTH the bot author AND the message prefix.
 *
 * Counts are bucketed by day, backfilled into the shared `SignalTimelineStore`, and the
 * current day is mirrored for steady-state continuity. A high count means the auto-update
 * loop is firing often (healthier is `down`). Any runner rejection or parse failure
 * degrades to `status: 'error'` — never throws.
 *
 * @internal Called with project-resolved paths, not from HTTP input.
 */
export const baselineUpdatesProvider: SignalProvider = {
  id: SIGNAL_ID,
  label: LABEL,
  async compute(ctx: SignalContext): Promise<SignalResult> {
    const runCommand = ctx.runCommand ?? defaultCommandRunner;
    try {
      const buckets = await loadDailyBuckets(runCommand);

      const history: SignalPoint[] = bucketsToHistory(buckets, (v) => v);
      const value = history.reduce((sum, p) => sum + p.value, 0);

      // Backfill derived daily buckets (idempotent) and mirror the current day.
      ctx.timeline.backfill(SIGNAL_ID, history);
      ctx.timeline.appendPoint(SIGNAL_ID, toDate(ctx.now.toISOString()), value);

      const status: SignalResult['status'] =
        value >= THRESHOLD.alert ? 'alert' : value >= THRESHOLD.warn ? 'warn' : 'ok';

      return {
        id: SIGNAL_ID,
        label: LABEL,
        value,
        unit: UNIT,
        trend: deriveEndpointTrend(history),
        betterDirection: 'down',
        status,
        threshold: { ...THRESHOLD },
        history,
        detail: buildDetail(value),
        source: SOURCE,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Failed to read git baseline history: ${message}`);
    }
  },
};
