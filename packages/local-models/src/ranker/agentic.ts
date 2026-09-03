/**
 * Agentic-suitability scoring — the PURE half of the agentic dimension.
 *
 * The pool ranker scores candidates by VRAM fitness + bandwidth-estimated speed
 * + benchmark confidence, but "fits + fast-on-paper" is not "usable for
 * autonomous agentic dispatch": a model that fits memory can still refuse to
 * emit `tool_calls` (can't drive the loop at all) or take a 4-minute single turn
 * (unusable interactively). This module composes those signals into an
 * `agenticScore` / `agenticEligible` / `agenticReasons` triple the recommender
 * and AMR use to select for dispatch — WITHOUT touching the primary `score` or
 * the default ranking order (D4).
 *
 * It is pure by construction: the agentic SIGNALS (`toolCalling`,
 * `measuredAgenticLatencyMs`) arrive as candidate INPUTS (D1). The only I/O —
 * probing those signals — lives in `capability/agentic.ts`, never here.
 *
 * Gate order (D2 → D3 → D4):
 *   1. tool-calling HARD gate — `false` ⇒ ineligible, score 0 (excluded, not
 *      down-ranked); `undefined` ⇒ eligible but flagged `toolCallingUnknown`
 *      (fail-open, matching the probe's own posture).
 *   2. latency gate/penalty — measured latency over `latencyBudgetMs` ⇒
 *      ineligible; under budget ⇒ `f(latency)` scales the score inversely
 *      (monotonic decreasing). Unmeasured ⇒ fall back to a speed-derived
 *      estimate, steeply discounted + flagged.
 *   3. compose — `agenticScore = f(latency) × benchmarkScore × buildQuality?`,
 *      optionally weighted by `agenticWeight`.
 *
 * @see docs/changes/local-model-agentic-suitability/proposal.md (D1–D5, SC1–SC6)
 */

/** Default agentic-latency budget (ms) — a turn slower than this is unusable for an interactive loop (D3). */
export const DEFAULT_LATENCY_BUDGET_MS = 120_000;

/**
 * Steep discount applied to the score when latency is *estimated* (unmeasured)
 * rather than measured (D3: "steeply discounted, flagged"). A measured model
 * always out-scores an equivalent estimated one, so probing pays off.
 */
const UNMEASURED_LATENCY_DISCOUNT = 0.5;

/** Stable reason/flag strings — asserted by tests, so they live as named constants. */
export const AGENTIC_REASON = {
  noToolCalling: 'no tool-calling',
  toolCallingUnknown: 'toolCallingUnknown',
  latencyOverBudget: 'measured latency over budget',
  latencyEstimated: 'latency estimated (unmeasured)',
  unfitHardware: 'does not fit hardware',
} as const;

/** Pure inputs the agentic scorer consumes — all derived from candidate fields + existing estimates. */
export interface AgenticScoreInput {
  /** Confirmed tool-calling capability, or `undefined` when unprobed. */
  toolCalling?: boolean;
  /** Measured agentic turn latency (ms), or `undefined` when unmeasured. */
  measuredAgenticLatencyMs?: number;
  /** Optional learned build-quality multiplier on `[0, 1]`. */
  buildQuality?: number;
  /** Latency budget (ms) from `RankOptions.latencyBudgetMs`. */
  latencyBudgetMs: number;
  /** Optional weight applied to the composed score. */
  agenticWeight?: number;
  /**
   * Raw merged benchmark score on the `[0, 100]` scale — the quality term of
   * the composition. Pass the same value the primary composite is built from.
   */
  benchmarkScore: number;
  /**
   * Bandwidth-estimated throughput (tok/s) from the speed estimator — used to
   * synthesise a fallback latency when `measuredAgenticLatencyMs` is absent.
   */
  speedTokPerSec: number;
  /** Whether the candidate fits hardware — an unfit model can't run agentically. */
  fitsHardware: boolean;
}

/** The three agentic fields the ranker attaches to each `RankedModel`. */
export interface AgenticScore {
  agenticScore: number;
  agenticEligible: boolean;
  agenticReasons: string[];
}

/**
 * Assumed number of tokens in a representative agentic turn — used to convert a
 * throughput estimate (tok/s) into a latency estimate (ms) when latency is
 * unmeasured. A coarse constant is fine: the estimate is *steeply discounted*
 * and flagged, so it only orders unmeasured candidates among themselves.
 */
const ESTIMATED_TURN_TOKENS = 600;

/**
 * Monotonic-decreasing latency response on `(0, 1]`. `f(0) = 1`; `f(budget) =
 * 0.5`; strictly decreasing in `latency` for a fixed budget, so a slower model
 * always scores lower than a faster one (SC3). Latency ≥ 0 is assumed (the
 * caller floors it).
 */
function latencyResponse(latencyMs: number, budgetMs: number): number {
  const budget = budgetMs > 0 ? budgetMs : DEFAULT_LATENCY_BUDGET_MS;
  return budget / (budget + Math.max(0, latencyMs));
}

/**
 * Derive a fallback latency (ms) from the throughput estimate. Zero/unknown
 * throughput ⇒ `Infinity` (treated as maximally slow, floored by the response
 * curve, never a divide-by-zero).
 */
function estimateLatencyMs(speedTokPerSec: number): number {
  if (!(speedTokPerSec > 0)) return Number.POSITIVE_INFINITY;
  return (ESTIMATED_TURN_TOKENS / speedTokPerSec) * 1000;
}

/**
 * Compose the agentic triple from the pure inputs. See the module docstring for
 * the gate order. Never throws; always returns a fully-populated `AgenticScore`.
 */
export function scoreAgentic(input: AgenticScoreInput): AgenticScore {
  const reasons: string[] = [];

  // An unfit model can't run at all — ineligible before any agentic gate.
  if (!input.fitsHardware) {
    reasons.push(AGENTIC_REASON.unfitHardware);
    return { agenticScore: 0, agenticEligible: false, agenticReasons: reasons };
  }

  // D2 — tool-calling HARD gate. Confirmed `false` ⇒ excluded, score 0.
  if (input.toolCalling === false) {
    reasons.push(AGENTIC_REASON.noToolCalling);
    return { agenticScore: 0, agenticEligible: false, agenticReasons: reasons };
  }
  // `undefined` ⇒ eligible but flagged (fail-open).
  if (input.toolCalling === undefined) {
    reasons.push(AGENTIC_REASON.toolCallingUnknown);
  }

  // D3 — latency gate/penalty. Measured beats estimated.
  const measured = input.measuredAgenticLatencyMs;
  if (measured !== undefined && measured > input.latencyBudgetMs) {
    reasons.push(AGENTIC_REASON.latencyOverBudget);
    return { agenticScore: 0, agenticEligible: false, agenticReasons: reasons };
  }

  const latencyMs = measured ?? estimateLatencyMs(input.speedTokPerSec);
  let response = latencyResponse(latencyMs, input.latencyBudgetMs);
  if (measured === undefined) {
    response *= UNMEASURED_LATENCY_DISCOUNT; // steeply discounted + flagged
    reasons.push(AGENTIC_REASON.latencyEstimated);
  }

  // D4 — compose: f(latency) × benchmarkScore × (buildQuality?) × (agenticWeight?).
  // Clamp caller-supplied multipliers to non-negative so a stray negative
  // config can never produce a negative agenticScore on an ELIGIBLE model
  // (which would then sort below an ineligible score-0 model).
  const buildQuality = Math.max(0, input.buildQuality ?? 1);
  const weight = Math.max(0, input.agenticWeight ?? 1);
  const agenticScore = response * input.benchmarkScore * buildQuality * weight;

  return { agenticScore, agenticEligible: true, agenticReasons: reasons };
}
