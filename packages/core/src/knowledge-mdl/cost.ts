/**
 * MDL knowledge pruning (#1630) — per-entry description cost.
 *
 * Description cost = tokens shipped per inclusion × inclusion frequency. This is
 * the "L(model)" side of the MDL ledger: what the entry taxes every context that
 * ships it, summed across the runs it appeared in.
 */

import type { InclusionEvent } from './types';

/** The description-cost accounting for one knowledge entry. */
export interface DescriptionCost {
  /** The entry this cost is for. */
  entryId: string;
  /** How many times the entry was included across all runs (inclusion frequency). */
  inclusionCount: number;
  /** Total tokens shipped across all inclusions. */
  totalTokensShipped: number;
  /** Mean tokens per inclusion; 0 when never included. */
  meanTokensPerInclusion: number;
  /**
   * The entry's description length, in tokens — the total context tax it levied.
   * Equal to {@link totalTokensShipped}; named separately because it is the MDL
   * quantity the scorer compares against measured value.
   */
  descriptionLength: number;
}

/**
 * Compute the description cost for a single entry from its inclusion events.
 *
 * Pure over its inputs. Inclusions for other entries are ignored, so callers may
 * pass the full inclusion ledger. Zero inclusions yields a zeroed cost (never
 * throws, never divides by zero).
 */
export function computeDescriptionCost(
  entryId: string,
  inclusions: readonly InclusionEvent[]
): DescriptionCost {
  let inclusionCount = 0;
  let totalTokensShipped = 0;
  for (const inclusion of inclusions) {
    if (inclusion.entryId !== entryId) continue;
    inclusionCount += 1;
    totalTokensShipped += inclusion.tokensShipped;
  }
  const meanTokensPerInclusion = inclusionCount === 0 ? 0 : totalTokensShipped / inclusionCount;
  return {
    entryId,
    inclusionCount,
    totalTokensShipped,
    meanTokensPerInclusion,
    descriptionLength: totalTokensShipped,
  };
}

/** The set of run ids an entry was included in (deduplicated). */
export function inclusionRunIds(
  entryId: string,
  inclusions: readonly InclusionEvent[]
): Set<string> {
  const runs = new Set<string>();
  for (const inclusion of inclusions) {
    if (inclusion.entryId === entryId) runs.add(inclusion.runId);
  }
  return runs;
}
