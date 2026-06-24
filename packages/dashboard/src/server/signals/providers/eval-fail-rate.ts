import type { GraphNode } from '@harness-engineering/graph';
import { bucketsToHistory, deriveEndpointTrend, round2, toDate } from '../shared';
import type { SignalContext, SignalProvider, SignalPoint, SignalResult } from '../types';

const SIGNAL_ID = 'eval-fail-rate' as const;
const LABEL = 'Post-merge eval fail rate (30d)';
const SOURCE = 'graph execution_outcome nodes';
const UNIT = '%';
const THRESHOLD = { warn: 5, alert: 10 } as const;
const WINDOW_DAYS = 30;

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

/** A single in-window outcome reduced to the two fields this signal consumes. */
interface Outcome {
  day: string;
  failed: boolean;
}

/**
 * Narrow one graph node to an in-window `Outcome`, or `null` if it should be
 * skipped: `metadata.result` is not exactly `'success'`/`'failure'`, the timestamp
 * is missing/unparseable, or the timestamp is older than the cutoff. Mirrors the
 * defensive narrowing in `intelligence/effectiveness/scorer.ts`.
 */
function toOutcome(node: GraphNode, cutoffMs: number): Outcome | null {
  const result = node.metadata.result;
  if (result !== 'success' && result !== 'failure') return null;
  const timestamp = node.metadata.timestamp;
  if (typeof timestamp !== 'string') return null;
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms) || ms < cutoffMs) return null;
  return { day: toDate(timestamp), failed: result === 'failure' };
}

interface Aggregated {
  buckets: Map<string, DayCounts>;
  totalFail: number;
  totalAll: number;
}

/**
 * Aggregate in-window outcomes into per-day fail/total buckets plus running totals.
 * Out-of-window / malformed nodes are dropped by `toOutcome`.
 */
function aggregateOutcomes(nodes: readonly GraphNode[], cutoffMs: number): Aggregated {
  const buckets = new Map<string, DayCounts>();
  let totalFail = 0;
  let totalAll = 0;

  for (const node of nodes) {
    const outcome = toOutcome(node, cutoffMs);
    if (outcome === null) continue;
    const bucket = buckets.get(outcome.day) ?? { fail: 0, total: 0 };
    bucket.total += 1;
    if (outcome.failed) bucket.fail += 1;
    buckets.set(outcome.day, bucket);
    totalAll += 1;
    if (outcome.failed) totalFail += 1;
  }

  return { buckets, totalFail, totalAll };
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
    const { buckets, totalFail, totalAll } = aggregateOutcomes(nodes, cutoffMs);

    if (totalAll === 0) {
      return pendingResult('No execution_outcome nodes in the last 30 days.');
    }

    const history: SignalPoint[] = bucketsToHistory(buckets, (counts) =>
      round2((counts.fail / counts.total) * 100)
    );
    const value = round2((totalFail / totalAll) * 100);

    ctx.timeline.backfill(SIGNAL_ID, history);
    ctx.timeline.appendPoint(SIGNAL_ID, toDate(ctx.now.toISOString()), value);

    return buildResult(value, totalAll, history);
  },
};

/** Assemble the final `ok`-track result from the computed value and history. */
function buildResult(value: number, totalAll: number, history: SignalPoint[]): SignalResult {
  const status: SignalResult['status'] =
    value > THRESHOLD.alert ? 'alert' : value > THRESHOLD.warn ? 'warn' : 'ok';

  const detail = `${value}% of ${totalAll} post-merge eval${totalAll === 1 ? '' : 's'} failed in the last ${WINDOW_DAYS} days.`;

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
    detail,
    source: SOURCE,
  };
}
