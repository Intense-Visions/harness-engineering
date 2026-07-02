import { z } from 'zod';
import { defaultCommandRunner } from '../command-runner';
import { bucketsToHistory, deriveEndpointTrend, toDate } from '../shared';
import type {
  CommandRunner,
  SignalContext,
  SignalProvider,
  SignalPoint,
  SignalResult,
} from '../types';

const SIGNAL_ID = 'pr-merged-without-multi-persona-review' as const;
const LABEL = 'PRs merged without multi-persona review (30d)';
const SOURCE = 'gh pr list (merged, 30d)';
const UNIT = 'count';
const THRESHOLD = { warn: 1, alert: 3 } as const;
const WINDOW_DAYS = 30;
/**
 * Upper bound on PRs fetched in a single `gh pr list` call. `gh` caps `--limit` and
 * returns at most this many rows. If a 30-day window ever exceeds this, the tail is
 * silently dropped by `gh` — so when the returned row count equals the limit we treat
 * the window as possibly-truncated and annotate `detail` rather than undercount silently.
 */
const FETCH_LIMIT = 500;

/**
 * Marker emitted in the GitHub PR review summary body by the multi-persona review
 * pipeline (`core/src/review/output/format-github.ts` → `formatGitHubSummary`). A merged
 * PR is considered reviewed iff at least one of its reviews contains this string. If the
 * pipeline ever changes its summary header, this single const is the only thing to update.
 */
const ASSESSMENT_MARKER = '## Assessment:';

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

const PrSchema = z.object({
  number: z.number(),
  mergedAt: z.string(),
  reviews: z.array(z.object({ body: z.string() })),
});
const PrListSchema = z.array(PrSchema);
type PrList = z.infer<typeof PrListSchema>;

/** Either parsed PR rows, or a degraded `error` result to return verbatim. */
type FetchOutcome = { ok: true; prs: PrList } | { ok: false; result: SignalResult };

/**
 * Fetch merged PRs (with inline reviews) for the window via a single `gh pr list`
 * call and parse the JSON. A runner rejection or any non-array / non-conforming
 * payload yields `ok: false` with the matching `errorResult` — never throws.
 */
async function fetchPrList(cutoffDate: string, runCommand: CommandRunner): Promise<FetchOutcome> {
  let stdout: string;
  try {
    stdout = await runCommand('gh', [
      'pr',
      'list',
      '--state',
      'merged',
      '--limit',
      String(FETCH_LIMIT),
      '--search',
      `merged:>=${cutoffDate}`,
      '--json',
      'number,mergedAt,reviews',
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, result: errorResult(`gh unavailable or not authenticated: ${message}`) };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    return {
      ok: false,
      result: errorResult('Could not parse gh PR list output; ensure gh is authenticated.'),
    };
  }

  const parsed = PrListSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      result: errorResult('Could not parse gh PR list output; ensure gh is authenticated.'),
    };
  }
  return { ok: true, prs: parsed.data };
}

/**
 * Bucket — by merge date — the PRs that fall inside the window AND carry no review
 * containing the assessment marker. PRs merged before the cutoff or already reviewed
 * are dropped.
 */
function bucketUnreviewed(prs: PrList, cutoffMs: number): Map<string, number> {
  const buckets = new Map<string, number>();
  for (const pr of prs) {
    const mergedMs = Date.parse(pr.mergedAt);
    if (Number.isNaN(mergedMs) || mergedMs < cutoffMs) continue;
    const reviewed = pr.reviews.some((rev) => rev.body.includes(ASSESSMENT_MARKER));
    if (reviewed) continue;
    const date = toDate(pr.mergedAt);
    buckets.set(date, (buckets.get(date) ?? 0) + 1);
  }
  return buckets;
}

/**
 * Build the human-readable detail. When `truncated` (gh hit its row cap) the count
 * is a lower bound and the line is annotated accordingly.
 */
function buildDetail(value: number, truncated: boolean): string {
  const baseDetail =
    value === 0
      ? `All PRs merged in the last ${WINDOW_DAYS} days had a multi-persona review.`
      : `${value} PR${value === 1 ? '' : 's'} merged without multi-persona review in the last ${WINDOW_DAYS} days.`;
  return truncated
    ? `${baseDetail} (Lower bound: gh returned the ${FETCH_LIMIT}-PR fetch cap, so the window may be truncated.)`
    : baseDetail;
}

/**
 * `pr-merged-without-multi-persona-review` — counts PRs merged in the last 30 days that
 * carry no multi-persona review. Multi-persona review is recorded ONLY as a GitHub PR
 * review whose body contains the `## Assessment:` marker emitted by
 * `core/src/review/output/format-github.ts`; there is no commit trailer, `.harness/`
 * artifact, or CI step recording it, so git-local has no signal. The gh PR-reviews API is
 * therefore the sole source — hence unavailability degrades to `status: 'error'` rather
 * than reporting a misleading zero.
 *
 * Uses a single `gh pr list --json number,mergedAt,reviews` call (reviews inline) to avoid
 * an N+1 per-PR fetch, bounded by `--limit FETCH_LIMIT` (the `gh` row cap). If the call
 * returns exactly that many rows the window may be truncated; the result is then a lower
 * bound and `detail` is annotated accordingly rather than silently undercounting. Counts
 * are bucketed by merge date, backfilled into the shared
 * `SignalTimelineStore`, and the current day is mirrored for steady-state continuity. A
 * high count means review coverage is slipping (healthier is `down`). Any runner rejection,
 * non-array, or parse failure degrades to `status: 'error'` — never throws.
 *
 * @internal Called with project-resolved paths, not from HTTP input.
 */
export const prReviewProvider: SignalProvider = {
  id: SIGNAL_ID,
  label: LABEL,
  async compute(ctx: SignalContext): Promise<SignalResult> {
    const runCommand = ctx.runCommand ?? defaultCommandRunner;
    try {
      const cutoffMs = ctx.now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
      const cutoffDate = toDate(new Date(cutoffMs).toISOString());

      const fetched = await fetchPrList(cutoffDate, runCommand);
      if (!fetched.ok) return fetched.result;

      const buckets = bucketUnreviewed(fetched.prs, cutoffMs);
      const history: SignalPoint[] = bucketsToHistory(buckets, (v) => v);
      const value = history.reduce((sum, p) => sum + p.value, 0);

      // Truncation guard: if gh returned exactly FETCH_LIMIT rows, the window may have
      // been clipped and the count is a lower bound rather than exact.
      const truncated = fetched.prs.length >= FETCH_LIMIT;

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
        detail: buildDetail(value, truncated),
        source: SOURCE,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`gh unavailable or not authenticated: ${message}`);
    }
  },
};
