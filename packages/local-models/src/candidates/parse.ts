/**
 * GGUF → `RankerCandidate` parser (LMLM Phase 2 completion).
 *
 * Turns a HuggingFace model (repo id + GGUF file manifest) into zero-or-more
 * `RankerCandidate`s — one per recognised quant — with `sizeB` extracted from
 * the repo id and `quant` extracted from each `.gguf` sibling filename.
 *
 * Best-effort by design: models whose parameter count can't be read from the
 * name, and files that don't carry a `normalizeQuantId`-recognised quant, are
 * skipped rather than guessed. The runtime consumes a curated frozen snapshot
 * (see `./frozen.ts`); this parser is the shared core used by the on-demand
 * `scripts/refresh-model-candidates.mjs` generator, whose output a human
 * reviews before committing.
 *
 * @see docs/changes/lmlm-functional-wiring/proposal.md (Phase 2, D3)
 */

import type { HuggingFaceModelDetail } from '../huggingface/index.js';
import { normalizeQuantId } from '../ranker/index.js';
import type { RankerCandidate } from '../ranker/index.js';

/** Mixture-of-Experts naming like `8x7B` — `experts × per-expert-B`. */
const MOE_SIZE_RE = /(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)\s*b\b/i;
/** Dense parameter-count token like `32B`, `1.5B`, `70b`. Global for `matchAll`. */
const DENSE_SIZE_RE = /(\d+(?:\.\d+)?)\s*b\b/gi;
/**
 * A quant token embedded in a GGUF filename: GGUF K-quants (`Q4_K_M`, `Q8_0`),
 * importance-quants (`IQ4_XS`), or plain float formats (`F16`, `BF16`). The
 * captured group is handed to `normalizeQuantId`, which owns aliasing/casing.
 */
const QUANT_RE =
  /(?:^|[-_. ])((?:iq|q)\d+(?:_[a-z0-9]+)*|bf16|fp16|f16|f32|mxfp4|mlx-\d+bit)(?=[-_. ]|\.gguf$|$)/i;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Extracted parameter counts in billions. `activeB` is set only for MoE. */
export interface ExtractedSize {
  sizeB: number;
  activeB?: number;
}

/**
 * Read the parameter count (in billions) from a model name / repo id. MoE
 * `AxB` naming yields `sizeB = A×B` (approximate total) and `activeB = B`.
 * Dense names yield the largest `<n>B` token (repo ids embed version numbers
 * like `Llama-3.3-70B` — `70` is the size, `3.3` carries no `B`). Returns
 * `null` when no size token is present.
 */
export function extractSizeB(name: string): ExtractedSize | null {
  const moe = MOE_SIZE_RE.exec(name);
  if (moe) {
    const experts = Number(moe[1]);
    const per = Number(moe[2]);
    if (experts > 0 && per > 0) return { sizeB: round1(experts * per), activeB: per };
  }
  let best: number | null = null;
  for (const m of name.matchAll(DENSE_SIZE_RE)) {
    const v = Number(m[1]);
    if (Number.isFinite(v) && v > 0 && (best === null || v > best)) best = v;
  }
  return best === null ? null : { sizeB: best };
}

/**
 * Extract the quant token from a GGUF filename (e.g. `Qwen3-32B-Q4_K_M.gguf`
 * → `Q4_K_M`). Returns `null` for non-`.gguf` files or files with no
 * recognisable quant token. Normalisation/validation is left to the caller.
 */
export function extractQuantFromFilename(rfilename: string): string | null {
  if (!/\.gguf$/i.test(rfilename)) return null;
  const m = QUANT_RE.exec(rfilename);
  return m ? (m[1] as string) : null;
}

/** Options for {@link parseHfModelToCandidates}. */
export interface ParseCandidateOptions {
  /** Override the name-derived size when the caller knows the true param count. */
  sizeOverride?: number;
}

/**
 * Parse a HuggingFace model detail into `RankerCandidate`s — one per distinct,
 * recognised quant among its `.gguf` siblings. Deduplicates quants (sharded
 * files repeat a quant across `-00001-of-000NN.gguf` parts). Returns `[]` when
 * the size can't be determined or no recognised GGUF quant is present.
 */
export function parseHfModelToCandidates(
  model: HuggingFaceModelDetail,
  opts: ParseCandidateOptions = {}
): RankerCandidate[] {
  const size =
    opts.sizeOverride !== undefined ? { sizeB: opts.sizeOverride } : extractSizeB(model.id);
  if (!size || size.sizeB <= 0) return [];

  const seen = new Set<string>();
  const out: RankerCandidate[] = [];
  for (const sibling of model.siblings ?? []) {
    const raw = extractQuantFromFilename(sibling.rfilename);
    if (raw === null) continue;
    const norm = normalizeQuantId(raw);
    if (!norm.known || seen.has(norm.canonical)) continue;
    seen.add(norm.canonical);
    const candidate: RankerCandidate = {
      hfRepoId: model.id,
      sizeB: size.sizeB,
      quant: norm.canonical,
    };
    if (size.activeB !== undefined) candidate.activeB = size.activeB;
    out.push(candidate);
  }
  return out;
}
