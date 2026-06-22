import type { SignalContext, SignalProvider, SignalPoint, SignalResult } from '../types';

const SIGNAL_ID = 'eval-fail-rate' as const;
const LABEL = 'Post-merge eval fail rate (30d)';
const SOURCE = 'graph execution_outcome nodes';
const UNIT = '%';
const THRESHOLD = { warn: 5, alert: 10 } as const;
const WINDOW_DAYS = 30;

/** Truncate an ISO timestamp to a `YYYY-MM-DD` date string (UTC). */
function toDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Round to 2 decimal places. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

/** Build a `pending` result — the dependency is not yet producing data. */
function pendingResult(detail: string): SignalResult {
  return {
    id: SIGNAL_ID,
    label: LABEL,
    value: null,
    unit: UNIT,
    trend: 'flat',
    betterDirection: 'down',
    status: 'pending',
    threshold: { ...THRESHOLD },
    history: [],
    detail,
    source: SOURCE,
  };
}

interface DayCounts {
  fail: number;
  total: number;
}

/**
 * `eval-fail-rate` — post-merge evaluation failure rate over the last 30 days,
 * derived from `execution_outcome` nodes in the knowledge graph. Reads the verdict
 * from `metadata.result` (`'success' | 'failure'`) and the ISO timestamp from
 * `metadata.timestamp` — the only fields it depends on. Because `GraphNode.metadata`
 * is `Record<string, unknown>`, both fields are narrowed defensively (a node whose
 * `result` is not exactly `'success'`/`'failure'` or whose `timestamp` is not a
 * parseable date is skipped), mirroring `intelligence/effectiveness/scorer.ts`.
 *
 * The reported `value` is the overall 30-day fail fraction
 * `failures / (failures + successes) × 100`; per-day buckets feed `history`. Status:
 * `value > alert(10) → 'alert'`, `value > warn(5) → 'warn'`, else `'ok'`
 * (strict `>`); healthier is `down`.
 *
 * This provider shares ONLY the `execution_outcome` node-shape contract with
 * `harness:outcome-eval` (spec Decision #2) — it imports NO outcome-eval/intelligence
 * code. When that producer has not yet shipped (zero `execution_outcome` nodes, or
 * zero within the window), the signal is `status: 'pending'` with a `null` value, not
 * an error. A missing/unloadable graph (`ctx.graphStore` absent, or `findNodes`
 * throwing) degrades to `status: 'error'` — it never throws.
 *
 * @internal Called with project-resolved paths, not from HTTP input.
 */
export const evalFailRateProvider: SignalProvider = {
  id: SIGNAL_ID,
  label: LABEL,
  async compute(ctx: SignalContext): Promise<SignalResult> {
    if (!ctx.graphStore) {
      return errorResult('Knowledge graph not loaded; run "harness scan" to build .harness/graph.');
    }

    let nodes;
    try {
      nodes = ctx.graphStore.findNodes({ type: 'execution_outcome' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Failed to query graph: ${message}`);
    }

    if (nodes.length === 0) {
      return pendingResult(
        'No execution_outcome nodes yet — eval-fail-rate activates once harness:outcome-eval publishes outcomes to the graph.'
      );
    }

    const cutoffMs = ctx.now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const buckets = new Map<string, DayCounts>();
    let totalFail = 0;
    let totalAll = 0;

    for (const node of nodes) {
      const result = node.metadata.result;
      if (result !== 'success' && result !== 'failure') continue;
      const timestamp = node.metadata.timestamp;
      if (typeof timestamp !== 'string') continue;
      const ms = Date.parse(timestamp);
      if (Number.isNaN(ms) || ms < cutoffMs) continue;

      const day = toDate(timestamp);
      const bucket = buckets.get(day) ?? { fail: 0, total: 0 };
      bucket.total += 1;
      if (result === 'failure') bucket.fail += 1;
      buckets.set(day, bucket);

      totalAll += 1;
      if (result === 'failure') totalFail += 1;
    }

    if (totalAll === 0) {
      return pendingResult('No execution_outcome nodes in the last 30 days.');
    }

    const history: SignalPoint[] = [...buckets.entries()]
      .map(([date, counts]) => ({ date, value: round2((counts.fail / counts.total) * 100) }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const value = round2((totalFail / totalAll) * 100);

    const status: SignalResult['status'] =
      value > THRESHOLD.alert ? 'alert' : value > THRESHOLD.warn ? 'warn' : 'ok';

    const trend: SignalResult['trend'] =
      history.length < 2
        ? 'flat'
        : history[history.length - 1]!.value > history[0]!.value
          ? 'up'
          : history[history.length - 1]!.value < history[0]!.value
            ? 'down'
            : 'flat';

    ctx.timeline.backfill(SIGNAL_ID, history);
    ctx.timeline.appendPoint(SIGNAL_ID, toDate(ctx.now.toISOString()), value);

    const detail = `${value}% of ${totalAll} post-merge eval${totalAll === 1 ? '' : 's'} failed in the last ${WINDOW_DAYS} days.`;

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
  },
};
