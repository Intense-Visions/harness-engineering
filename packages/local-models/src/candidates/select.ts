/**
 * Candidate selection (LMLM Phase 2, D3).
 *
 * Filters a candidate list to the operator's approved trust line — the same
 * `allowedOrgs` / `allowedFamilies` bounds the pool enforces at install time
 * — so the Recommendations card never surfaces a model the operator could not
 * actually install. Org is derived from the `hfRepoId` prefix; family from the
 * optional `family` tag.
 *
 * @see docs/changes/lmlm-functional-wiring/proposal.md (Phase 2, D3)
 */

import type { RankerCandidate } from '../ranker/index.js';
import type { FrozenCandidate } from './types.js';

/** The subset of pool bounds relevant to candidate selection. */
export interface CandidateSelectionBounds {
  allowedOrgs: readonly string[];
  allowedFamilies: readonly string[];
}

/** Derive the HF org from a repo id (`Qwen/Qwen3-32B-GGUF` → `Qwen`). */
function orgOf(hfRepoId: string): string {
  const slash = hfRepoId.indexOf('/');
  return slash === -1 ? hfRepoId : hfRepoId.slice(0, slash);
}

/**
 * Keep only candidates whose org is in `allowedOrgs` and (when `allowedFamilies`
 * is non-empty) whose `family` is in `allowedFamilies`. An **empty**
 * `allowedOrgs` means "nothing is approved" and yields `[]` — matching the
 * pool's install semantics, where an empty allowlist blocks every install.
 * The returned objects are plain `RankerCandidate`s (the `family` tag is
 * dropped) ready to hand to the recommender.
 */
export function selectCandidates(
  candidates: readonly FrozenCandidate[],
  bounds: CandidateSelectionBounds | undefined
): RankerCandidate[] {
  const allowedOrgs = bounds?.allowedOrgs ?? [];
  const allowedFamilies = bounds?.allowedFamilies ?? [];
  if (allowedOrgs.length === 0) return [];

  const out: RankerCandidate[] = [];
  for (const c of candidates) {
    if (!allowedOrgs.includes(orgOf(c.hfRepoId))) continue;
    if (
      allowedFamilies.length > 0 &&
      (c.family === undefined || !allowedFamilies.includes(c.family))
    ) {
      continue;
    }
    const candidate: RankerCandidate = { hfRepoId: c.hfRepoId, sizeB: c.sizeB, quant: c.quant };
    if (c.activeB !== undefined) candidate.activeB = c.activeB;
    if (c.ollamaName !== undefined) candidate.ollamaName = c.ollamaName;
    out.push(candidate);
  }
  return out;
}
