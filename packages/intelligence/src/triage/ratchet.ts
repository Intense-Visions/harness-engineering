// packages/intelligence/src/triage/ratchet.ts
//
// Roadmap Auto-Triage — Phase 4, Task 2: the pure autonomy-ratchet stage resolver.
//
// Given a shape's recorded outcomes (the graded matched/mispredict history the
// precedent store accretes), decide the AUTONOMY STAGE currently earned:
//   stage 1 = human before execution (the safe default / cold-start), and
//   stage 2 = auto-execute, human verifies every autonomous PR (v1's ceiling).
//
// v1 HARD CAP (SC4): this never returns 3 or 4 — sampled-verify (3) and
// fully-autonomous merge (4) are deferred post-v1, so the resolver is clamped to
// {@link V1_MAX_STAGE} = 2 no matter how strong the record. Advancement is
// evidence-only (SC6): stage 2 is earned when the success-rate over a trailing
// window of at least `minSample` graded outcomes meets `threshold`. Recency is
// deliberate — a fresh mispredict inside the window drops the rate and HOLDS the
// shape at stage 1 (a mispredict resets/holds, never a manual jump). This is the
// one place autonomy INCREASES automatically, so thresholds stay conservative and
// sample sizes real (plan §Concerns).
//
// Layer note: pure, intelligence-only. No IO, no core/orchestrator import — the
// caller (orchestrator) aggregates the shape's outcomes and hands them in.

/** The autonomy-ratchet stages v1 can resolve. 3/4 are deferred post-v1 (SC4). */
export type V1Stage = 1 | 2;

/** v1's ceiling: the resolver never returns above this (SC4 — stages 3/4 deferred). */
export const V1_MAX_STAGE = 2 as const;

/** One graded outcome for a shape — the only field the ratchet reads. */
export interface RatchetOutcome {
  /** True iff the post-diff verdict stayed within the prediction (the comparator's `matched`). */
  matched: boolean;
}

/** Advancement rules. Conservative defaults; the caller may override per policy. */
export interface RatchetConfig {
  /** Minimum trailing-window success-rate required to advance from stage 1 → 2 (SC6). */
  threshold: number;
  /** Minimum number of graded outcomes in the window before advancement is even considered. */
  minSample: number;
  /** Trailing-window size: only the most recent `window` outcomes count (recency ⇒ a mispredict resets). */
  window: number;
}

/**
 * Conservative default policy: a shape must show ≥ 90% matches over its most recent
 * 10 graded outcomes (at least `minSample` of them) before it earns stage 2. A single
 * recent mispredict inside a 10-wide window is 90% → still at the edge; two drop it below.
 */
export const DEFAULT_RATCHET_CONFIG: RatchetConfig = {
  threshold: 0.9,
  minSample: 5,
  window: 10,
};

/**
 * Resolve the autonomy stage a shape has EARNED from its graded history.
 *
 * Returns stage 1 (the safe default) at cold-start, below `minSample`, or whenever
 * the trailing-window success-rate is under `threshold` (a recent mispredict resets).
 * Returns stage 2 once the evidence clears the bar. NEVER returns above
 * {@link V1_MAX_STAGE} (SC4) — the value is clamped as a belt-and-suspenders guard so
 * a future config change can't accidentally leak a deferred stage.
 */
export function resolveStage(
  history: readonly RatchetOutcome[],
  config: RatchetConfig = DEFAULT_RATCHET_CONFIG
): V1Stage {
  const window = Math.max(1, Math.floor(config.window));
  // Recency: only the most recent `window` graded outcomes decide the current stage,
  // so a fresh mispredict genuinely resets the earned rate rather than being diluted
  // by an unbounded clean history.
  const recent = history.slice(-window);
  if (recent.length < config.minSample) return 1;

  // A mispredict RESETS (SC6): the single most-recent outcome being a mispredict holds
  // the shape at stage 1 regardless of the surrounding rate. This is the conservative
  // reset the plan calls for — one fresh miss demotes; the shape must re-earn stage 2
  // over a subsequent clean window, so a recent mispredict can never be averaged away.
  if (recent[recent.length - 1]?.matched === false) return 1;

  const matched = recent.reduce((n, o) => (o.matched ? n + 1 : n), 0);
  const rate = matched / recent.length;
  if (rate < config.threshold) return 1;

  // Evidence clears the bar → stage 2, hard-clamped to v1's ceiling (SC4).
  return Math.min(2, V1_MAX_STAGE) as V1Stage;
}
