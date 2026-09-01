/**
 * MDL knowledge pruning (#1630) — store-level MDL ledger.
 *
 * Rolls per-entry scores and merge candidates into the store's fitness report:
 * total description length vs total measured value, the pending prune candidates
 * (with reversible tombstone plans), the merge candidates, and the
 * insufficient-evidence set. Report-only — nothing here archives, tombstones, or
 * deletes an entry. Executing the recommendations is deferred (#1630).
 */

import { findMergeCandidates, type MergeCandidate } from './consolidate';
import { scoreEntries, type EntryScore } from './score';
import type { InclusionEvent, KnowledgeEntry, MdlConfig, RunOutcome } from './types';
import { DEFAULT_MDL_CONFIG } from './types';

/** A reversible prune recommendation — a tombstone plan, never a deletion. */
export interface PruneRecommendation {
  entryId: string;
  /** Net MDL contribution (negative — that is why it is recommended). */
  netMdl: number;
  /** The measured rationale. */
  rationale: string;
  /**
   * How to reverse it. This slice recommends a reversible archive/tombstone; it
   * never deletes. Restated on every recommendation so the report can never be
   * read as authorizing a destructive delete.
   */
  reversal: 'restore-from-tombstone';
}

/** The store-level MDL report. */
export interface MdlReport {
  /** Number of entries scored. */
  entryCount: number;
  /** Total description length across the store, in tokens. */
  totalDescriptionLength: number;
  /**
   * Total measured value across entries with sufficient evidence, in tokens.
   * Entries scored `insufficient-evidence` contribute 0 (their value is unknown,
   * not zero — see {@link insufficientEvidenceCount}).
   */
  totalMeasuredValue: number;
  /** totalMeasuredValue − totalDescriptionLength (over sufficiently-evidenced entries). */
  netStoreMdl: number;
  /** Every per-entry score. */
  scores: EntryScore[];
  /** Prune candidates (verdict `prune`), ranked most-negative net MDL first. */
  pruneCandidates: PruneRecommendation[];
  /** Merge candidates, ranked by savings. */
  mergeCandidates: MergeCandidate[];
  /** Count of entries retained by default for lack of evidence. */
  insufficientEvidenceCount: number;
  /**
   * Always true: this report only recommends. Executing the prune/merge is
   * deferred (#1630); no entry is mutated by producing this report.
   */
  reportOnly: true;
}

/**
 * Build the store-level MDL report from the knowledge entries and their
 * inclusion + outcome telemetry. Pure over its inputs; empty inputs yield a
 * zeroed ledger (never throws).
 */
export function buildMdlReport(
  entries: readonly KnowledgeEntry[],
  inclusions: readonly InclusionEvent[],
  outcomes: readonly RunOutcome[],
  config: MdlConfig = DEFAULT_MDL_CONFIG
): MdlReport {
  const scores = scoreEntries(entries, inclusions, outcomes, config);

  let totalDescriptionLength = 0;
  let totalMeasuredValue = 0;
  let insufficientEvidenceCount = 0;
  const pruneCandidates: PruneRecommendation[] = [];

  for (const score of scores) {
    totalDescriptionLength += score.descriptionCost.descriptionLength;
    if (score.verdict === 'insufficient-evidence') {
      insufficientEvidenceCount += 1;
      continue;
    }
    if (score.totalMeasuredValue !== null) totalMeasuredValue += score.totalMeasuredValue;
    if (score.verdict === 'prune' && score.netMdl !== null) {
      pruneCandidates.push({
        entryId: score.entryId,
        netMdl: score.netMdl,
        rationale: score.rationale,
        reversal: 'restore-from-tombstone',
      });
    }
  }

  pruneCandidates.sort((a, b) => a.netMdl - b.netMdl || a.entryId.localeCompare(b.entryId));

  return {
    entryCount: entries.length,
    totalDescriptionLength,
    totalMeasuredValue,
    netStoreMdl: totalMeasuredValue - totalDescriptionLength,
    scores,
    pruneCandidates,
    mergeCandidates: findMergeCandidates(entries, config),
    insufficientEvidenceCount,
    reportOnly: true,
  };
}
