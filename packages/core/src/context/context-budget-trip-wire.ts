/**
 * Mid-phase context-budget trip wire.
 *
 * Autopilot keeps context fresh *between* phases by dispatching a distinct cold
 * subagent per state, but nothing watches a single long-running turn for context
 * creep *within* its own turn. This module supplies a pure, deterministic helper
 * that classifies a turn's resident-token count (input + output + tool results)
 * as `ok | warn | trip` against absolute, window-keyed anchors, so a running
 * agent can converge-then-checkpoint-and-restart before it drifts into the
 * degraded "dumb zone".
 *
 * The threshold policy is token-anchored and window-keyed rather than a flat
 * percentage: degradation is driven by absolute resident tokens, so a flat
 * percent is wrong on large windows (40% of 1M ~= 400K resident tokens is deep
 * in the dumb zone). Anchors are keyed to a window *class* (1m / 200k / local).
 * Utilization percentages are derived DISPLAY-only values — the trip fires on
 * the absolute token count, never on a percentage.
 *
 * Sources: Chroma _Context Rot_ (2025); NoLiMa (arXiv 2502.05167); RULER
 * (arXiv 2404.06654); _Lost in the Middle_ (arXiv 2307.03172); Anthropic
 * _Effective Context Engineering_ (2025); Horthy / _The Pragmatic Engineer_
 * (2025). See `docs/research/dex-horthy-humanlayer-comparison-analysis.md`
 * [HORTHY-1].
 */

/** A turn's resident-token classification. */
export type ContextBudgetVerdict = 'ok' | 'warn' | 'trip';

/** The window *class* a nominal window resolves to. */
export type ContextWindowBand = '1m' | '200k' | 'local';

/** Absolute, window-keyed trip anchors (resident tokens). */
export interface ContextBudgetThresholds {
  /** Nominal window the anchors were keyed to. */
  window: number;
  /** Resident-token count at/above which to soft-warn (converge + flush state). */
  warnAt: number;
  /** Resident-token count at/above which to hard-trip (checkpoint-and-restart). */
  tripAt: number;
  /** Band label the window resolved to. */
  band: ContextWindowBand;
}

/** A classified evaluation of a turn's resident-token count. */
export interface ContextBudgetEvaluation extends ContextBudgetThresholds {
  /** `ok` below `warnAt`, `warn` in `[warnAt, tripAt)`, `trip` at/above `tripAt`. */
  verdict: ContextBudgetVerdict;
  /** The measured resident-token count that was classified. */
  usedTokens: number;
  /** Derived DISPLAY-only utilization vs nominal window (`usedTokens / window`). */
  utilization: number;
  /**
   * Derived DISPLAY-only utilization vs the RULER effective window
   * (`usedTokens / (window * EFFECTIVE_WINDOW_RATIO)`).
   */
  effectiveUtilization: number;
}

/** RULER effective-window ratio: usable context ~= 0.6 x nominal window. */
export const EFFECTIVE_WINDOW_RATIO = 0.6;

// Band boundaries and anchors (resident tokens).
const ONE_M_MIN_WINDOW = 900_000;
const TWO_HUNDRED_K_MIN_WINDOW = 150_000;
const ONE_M_WARN = 250_000;
const ONE_M_TRIP = 350_000;
const TWO_HUNDRED_K_WARN = 80_000;
const TWO_HUNDRED_K_TRIP = 100_000;
const LOCAL_WARN_RATIO = 0.3;
const LOCAL_TRIP_RATIO = 0.375; // midpoint of the research's 35-40% hard-trip range

/**
 * Resolve the absolute warn/trip anchors for a nominal window size.
 *
 * The window is matched to the nearest defined class at-or-below: `1m` and
 * `200k` use absolute research anchors (floors keyed to a window class, not a
 * fixed fraction of the exact window); `local` derives from ratios because
 * sub-128K windows vary widely. `overrides` pin explicit anchors without
 * changing band selection; `tripAt` is clamped to be `>= warnAt` so the
 * two-stage warn-then-trip ordering always holds.
 */
export function resolveContextBudgetThresholds(
  window: number,
  overrides?: Partial<Pick<ContextBudgetThresholds, 'warnAt' | 'tripAt'>>
): ContextBudgetThresholds {
  let band: ContextWindowBand;
  let warnAt: number;
  let tripAt: number;

  if (window >= ONE_M_MIN_WINDOW) {
    band = '1m';
    warnAt = ONE_M_WARN;
    tripAt = ONE_M_TRIP;
  } else if (window >= TWO_HUNDRED_K_MIN_WINDOW) {
    band = '200k';
    warnAt = TWO_HUNDRED_K_WARN;
    tripAt = TWO_HUNDRED_K_TRIP;
  } else {
    band = 'local';
    warnAt = Math.round(LOCAL_WARN_RATIO * window);
    tripAt = Math.round(LOCAL_TRIP_RATIO * window);
  }

  if (overrides?.warnAt !== undefined) warnAt = overrides.warnAt;
  if (overrides?.tripAt !== undefined) tripAt = overrides.tripAt;
  if (tripAt < warnAt) tripAt = warnAt; // clamp: a trip anchor never precedes the warn anchor

  return { window, warnAt, tripAt, band };
}

/**
 * Classify a turn's resident-token count as `ok | warn | trip`.
 *
 * The caller supplies the already-measured `usedTokens` (input + output + tool
 * results) — prefer the model's real cumulative usage counter, falling back to
 * a `chars/4` estimate only when usage is not surfaced. Ties trip (`>=`):
 * being *at* an anchor already means degradation risk. `utilization` and
 * `effectiveUtilization` are derived DISPLAY-only values and never the trip
 * condition.
 */
export function evaluateContextBudget(
  usedTokens: number,
  window: number,
  overrides?: Partial<Pick<ContextBudgetThresholds, 'warnAt' | 'tripAt'>>
): ContextBudgetEvaluation {
  const thresholds = resolveContextBudgetThresholds(window, overrides);
  const verdict: ContextBudgetVerdict =
    usedTokens >= thresholds.tripAt ? 'trip' : usedTokens >= thresholds.warnAt ? 'warn' : 'ok';

  return {
    ...thresholds,
    verdict,
    usedTokens,
    utilization: usedTokens / window,
    effectiveUtilization: usedTokens / (window * EFFECTIVE_WINDOW_RATIO),
  };
}
