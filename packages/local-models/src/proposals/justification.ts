/**
 * Model-proposal justification renderer (Phase 5b).
 *
 * Turns a single `RankedModel` swap candidate (the output the ranker already
 * produced, plus the current pool member's score and the operator's VRAM) into
 * the human-readable `ModelProposalContent['justification']` block the review
 * queue and dashboard render. Pure — no I/O, no ranker re-run — so the diff
 * engine (`engine.ts`) can call it per emitted proposal and the tests can pin
 * the exact rationale strings.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 5b)
 */

import type { ModelProposalContent } from '@harness-engineering/types';
import type { RankedModel } from '../ranker/types.js';

/** Inputs to {@link buildJustification}. */
export interface JustificationInput {
  /** The ranked swap-in candidate. */
  target: RankedModel;
  /** Score of the pool member this candidate would replace. Absent for a pure add. */
  currentScore?: number;
  /** Operator VRAM budget in GB — surfaced in the hardware-fit line. */
  vramGb: number;
}

/**
 * Render a `RankedModel` (plus the current member's score + operator VRAM) into
 * the model-proposal justification block. The `summary` names the candidate,
 * `benchmarkBasis` carries the score delta, `hardwareFit` the VRAM comparison,
 * `evidence` the ranker's weakest-evidence grade, and `freshness` the snapshot
 * date — everything a reviewer needs without re-opening the ranking.
 */
export function buildJustification(
  input: JustificationInput
): ModelProposalContent['justification'] {
  const { target, currentScore, vramGb } = input;
  const name = target.ollamaName ?? target.hfRepoId;
  const targetScore = score(target.score);
  const summary =
    currentScore !== undefined
      ? `Swap in ${name} (score ${targetScore}) to replace a pool member scoring ${score(currentScore)}.`
      : `Add ${name} (score ${targetScore}) to the pool.`;
  const benchmarkBasis =
    currentScore !== undefined
      ? [`Composite score ${targetScore} vs current ${score(currentScore)}`]
      : [`Composite score ${targetScore}`];
  return {
    summary,
    benchmarkBasis,
    hardwareFit: `${gb(target.estimatedVramGb)}GB VRAM est; you have ${gb(vramGb)}GB`,
    evidence: String(target.evidence),
    freshness: `Benchmark snapshot ${target.benchmarkSnapshot}`,
  };
}

/** Absolute scores render as whole numbers so raw floats never reach the operator. */
function score(n: number): number {
  return Math.round(n);
}

/** GB values render to at most one decimal (trailing `.0` dropped). */
function gb(n: number): number {
  return Math.round(n * 10) / 10;
}
