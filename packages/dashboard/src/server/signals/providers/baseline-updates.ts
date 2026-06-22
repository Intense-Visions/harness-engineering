import { defaultCommandRunner } from '../command-runner';
import type { SignalContext, SignalProvider, SignalPoint, SignalResult } from '../types';

const SIGNAL_ID = 'baseline-auto-update-count' as const;
const LABEL = 'Baseline auto-updates (30d)';
const SOURCE = "git log -- '*-baselines.json'";
const UNIT = 'count';
const THRESHOLD = { warn: 1, alert: 5 } as const;
const WINDOW_DAYS = 30;
const BOT_AUTHOR = 'github-actions[bot]';
const MSG_PREFIX = 'chore: refresh baselines';
const RS = '\x1e'; // record separator
const US = '\x1f'; // unit separator

/** Truncate an ISO timestamp to a `YYYY-MM-DD` date string (UTC). */
function toDate(iso: string): string {
  return iso.slice(0, 10);
}

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
        .split(RS)
        .map((r) => r.trim())
        .filter((r) => r.length > 0);

      // Bucket matching commits by date.
      const buckets = new Map<string, number>();
      for (const record of records) {
        const [, author, subject, date] = record.split(US);
        if (author === undefined || subject === undefined || date === undefined) continue;
        if (author !== BOT_AUTHOR || !subject.startsWith(MSG_PREFIX)) continue;
        buckets.set(date, (buckets.get(date) ?? 0) + 1);
      }

      const history: SignalPoint[] = [...buckets.entries()]
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      const value = history.reduce((sum, p) => sum + p.value, 0);

      // Backfill derived daily buckets (idempotent) and mirror the current day.
      ctx.timeline.backfill(SIGNAL_ID, history);
      ctx.timeline.appendPoint(SIGNAL_ID, toDate(ctx.now.toISOString()), value);

      const status: SignalResult['status'] =
        value >= THRESHOLD.alert ? 'alert' : value >= THRESHOLD.warn ? 'warn' : 'ok';

      const trend: SignalResult['trend'] =
        history.length < 2
          ? 'flat'
          : history[history.length - 1]!.value > history[0]!.value
            ? 'up'
            : history[history.length - 1]!.value < history[0]!.value
              ? 'down'
              : 'flat';

      const detail =
        value === 0
          ? `No baseline auto-updates in the last ${WINDOW_DAYS} days.`
          : `${value} baseline auto-update${value === 1 ? '' : 's'} in the last ${WINDOW_DAYS} days.`;

      return {
        id: SIGNAL_ID,
        label: LABEL,
        value,
        unit: UNIT,
        trend,
        betterDirection: 'down',
        status,
        threshold: { ...THRESHOLD },
        history,
        detail,
        source: SOURCE,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Failed to read git baseline history: ${message}`);
    }
  },
};
