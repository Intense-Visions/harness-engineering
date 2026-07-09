import type { SignalPoint } from '@harness-engineering/signals';
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

const WINDOW_UNIT_MS: Record<string, number> = {
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/**
 * Parse a lookback window like `"24h"`, `"7d"`, `"2w"` into milliseconds. Single
 * source of truth for both the schema-validation intent and window-start math.
 * Throws on any string not matching `/^\d+[hdw]$/`.
 */
export function parseWindow(window: string): number {
  const match = /^(\d+)([hdw])$/.exec(window);
  if (!match) throw new Error(`invalid window: ${window}`);
  const [, count, unit] = match;
  return Number.parseInt(count, 10) * WINDOW_UNIT_MS[unit];
}

/**
 * Edge-crossing detection over oldest→newest points. A crossing fires only when
 * the immediately prior point is on one side of the threshold and the latest
 * point is on the other — NOT a sustained plateau past the threshold (which
 * would re-fire every sweep). Fewer than two points → no crossing.
 */
export function detectCrossing(points: SignalPoint[], rule: SweepSignalRule): boolean {
  if (points.length < 2) return false;
  const prev = points[points.length - 2];
  const curr = points[points.length - 1];
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
