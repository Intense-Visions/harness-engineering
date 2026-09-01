/**
 * Pure computation of continuous {@link GateLoss} from a raw
 * {@link GateMeasurement} (issue #1673). Emission only — no gate decision here.
 */
import type { GateMeasurement } from '@harness-engineering/types';
import type { GateLoss } from './types';

/**
 * Upper cap on proximity (and therefore `sqrt(loss)`) so a divide-by-zero or a
 * wildly-breaching measurement yields a large-but-finite, comparable number
 * rather than `Infinity`. A breach 1000x past the limit is already off the top
 * of any trend chart; clamping keeps sums and means well-defined.
 */
export const MAX_PROXIMITY = 1_000;

/**
 * Compute the continuous loss for one thresholded measurement.
 *
 * `margin` is the signed slack in the gate's own units; `proximity` normalizes
 * the measurement so 1 == exactly at the threshold regardless of unit or scale;
 * `loss = proximity ** 2` is the quadratic Taguchi loss, comparable across gates.
 *
 * Robustness: when the normalizing denominator is 0 (an `upper` gate whose
 * `target` is 0, or a `lower` gate whose `measured` is 0) proximity is clamped to
 * {@link MAX_PROXIMITY} on a breach or 0 on an exact-zero match, and the result
 * is flagged `degraded`. Non-finite inputs are treated the same way rather than
 * propagating `NaN`/`Infinity` — and `margin` is zeroed in that case so NO
 * emitted field is ever non-finite.
 *
 * Assumes non-negative `measured`/`target` (the domains it serves — coverage %,
 * complexity, latency, size — are all non-negative). Proximity is normalized by
 * ratio, so a sign flip from a negative input would make a breach look like slack;
 * a negative ratio is clamped to 0 rather than trusted.
 */
/**
 * Normalized proximity to the threshold, with the degradation flag. Factored out
 * of {@link computeGateLoss} so each function stays within the complexity budget.
 *
 * `1` at the threshold, `< 1` with margin, `> 1` breaching; clamped to
 * `[0, MAX_PROXIMITY]`. `degraded` is set when the ratio could not be computed
 * (non-finite input or a zero denominator) or had to be clamped.
 */
function computeProximity(
  numer: number,
  denom: number,
  inputsFinite: boolean
): { proximity: number; degraded: boolean } {
  if (!inputsFinite) {
    // Non-finite input — no meaningful ratio. Treat as a maximal (degraded)
    // breach so it is visible but never NaN.
    return { proximity: MAX_PROXIMITY, degraded: true };
  }
  if (denom === 0) {
    // 0/0 (both zero) is an exact match → 0; otherwise an infinite relative
    // breach clamped to the cap.
    return { proximity: numer === 0 ? 0 : MAX_PROXIMITY, degraded: true };
  }
  const ratio = numer / denom;
  // A negative numerator/denominator can produce a negative ratio; loss is about
  // magnitude of proximity to the limit, so clamp the low end at 0.
  if (ratio < 0) return { proximity: 0, degraded: false };
  if (ratio > MAX_PROXIMITY) return { proximity: MAX_PROXIMITY, degraded: true };
  return { proximity: ratio, degraded: false };
}

export function computeGateLoss(m: GateMeasurement): GateLoss {
  const { measured, target, bound } = m;

  const inputsFinite = Number.isFinite(measured) && Number.isFinite(target);
  // Zero the margin when inputs are non-finite so no emitted field leaks
  // NaN/Infinity into a rendered report (the proximity/loss path clamps below).
  const margin = !inputsFinite ? 0 : bound === 'upper' ? target - measured : measured - target;

  const denom = bound === 'upper' ? target : measured;
  const numer = bound === 'upper' ? measured : target;
  const { proximity, degraded } = computeProximity(numer, denom, inputsFinite);

  return {
    ...m,
    margin,
    proximity,
    loss: proximity * proximity,
    ...(degraded ? { degraded: true } : {}),
  };
}

/** Compute loss for a batch of measurements, preserving order. */
export function computeGateLosses(measurements: readonly GateMeasurement[]): GateLoss[] {
  return measurements.map(computeGateLoss);
}
