/**
 * Temporal decay functions for specialization scoring.
 *
 * Uses exponential decay to weight recent outcomes more heavily than old ones.
 * The decay formula: weight = e^(-ln(2) / halfLifeDays * ageDays)
 */

/** Configuration for temporal decay calculations. */
export interface TemporalConfig {
  /** Half-life in days (default 30). After this many days, an outcome's weight is halved. */
  halfLifeDays: number;
  /** Reference timestamp for decay calculation (default: now). */
  referenceTime?: string;
}

/**
 * Compute exponential decay weight for an outcome at a given age.
 * Returns 1.0 at age 0, 0.5 at halfLifeDays, 0.25 at 2*halfLifeDays, etc.
 */
export function decayWeight(ageDays: number, halfLifeDays: number): number {
  const clamped = Math.max(0, ageDays);
  return Math.exp((-Math.LN2 / halfLifeDays) * clamped);
}

/**
 * Compute temporally-weighted success rate from timestamped outcomes.
 *
 * Returns 0.5 (neutral prior) when no outcomes are provided.
 * Uses Laplace smoothing with decay-weighted pseudo-counts.
 */
export function temporalSuccessRate(
  outcomes: ReadonlyArray<{ result: 'success' | 'failure'; timestamp: string }>,
  config: TemporalConfig
): number {
  if (outcomes.length === 0) return 0.5;

  const refMs = config.referenceTime ? Date.parse(config.referenceTime) : Date.now();
  const msPerDay = 86_400_000;

  let weightedSuccesses = 0;
  let totalWeight = 0;

  for (const outcome of outcomes) {
    const ageMs = refMs - Date.parse(outcome.timestamp);
    const ageDays = ageMs / msPerDay;
    const weight = decayWeight(ageDays, config.halfLifeDays);

    if (outcome.result === 'success') {
      weightedSuccesses += weight;
    }
    totalWeight += weight;
  }

  // Laplace smoothing: add 1 pseudo-success and 1 pseudo-failure with weight = mean observed
  const smoothingWeight = totalWeight > 0 ? totalWeight / outcomes.length : 1;
  return (weightedSuccesses + smoothingWeight) / (totalWeight + 2 * smoothingWeight);
}
