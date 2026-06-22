import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
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
      const filePath = join(ctx.projectPath, '.harness', 'arch', 'timeline.json');
      if (!existsSync(filePath)) {
        return errorResult(`No ${SOURCE}; run an architecture snapshot to populate it.`);
      }

      const parsed = ArchTimelineSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf-8')));
      if (!parsed.success) {
        return errorResult(`Could not parse ${SOURCE}; re-run an architecture snapshot.`);
      }

      const cutoffMs = ctx.now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
      const windowed = parsed.data.snapshots
        .filter((s) => Date.parse(s.capturedAt) >= cutoffMs)
        .sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : a.capturedAt > b.capturedAt ? 1 : 0));

      if (windowed.length === 0) {
        return errorResult(`No complexity snapshots in the last ${WINDOW_DAYS} days in ${SOURCE}.`);
      }

      const history: SignalPoint[] = windowed.map((s) => ({
        date: toDate(s.capturedAt),
        value: s.metrics.complexity.value,
      }));

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

      // Mirror the current day's value into the shared store (steady-state continuity).
      ctx.timeline.appendPoint(SIGNAL_ID, toDate(ctx.now.toISOString()), latest);

      const detail =
        history.length < 2
          ? `Complexity is ${latest}; no prior 30-day snapshot to trend against.`
          : `Complexity ${latest} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% over ${WINDOW_DAYS}d).`;

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
