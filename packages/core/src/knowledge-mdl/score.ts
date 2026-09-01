/**
 * MDL knowledge pruning (#1630) — per-entry MDL score + verdict.
 *
 * Combines the description cost (tokens taxed) against the compression value
 * (tokens of rework avoided) into a net MDL contribution and a verdict. This is
 * where the discipline is enforced: `insufficient-evidence` is a first-class
 * verdict and NEVER yields a prune recommendation — pruning requires measured
 * worthlessness, never measurement absence.
 *
 * Report-only: a verdict is a recommendation. Nothing here mutates the store.
 */

import { computeDescriptionCost, inclusionRunIds, type DescriptionCost } from './cost';
import { estimateCompressionValue, type CompressionValue } from './matched-comparison';
import type { InclusionEvent, KnowledgeEntry, MdlConfig, MdlVerdict, RunOutcome } from './types';

/** The full MDL score for one knowledge entry. */
export interface EntryScore {
  /** The entry this score is for. */
  entryId: string;
  /** Optional tags carried through for reporting. */
  tags: string[];
  /** Description-cost accounting (the tokens the entry taxed). */
  descriptionCost: DescriptionCost;
  /** Compression-value estimate (the rework tokens it avoided). */
  compressionValue: CompressionValue;
  /** Distinct runs the entry was present in (used to scale per-run value). */
  presentRunCount: number;
  /**
   * Total measured value across the runs the entry was present in, in tokens.
   * `null` when evidence is insufficient.
   */
  totalMeasuredValue: number | null;
  /**
   * Net MDL contribution = totalMeasuredValue − descriptionLength, in tokens.
   * Positive means the entry pays rent. `null` when evidence is insufficient.
   */
  netMdl: number | null;
  /** The verdict. */
  verdict: MdlVerdict;
  /** Why this verdict was reached. */
  rationale: string;
}

/**
 * Score a single knowledge entry. Pure over its inputs; callers may pass the
 * full inclusion + outcome ledgers (events for other entries are ignored).
 */
export function scoreEntry(
  entry: KnowledgeEntry,
  inclusions: readonly InclusionEvent[],
  outcomes: readonly RunOutcome[],
  config: MdlConfig
): EntryScore {
  const descriptionCost = computeDescriptionCost(entry.id, inclusions);
  const compressionValue = estimateCompressionValue(entry.id, inclusions, outcomes, config);
  const presentRunCount = inclusionRunIds(entry.id, inclusions).size;
  const tags = entry.tags ?? [];

  // Insufficient evidence is terminal: never prune, never fabricate a number.
  if (!compressionValue.sufficient || compressionValue.value === null) {
    return {
      entryId: entry.id,
      tags,
      descriptionCost,
      compressionValue,
      presentRunCount,
      totalMeasuredValue: null,
      netMdl: null,
      verdict: 'insufficient-evidence',
      rationale: `insufficient evidence to judge — retained by default. ${compressionValue.reason}`,
    };
  }

  const totalMeasuredValue = compressionValue.value * presentRunCount;
  const netMdl = totalMeasuredValue - descriptionCost.descriptionLength;

  if (netMdl < -config.pruneMargin) {
    return {
      entryId: entry.id,
      tags,
      descriptionCost,
      compressionValue,
      presentRunCount,
      totalMeasuredValue,
      netMdl,
      verdict: 'prune',
      rationale:
        `measured net cost: taxes ${descriptionCost.descriptionLength} tokens, ` +
        `saves ${totalMeasuredValue.toFixed(0)} (net ${netMdl.toFixed(0)}, ` +
        `margin ${config.pruneMargin}). Reversible tombstone recommended.`,
    };
  }

  return {
    entryId: entry.id,
    tags,
    descriptionCost,
    compressionValue,
    presentRunCount,
    totalMeasuredValue,
    netMdl,
    verdict: 'keep',
    rationale:
      `pays rent: saves ${totalMeasuredValue.toFixed(0)} tokens against a ` +
      `${descriptionCost.descriptionLength}-token cost (net ${netMdl.toFixed(0)}).`,
  };
}

/** Score every entry in the store. */
export function scoreEntries(
  entries: readonly KnowledgeEntry[],
  inclusions: readonly InclusionEvent[],
  outcomes: readonly RunOutcome[],
  config: MdlConfig
): EntryScore[] {
  return entries.map((entry) => scoreEntry(entry, inclusions, outcomes, config));
}
