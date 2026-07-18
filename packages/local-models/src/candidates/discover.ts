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
    await discoverOrg(org, { client, limit, opts, warn, collected });
  }

  return { candidates: [...collected.values()], warnings };
}

/** Per-org context shared by the org / model discovery helpers. */
interface DiscoverContext {
  client: Pick<HuggingFaceClient, 'listModels' | 'getModel'>;
  limit: number;
  opts: DiscoverCandidatesOptions;
  warn: (message: string, cause?: unknown) => void;
  collected: Map<string, FrozenCandidate>;
}

type HfModel = Awaited<ReturnType<Pick<HuggingFaceClient, 'listModels'>['listModels']>>[number];

/** One `listModels` call for a given sort. Returns `null` on failure (caller decides fail-soft policy). */
async function listSort(
  org: string,
  sort: 'downloads' | 'trending',
  ctx: DiscoverContext
): Promise<HfModel[] | null> {
  try {
    return await ctx.client.listModels({ author: org, search: 'gguf', sort, limit: ctx.limit });
  } catch (err) {
    // Base (downloads) failure keeps the original org-skip wording; trending failure is a fallback warning.
    const message =
      sort === 'trending'
        ? `HF trending list failed for ${org} (falling back to downloads): ${messageOf(err)}`
        : `HF list failed for ${org}: ${messageOf(err)}`;
    ctx.warn(message, err);
    return null;
  }
}

/**
 * Wide net: merge both sorts, dedupe by model id, cap at `limit` (D1 — no blow-up).
 * `trending` is iterated first — recency wins cap ties. Do NOT reorder the args to
 * "base first"; that would silently invert the recency bias (ADR 0077).
 */
function mergeCapped(trending: HfModel[], downloads: HfModel[], limit: number): HfModel[] {
  const merged = new Map<string, HfModel>();
  for (const model of [...trending, ...downloads]) {
    if (merged.has(model.id)) continue;
    if (merged.size >= limit) continue;
    merged.set(model.id, model);
  }
  return [...merged.values()];
}

/** List one org's popular GGUF repos and fold each into `collected`. Fail-soft. */
async function discoverOrg(org: string, ctx: DiscoverContext): Promise<void> {
  // Established quality (cumulative downloads). If this base call fails, the org is skipped.
  const downloads = await listSort(org, 'downloads', ctx);
  if (downloads === null) return;

  // New/hot models (trending). Graceful (D2): a trending failure falls back to downloads only.
  const trending = (await listSort(org, 'trending', ctx)) ?? [];

  for (const model of mergeCapped(trending, downloads, ctx.limit)) {
    if (ctx.opts.signal?.aborted) break;
    if (!model.tags?.includes('gguf')) continue;
    await discoverModel(model.id, ctx);
  }
}

/** Fetch one repo's detail, parse it into per-quant candidates, and collect the installable ones. */
async function discoverModel(modelId: string, ctx: DiscoverContext): Promise<void> {
  const { client, opts, warn, collected } = ctx;
  let detail;
  try {
    detail = await client.getModel(modelId, opts.signal);
  } catch (err) {
    warn(`HF getModel failed for ${modelId}: ${messageOf(err)}`, err);
    return;
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

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
