import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { toDate } from '../shared';
import type { SignalContext, SignalProvider, SignalPoint, SignalResult } from '../types';

const SIGNAL_ID = 'complexity-trend-up-30d' as const;
const LABEL = 'Complexity trend (30d)';
const SOURCE = 'arch/timeline.json';
const UNIT = 'count';
const THRESHOLD = { warn: 5, alert: 15 } as const;
const WINDOW_DAYS = 30;

/** Shape of `.harness/arch/timeline.json` (only the fields this signal reads). */
const ArchSnapshotSchema = z.object({
  capturedAt: z.string(),
  metrics: z.object({
    complexity: z.object({ value: z.number() }),
  }),
});
const ArchTimelineSchema = z.object({
  snapshots: z.array(ArchSnapshotSchema),
});
type ArchSnapshot = z.infer<typeof ArchSnapshotSchema>;

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

/** Either the chronologically-sorted in-window snapshots, or an `error` result. */
type LoadOutcome = { ok: true; snapshots: ArchSnapshot[] } | { ok: false; result: SignalResult };

/**
 * Read and parse `.harness/arch/timeline.json`, then keep only snapshots inside the
 * 30-day window, sorted oldest→newest. A missing file, unparseable JSON / schema, or
 * an empty window each yields `ok: false` with the matching `errorResult`.
 */
function loadWindowedSnapshots(projectPath: string, cutoffMs: number): LoadOutcome {
  const filePath = join(projectPath, '.harness', 'arch', 'timeline.json');
  if (!existsSync(filePath)) {
    return {
      ok: false,
      result: errorResult(`No ${SOURCE}; run an architecture snapshot to populate it.`),
    };
  }

  const parsed = ArchTimelineSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf-8')));
  if (!parsed.success) {
    return {
      ok: false,
      result: errorResult(`Could not parse ${SOURCE}; re-run an architecture snapshot.`),
    };
  }

  const windowed = parsed.data.snapshots
    .filter((s) => Date.parse(s.capturedAt) >= cutoffMs)
    .sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : a.capturedAt > b.capturedAt ? 1 : 0));

  if (windowed.length === 0) {
    return {
      ok: false,
      result: errorResult(`No complexity snapshots in the last ${WINDOW_DAYS} days in ${SOURCE}.`),
    };
  }
  return { ok: true, snapshots: windowed };
}

/** Trend/status/detail derived from the sorted complexity history. */
interface TrendSummary {
  trend: SignalResult['trend'];
  status: SignalResult['status'];
  detail: string;
}

/**
 * Derive trend, threshold status, and detail. Status is driven by the percentage rise
 * `(latest − earliest) / earliest × 100`: `>= alert(15) → 'alert'`, `>= warn(5) → 'warn'`,
 * else `'ok'`. The percentage is 0 when there is a single point or a zero baseline.
 */
function deriveTrendStatus(history: readonly SignalPoint[]): TrendSummary {
  const latest = history[history.length - 1]!.value;
  const earliest = history[0]!.value;

  let pct = 0;
  if (history.length > 1 && earliest !== 0) {
    pct = ((latest - earliest) / earliest) * 100;
  }

  const trend: SignalResult['trend'] =
    history.length < 2 || latest === earliest ? 'flat' : latest > earliest ? 'up' : 'down';

  const status: SignalResult['status'] =
    pct >= THRESHOLD.alert ? 'alert' : pct >= THRESHOLD.warn ? 'warn' : 'ok';

  const detail =
    history.length < 2
      ? `Complexity is ${latest}; no prior 30-day snapshot to trend against.`
      : `Complexity ${latest} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% over ${WINDOW_DAYS}d).`;

  return { trend, status, detail };
}

/**
 * `complexity-trend-up-30d` — reads the architecture time-series at
 * `.harness/arch/timeline.json`, extracts the complexity metric per snapshot over the
 * last 30 days, and reports the current value with an up/down/flat trend and a
 * threshold status (warn +5%, alert +15% rise; healthier is `down`).
 *
 * The arch timeline is the authoritative source; the shared `SignalTimelineStore` is
 * mirrored (current day appended) for steady-state continuity but does not drive the
 * computed result. Missing/empty/corrupt source degrades to `status: 'error'` — never throws.
 *
 * @internal Called with project-resolved paths, not from HTTP input.
 */
export const complexityTrendProvider: SignalProvider = {
  id: SIGNAL_ID,
  label: LABEL,
  async compute(ctx: SignalContext): Promise<SignalResult> {
    try {
      const cutoffMs = ctx.now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
      const loaded = loadWindowedSnapshots(ctx.projectPath, cutoffMs);
      if (!loaded.ok) return loaded.result;

      const history: SignalPoint[] = loaded.snapshots.map((s) => ({
        date: toDate(s.capturedAt),
        value: s.metrics.complexity.value,
      }));

      const latest = history[history.length - 1]!.value;
      const { trend, status, detail } = deriveTrendStatus(history);

      // Mirror the current day's value into the shared store (steady-state continuity).
      ctx.timeline.appendPoint(SIGNAL_ID, toDate(ctx.now.toISOString()), latest);

      return {
        id: SIGNAL_ID,
        label: LABEL,
        value: latest,
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
      return errorResult(`Failed to read ${SOURCE}: ${message}`);
    }
  },
};
