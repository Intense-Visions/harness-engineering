/**
 * Model-proposal diff engine (Phase 5b).
 *
 * `diffPoolAgainstRanking` is the pure function the Phase 6 scheduler calls each
 * tick: it compares the current pool (`PoolManager.snapshot()`) against the
 * latest ranking and emits at most one swap proposal per pool entry that has a
 * viable, hardware-fitting, not-already-pooled candidate beating it by at least
 * `proposalThreshold` (F6). Emitted `(target, replaces)` pairs are suppressed
 * when the same pair is already pending review or was previously rejected (F7),
 * so a rejected suggestion is never re-surfaced on the next diff.
 *
 * The engine is deliberately side-effect free — it returns
 * `ModelProposalContent[]` and never touches disk, the installer, or the bus.
 * Persisting the records, wiring the bus, and the 24h scheduler wrapper are the
 * scheduler's job (Phase 6); the approve/install lifecycle is the orchestrator
 * handler's job (Task 15).
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 5b; F6, F7)
 */

import type { ModelProposalContent } from '@harness-engineering/types';
import type { PoolEntry, PoolState } from '../pool/types.js';
import type { RankedModel } from '../ranker/types.js';
import { estimateDiskGb } from '../ranker/index.js';
import { buildJustification } from './justification.js';

/** A `(target, replaces)` identity used to dedup against pending/rejected history. */
export interface DedupPair {
  /** `ollamaName` of the proposed swap-in. */
  target: string;
  /** `ollamaName` of the entry being replaced. Absent for a pure add. */
  replaces?: string;
}

/** Inputs to {@link diffPoolAgainstRanking}. */
export interface DiffInput {
  /** Current pool snapshot. */
  pool: PoolState;
  /** Latest ranking (already hardware-scored and sorted upstream). */
  ranked: RankedModel[];
  /** Minimum score improvement required before a swap is proposed. */
  proposalThreshold: number;
  /** Operator VRAM budget in GB — forwarded to the justification renderer. */
  vramGb: number;
  /** `(target, replaces)` pairs currently awaiting review — not re-emitted. */
  pending?: ReadonlyArray<DedupPair>;
  /** `(target, replaces)` pairs previously rejected — never re-emitted (F7). */
  rejected?: ReadonlyArray<DedupPair>;
}

function pairKey(target: string, replaces?: string): string {
  return `${target} ${replaces ?? ''}`;
}

/**
 * Diff the pool against the ranking and return the swap proposals to raise.
 * Deterministic: entries are processed in `ollamaName` order and each swap-in
 * candidate is claimed at most once, so the same candidate is never proposed to
 * replace two different entries in a single diff.
 */
export function diffPoolAgainstRanking(input: DiffInput): ModelProposalContent[] {
  const { pool, ranked, proposalThreshold, vramGb } = input;

  const pooledNames = new Set(pool.entries.map((e) => e.ollamaName));
  const suppressed = new Set<string>();
  for (const p of input.pending ?? []) suppressed.add(pairKey(p.target, p.replaces));
  for (const r of input.rejected ?? []) suppressed.add(pairKey(r.target, r.replaces));

  // Target-level suppression for PENDING proposals: if a model is already the
  // install target of an open proposal, do not propose installing it AGAIN to
  // replace a different member. The per-pair `suppressed` set above only blocks
  // the exact (target, replaces) pair, so across ticks the same model would
  // otherwise accumulate multiple pending proposals — two "Swap in llama3.3:70b"
  // rows for different members, all pulling the same blob. Rejected pairs stay
  // pair-level: declining one swap of a model does not veto a different swap of it.
  const pendingTargets = new Set<string>();
  for (const p of input.pending ?? []) pendingTargets.add(p.target);

  const claimed = new Set<string>();
  const proposals: ModelProposalContent[] = [];

  const entries = [...pool.entries].sort((a, b) => a.ollamaName.localeCompare(b.ollamaName));

  for (const entry of entries) {
    // F7 fall-through: a suppressed (pending/rejected) top pick does not skip the
    // entry — `bestCandidateFor` keeps scanning for the next-best NON-suppressed
    // viable swap so a never-seen candidate is still surfaced (P5-SUG-ENGINE).
    const candidate = bestCandidateFor(entry, ranked, {
      proposalThreshold,
      pooledNames,
      claimed,
      suppressed,
      pendingTargets,
    });
    if (candidate === undefined || candidate.ollamaName === undefined) continue;

    claimed.add(candidate.ollamaName);
    proposals.push(buildSwapProposal(entry, candidate, vramGb));
  }

  return proposals;
}

/**
 * Assemble the `ModelProposalContent` for a chosen `(entry, candidate)` swap.
 * Extracted from {@link diffPoolAgainstRanking} so the on-disk sizing (and its
 * optional-`activeB` branch) does not inflate the loop's cyclomatic complexity.
 */
function buildSwapProposal(
  entry: PoolEntry,
  candidate: RankedModel,
  vramGb: number
): ModelProposalContent {
  return {
    action: 'swap',
    target: { hfRepoId: candidate.hfRepoId, ollamaName: candidate.ollamaName! },
    replaces: { ollamaName: entry.ollamaName },
    scoreDelta: candidate.score - entry.currentScore,
    justification: buildJustification({
      target: candidate,
      currentScore: entry.currentScore,
      vramGb,
    }),
    // On-disk footprint ≈ the candidate's quantized weight tensors, sized by
    // the ranker's weight math (P5-SUG-EVICT-a).
    diskImpactGb: estimateDiskGb({
      sizeB: candidate.sizeB,
      quant: candidate.quant,
      ...(candidate.activeB !== undefined ? { activeB: candidate.activeB } : {}),
    }),
  };
}

/**
 * Highest-scoring ranked candidate eligible to replace `entry`: fits hardware,
 * has an Ollama name, is not already pooled, has not been claimed by an earlier
 * entry this diff, is not a suppressed (pending/rejected) pair for this entry
 * (F7), and beats the entry by at least `proposalThreshold`. Suppression is
 * evaluated per-candidate so a suppressed top pick falls through to the
 * next-best viable candidate rather than skipping the entry (P5-SUG-ENGINE).
 */
function bestCandidateFor(
  entry: PoolEntry,
  ranked: readonly RankedModel[],
  ctx: {
    proposalThreshold: number;
    pooledNames: Set<string>;
    claimed: Set<string>;
    suppressed: Set<string>;
    pendingTargets: Set<string>;
  }
): RankedModel | undefined {
  let best: RankedModel | undefined;
  for (const c of ranked) {
    if (!c.fitsHardware) continue;
    if (c.ollamaName === undefined) continue;
    if (ctx.pooledNames.has(c.ollamaName)) continue;
    if (ctx.claimed.has(c.ollamaName)) continue;
    if (ctx.pendingTargets.has(c.ollamaName)) continue; // already a pending install target
    if (ctx.suppressed.has(pairKey(c.ollamaName, entry.ollamaName))) continue;
    if (c.score - entry.currentScore < ctx.proposalThreshold) continue;
    if (best === undefined || c.score > best.score) best = c;
  }
  return best;
}
