/**
 * Roll up per-gate {@link GateLoss} datapoints into an {@link AccumulatedLoss}
 * and detect the leading-indicator alarm (issue #1673).
 */
import type { AccumulatedLoss, GateLoss, LossAlarm, LossAlarmInput } from './types';

/**
 * Accumulate loss across many datapoints, both in total and per gate. This is
 * the per change / surface / period rollup that becomes the leading indicator: a
 * codebase drifting toward its limits shows a rising `totalLoss` / `meanLoss`
 * while every binary verdict still passes.
 *
 * `degraded` datapoints (a clamped divide-by-zero / non-finite measurement, each
 * worth `MAX_PROXIMITY ** 2`) are EXCLUDED from the aggregate so a single
 * degenerate reading cannot drown the trend; they are counted separately in
 * `degradedCount` so the exclusion is visible rather than silent.
 */
export function accumulateLoss(losses: readonly GateLoss[]): AccumulatedLoss {
  const perGate: AccumulatedLoss['perGate'] = {};
  let totalLoss = 0;
  let count = 0;
  let degradedCount = 0;

  for (const l of losses) {
    if (l.degraded) {
      degradedCount += 1;
      continue;
    }
    totalLoss += l.loss;
    count += 1;
    const bucket = perGate[l.gate] ?? { totalLoss: 0, count: 0, meanLoss: 0 };
    bucket.totalLoss += l.loss;
    bucket.count += 1;
    perGate[l.gate] = bucket;
  }

  for (const bucket of Object.values(perGate)) {
    bucket.meanLoss = bucket.count > 0 ? bucket.totalLoss / bucket.count : 0;
  }

  return {
    totalLoss,
    count,
    meanLoss: count > 0 ? totalLoss / count : 0,
    perGate,
    degradedCount,
  };
}

const DEFAULT_RISE_THRESHOLD = 0.25;

/**
 * The leading-indicator alarm: fire when accumulated loss is rising past the
 * threshold WHILE every binary verdict is still green — the "all green, but
 * accumulated loss up 40% this month" sentence that prevents a surprise failure.
 *
 * The alarm deliberately says nothing when a verdict already failed (the binary
 * gate is already shouting) or when loss is flat/falling. `previous <= 0` cannot
 * yield a meaningful fractional rise, so the alarm holds unless `current` is also
 * positive, in which case any rise from zero counts as a full-magnitude rise.
 */
export function detectLossAlarm(input: LossAlarmInput): LossAlarm {
  const { previous, current, allVerdictsGreen } = input;
  const riseThreshold = input.riseThreshold ?? DEFAULT_RISE_THRESHOLD;

  let riseFraction: number;
  if (previous > 0) {
    riseFraction = (current - previous) / previous;
  } else {
    // From a zero/negative baseline any positive current is an unbounded rise;
    // represent it as a full-magnitude rise so the threshold comparison is honest
    // without producing Infinity.
    riseFraction = current > 0 ? 1 : 0;
  }

  const rising = riseFraction >= riseThreshold;
  const firing = allVerdictsGreen && rising;

  let reason: string;
  if (!allVerdictsGreen) {
    reason = 'Not a leading-indicator alarm: a binary verdict already failed.';
  } else if (!rising) {
    reason = `Accumulated loss is stable (rise ${(riseFraction * 100).toFixed(1)}% < threshold ${(riseThreshold * 100).toFixed(0)}%).`;
  } else {
    reason = `All verdicts green, but accumulated loss rose ${(riseFraction * 100).toFixed(1)}% (threshold ${(riseThreshold * 100).toFixed(0)}%) — drifting toward limits.`;
  }

  return { firing, riseFraction, reason };
}
