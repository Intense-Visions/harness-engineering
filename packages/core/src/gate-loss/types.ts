/**
 * Taguchi continuous-loss primitives (issue #1673).
 *
 * A thresholded gate returns a binary verdict — coverage >= floor, complexity <=
 * limit, latency <= budget — and, in doing so, discards the *distance* to the
 * threshold. "Passed barely" and "passed comfortably" are indistinguishable, yet
 * the distance is exactly the leading indicator: a codebase drifting toward its
 * limits shows rising loss while every gate still passes green.
 *
 * These types model the continuous measurement underneath a binary verdict and a
 * per-gate quadratic loss (Taguchi's insight: loss is continuous in the distance
 * from target, not a step function at the spec limit). They are pure and carry no
 * IO. Emission only — nothing here changes any gate's pass/fail decision.
 *
 * The raw {@link GateMeasurement} envelope (measured + target + bound) lives in
 * `@harness-engineering/types` so it can be attached to result envelopes without
 * a dependency on this package; the derived {@link GateLoss} is computed here.
 */
import type { GateBound, GateMeasurement } from '@harness-engineering/types';

export type { GateBound, GateMeasurement };

/**
 * A {@link GateMeasurement} enriched with its derived, comparable-across-gates
 * continuous loss. All fields are derived deterministically from the measurement
 * by {@link computeGateLoss}; nothing here is a decision.
 */
export interface GateLoss extends GateMeasurement {
  /**
   * Signed slack in the gate's own raw units:
   * - `>= 0` — passing, with this much margin before the threshold,
   * - `<  0` — breaching, by this much.
   *
   * For an `upper` bound `margin = target - measured`; for a `lower` bound
   * `margin = measured - target`. The sign mirrors the binary verdict but is
   * NOT used to decide it — emission only.
   */
  margin: number;
  /**
   * Proximity to the threshold, normalized so it is comparable across gates with
   * different units and scales:
   * - `0`   — as far from the limit as possible (best),
   * - `1`   — exactly at the threshold (the knife-edge the binary verdict sees),
   * - `> 1` — breaching.
   *
   * For an `upper` bound `proximity = measured / target`; for a `lower` bound
   * `proximity = target / measured`. Both equal 1 at the threshold and shrink
   * toward 0 with more margin.
   */
  proximity: number;
  /**
   * Quadratic Taguchi loss = `proximity ** 2`. Low and flat while comfortably
   * passing, rising steeply as the measurement approaches the limit — the shape
   * that turns "all green" into a graded, trendable signal. Comparable across
   * gates because it is dimensionless.
   */
  loss: number;
  /**
   * True when the normalizing denominator was zero (e.g. an `upper` gate with
   * `target === 0`, or a `lower` gate with `measured === 0`) and proximity/loss
   * were clamped rather than computed. Consumers can down-weight a degraded
   * datapoint instead of trusting a clamped extreme.
   */
  degraded?: boolean;
}

/**
 * A rolled-up view of many {@link GateLoss} datapoints — the accumulated loss
 * per change / surface / period that becomes the leading indicator the binary
 * verdicts cannot see.
 */
export interface AccumulatedLoss {
  /** Sum of every non-degraded datapoint's `loss`. */
  totalLoss: number;
  /** Number of non-degraded datapoints accumulated. */
  count: number;
  /** `totalLoss / count`, or 0 when `count === 0`. */
  meanLoss: number;
  /** Per-gate breakdown keyed by {@link GateMeasurement.gate} (non-degraded only). */
  perGate: Record<string, { totalLoss: number; count: number; meanLoss: number }>;
  /**
   * Count of `degraded` datapoints EXCLUDED from the aggregate (clamped
   * divide-by-zero / non-finite readings). Non-zero means the trend is computed
   * over fewer points than were supplied.
   */
  degradedCount: number;
}

/** Inputs to {@link detectLossAlarm}. */
export interface LossAlarmInput {
  /** The prior period's accumulated (or mean) loss. */
  previous: number;
  /** This period's accumulated (or mean) loss, measured the same way. */
  current: number;
  /**
   * Whether every binary verdict in the current period passed. The alarm is a
   * LEADING indicator: it only means something when the binary gates say nothing
   * is wrong. A period that already failed a gate does not need this warning.
   */
  allVerdictsGreen: boolean;
  /**
   * Fractional rise in loss that trips the alarm (default `0.25` = a 25% rise).
   * `current >= previous * (1 + riseThreshold)` fires.
   */
  riseThreshold?: number;
}

/** The verdict of {@link detectLossAlarm}. */
export interface LossAlarm {
  /** True when loss is rising past the threshold while all verdicts are green. */
  firing: boolean;
  /** `(current - previous) / previous`, or 0 when `previous <= 0`. */
  riseFraction: number;
  /** Human-facing one-line explanation of the alarm state. */
  reason: string;
}
