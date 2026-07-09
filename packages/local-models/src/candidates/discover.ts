/**
 * Live HuggingFace candidate discovery (the runtime counterpart to the offline
 * `scripts/refresh-model-candidates.mjs` generator).
 *
 * Composes the existing HF client + GGUF parser into a single call the
 * orchestrator can run on startup / on an operator "Refresh": for each approved
 * org it lists popular GGUF repos, parses each into per-quant candidates, and —
 * crucially — MERGES the human-curated `ollamaName` / `family` tags from the
 * frozen snapshot back in. The HF API does not carry those tags, and a candidate
 * without an `ollamaName` cannot be installed (no Ollama mirror), so a live model
 * with no curation mapping is **dropped** rather than surfaced as an
 * un-installable row (decision A). This keeps live-refreshed candidates a
 * drop-in, installable replacement for the frozen list — fresher popularity /
 * quant availability, same install-ability guarantee.
 *
 * Fail-soft: a failed org list or model fetch is recorded in `warnings` and
 * skipped; the caller treats an empty result as "keep the current candidates".
 */

import { HuggingFaceClient } from '../huggingface/index.js';
import { parseHfModelToCandidates } from './parse.js';
import type { FrozenCandidate } from './types.js';

/** Curated tags the HF API cannot supply — required for a candidate to be installable. */
export interface CurationTags {
  ollamaName: string;
  family?: string;
}

export interface DiscoverCandidatesOptions {
  /** Orgs to enumerate (the operator's `allowedOrgs`). */
  orgs: readonly string[];
  /**
   * `hfRepoId → curated tags`. Built from the frozen snapshot. A discovered repo
   * with no entry here has no known Ollama mirror, so it is dropped (decision A).
   */
  curation: ReadonlyMap<string, CurationTags>;
  /** DI seam; defaults to a real `HuggingFaceClient`. */
  client?: Pick<HuggingFaceClient, 'listModels' | 'getModel'>;
  /** Max repos per org to inspect. Defaults to 50. */
  perOrgLimit?: number;
  signal?: AbortSignal;
  onWarn?: (message: string, cause?: unknown) => void;
}

export interface DiscoverCandidatesResult {
  candidates: FrozenCandidate[];
  warnings: string[];
}

const DEFAULT_PER_ORG_LIMIT = 50;

/** Build the curation map from already-curated candidates (e.g. the frozen snapshot). */
export function curationFromCandidates(
  candidates: readonly FrozenCandidate[]
): Map<string, CurationTags> {
  const map = new Map<string, CurationTags>();
  for (const c of candidates) {
    if (c.ollamaName === undefined || map.has(c.hfRepoId)) continue;
    map.set(c.hfRepoId, { ollamaName: c.ollamaName, ...(c.family ? { family: c.family } : {}) });
  }
  return map;
}

/** Discover installable candidates live from HuggingFace. Never throws — see `warnings`. */
export async function discoverCandidates(
  opts: DiscoverCandidatesOptions
): Promise<DiscoverCandidatesResult> {
  const client = opts.client ?? new HuggingFaceClient();
  const limit = opts.perOrgLimit ?? DEFAULT_PER_ORG_LIMIT;
  const warnings: string[] = [];
  const collected = new Map<string, FrozenCandidate>();
  const warn = (message: string, cause?: unknown): void => {
    warnings.push(message);
    opts.onWarn?.(message, cause);
  };

  for (const org of opts.orgs) {
    if (opts.signal?.aborted) break;
    let models;
    try {
      models = await client.listModels({ author: org, search: 'gguf', sort: 'downloads', limit });
    } catch (err) {
      warn(`HF list failed for ${org}: ${messageOf(err)}`, err);
      continue;
    }
    for (const model of models) {
      if (opts.signal?.aborted) break;
      if (!model.tags?.includes('gguf')) continue;
      let detail;
      try {
        detail = await client.getModel(model.id, opts.signal);
      } catch (err) {
        warn(`HF getModel failed for ${model.id}: ${messageOf(err)}`, err);
        continue;
      }
      for (const parsed of parseHfModelToCandidates(detail)) {
        const tags = opts.curation.get(parsed.hfRepoId);
        if (!tags) continue; // no curated ollamaName → not installable → drop (decision A)
        const candidate: FrozenCandidate = {
          hfRepoId: parsed.hfRepoId,
          sizeB: parsed.sizeB,
          quant: parsed.quant,
          ollamaName: tags.ollamaName,
          ...(tags.family ? { family: tags.family } : {}),
          ...(parsed.activeB !== undefined ? { activeB: parsed.activeB } : {}),
        };
        collected.set(`${candidate.hfRepoId}||${candidate.quant}`, candidate);
      }
    }
  }

  return { candidates: [...collected.values()], warnings };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
