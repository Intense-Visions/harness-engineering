import { execFileSync } from 'node:child_process';
import { SignalTimelineStore, type SignalPoint } from '@harness-engineering/signals';
import type { SignalId } from '@harness-engineering/signals';
import type { RollbackDecision } from '@harness-engineering/core';

/** Reads stored daily points for a signal name (empty for unknown/absent). */
export type TimelineReader = (signalName: string) => SignalPoint[];

/** Resolves PR numbers merged within [startIso, nowIso] (inclusive). */
export type PrResolver = (startIso: string, nowIso: string) => Promise<number[]>;

/** Injected clock for deterministic window math. */
export type Clock = () => Date;

/** Config rule shape the sweep consumes (mirrors RollbackSignalRuleSchema). */
export interface SweepSignalRule {
  threshold: number;
  direction: 'above' | 'below';
  window: string;
}

export interface RollbackSweepDeps {
  readTimeline: TimelineReader;
  resolveMergedPrs: PrResolver;
  evaluate: (pr: number) => Promise<RollbackDecision>;
  now?: Clock;
}

const WINDOW_UNIT_MS = {
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
} as const satisfies Record<string, number>;

type WindowUnit = keyof typeof WINDOW_UNIT_MS;

/**
 * Parse a lookback window like `"24h"`, `"7d"`, `"2w"` into milliseconds. Single
 * source of truth for both the schema-validation intent and window-start math.
 * Throws on any string not matching `/^\d+[hdw]$/`.
 */
export function parseWindow(window: string): number {
  const match = /^(\d+)([hdw])$/.exec(window);
  if (!match) throw new Error(`invalid window: ${window}`);
  const count = Number.parseInt(match[1] ?? '', 10);
  const unit = match[2] as WindowUnit;
  return count * WINDOW_UNIT_MS[unit];
}

/**
 * Edge-crossing detection over oldest→newest points. A crossing fires only when
 * the immediately prior point is on one side of the threshold and the latest
 * point is on the other — NOT a sustained plateau past the threshold (which
 * would re-fire every sweep). Fewer than two points → no crossing.
 *
 * By design this examines ONLY the most-recent adjacent in-window pair
 * (`.at(-2)` vs `.at(-1)`). Two consequences follow deliberately:
 *   - A crossing immediately followed by a same-window reversal (e.g. over →
 *     back-under before the next sweep) is NOT fired — only the final adjacent
 *     transition is considered, so a self-reverting blip is intentionally
 *     ignored rather than treated as a crossing.
 *   - The "prior point" (`.at(-2)`) is simply the previous stored point, which
 *     may be many calendar days older than the latest when the timeline has gap
 *     days (signals are only recorded on days they were sampled). Adjacency here
 *     means "adjacent in the point series," not "one day apart."
 */
export function detectCrossing(points: SignalPoint[], rule: SweepSignalRule): boolean {
  const prev = points.at(-2);
  const curr = points.at(-1);
  if (!prev || !curr) return false;
  if (rule.direction === 'above') {
    return prev.value < rule.threshold && curr.value >= rule.threshold;
  }
  return prev.value > rule.threshold && curr.value <= rule.threshold;
}

/** ISO timestamp of the window start (`now - window`). */
export function windowStart(now: Date, window: string): string {
  return new Date(now.getTime() - parseWindow(window)).toISOString();
}

/**
 * Keep only points whose `YYYY-MM-DD` date falls within `[windowStart, now]`.
 * Points are `SignalPoint` (date is a `YYYY-MM-DD` string); ISO-date string
 * comparison is order-preserving, so a lexical range check is exact.
 */
export function pointsInWindow(points: SignalPoint[], now: Date, window: string): SignalPoint[] {
  const startDate = windowStart(now, window).slice(0, 10);
  const nowDate = now.toISOString().slice(0, 10);
  return points.filter((p) => p.date >= startDate && p.date <= nowDate);
}

/**
 * Signal arm of the rollback circuit breaker. For each configured signal, read
 * its timeline, restrict to the window, and if the in-window points cross the
 * threshold, resolve the PRs merged in that same window and forward each to the
 * injected `evaluate` (which binds `trigger: 'signal'`). PR de-duplication is
 * NOT this function's job — duplicate suppression is the composer's `harness:
 * rollback`-label idempotency (see composeRevertPr). All seams are injected so
 * this is fully unit-testable without touching real git/gh/timeline.
 */
export async function runRollbackSweep(
  signals: Record<string, SweepSignalRule>,
  deps: RollbackSweepDeps
): Promise<void> {
  const now = (deps.now ?? (() => new Date()))();
  for (const [name, rule] of Object.entries(signals)) {
    const pts = pointsInWindow(deps.readTimeline(name), now, rule.window);
    if (!detectCrossing(pts, rule)) continue;
    const prs = await deps.resolveMergedPrs(windowStart(now, rule.window), now.toISOString());
    for (const pr of prs) {
      await deps.evaluate(pr);
    }
  }
}

/**
 * Real timeline reader over `SignalTimelineStore`. Untested-by-design (thin
 * shim); `read` keys straight into the record and returns `[]` for unknown
 * names, so config signal names (arbitrary strings) cast narrowly to `SignalId`
 * at the boundary.
 */
export function createTimelineReader(root: string): TimelineReader {
  const store = new SignalTimelineStore(root);
  return (name) => store.read(name as SignalId);
}

/**
 * Real PR resolver over `gh pr list` (no shell). Degrade-safe: any gh failure
 * yields `[]` so a missing/unauthenticated gh never crashes the sweep.
 *
 * Honors BOTH ends of the `[startIso, nowIso]` contract with a bounded
 * `merged:<start>..<end>` range so out-of-window PRs are never forwarded to
 * evaluate (finding I1). We deliberately pass the FULL ISO timestamps rather
 * than date-truncating (`.slice(0, 10)`): gh's `merged:` qualifier accepts
 * full `YYYY-MM-DDTHH:MM:SSZ` timestamps, so a 24h window ending at 10:00 does
 * NOT bleed in ~10 extra hours of PRs from 00:00 that a date-only bound would
 * capture. The window is thus honored to the second, not the calendar day.
 */
export function createPrResolver(): PrResolver {
  return async (startIso, nowIso) => {
    try {
      const raw = execFileSync(
        'gh',
        [
          'pr',
          'list',
          '--state',
          'merged',
          '--search',
          `merged:${startIso}..${nowIso}`,
          '--json',
          'number',
          '--limit',
          '100',
        ],
        { encoding: 'utf-8' }
      );
      return (JSON.parse(raw) as { number: number }[]).map((p) => p.number);
    } catch {
      return [];
    }
  };
}
