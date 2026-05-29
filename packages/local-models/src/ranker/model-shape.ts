/**
 * Model architecture shape — the minimum set of fields the VRAM and speed
 * estimators (Phase 2b) and the algorithm orchestrator (Phase 2d) need to
 * convert a `(repo, quant, hardware)` triple into resource estimates.
 *
 * The shape is intentionally a leaf type: no imports, no behavior. Phase 2c's
 * merge logic populates it from a curated `family → shape` table joined with
 * HF metadata; Phase 2b's math reads it.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 2, lines 414–429)
 */

/**
 * Quant labels the GGUF runtime ecosystem speaks. Used as a key into the
 * bits-per-weight and bandwidth-factor tables shipped with `vram.ts` /
 * `speed.ts`. Unknown strings are accepted by the math (they fall through to
 * the FP16 + unity-factor defaults with a structured note) but only the names
 * below carry calibrated constants.
 */
export type KnownQuant =
  | 'Q2_K'
  | 'Q3_K_M'
  | 'Q4_0'
  | 'Q4_K_M'
  | 'Q5_0'
  | 'Q5_K_M'
  | 'Q6_K'
  | 'Q8_0'
  | 'FP16'
  | 'BF16'
  | 'FP32';

/**
 * Architecture fields the estimators consume. All counts are in their native
 * units (params in billions, sizes in elements, lengths in tokens) — the math
 * modules apply the bits/bytes conversion themselves so this struct stays
 * runtime-agnostic.
 *
 * MoE shapes set `activeParamsB`; dense shapes leave it `undefined`. The
 * weights bucket uses `paramsB` (total memory residency); the throughput math
 * uses `activeParamsB ?? paramsB` (per-token compute).
 */
export interface ModelShape {
  /** Total parameter count in billions. For MoE this is the *total*, not the active subset. */
  paramsB: number;
  /** Active parameter count in billions for MoE; `undefined` for dense models. */
  activeParamsB?: number;
  /** Transformer block count. Drives KV-cache layer dimension. */
  layers: number;
  /** Hidden size (model dim). Drives activation scratch estimate. */
  hiddenSize: number;
  /** Attention head count (query heads in GQA). Reserved for future estimators; not load-bearing in 2b. */
  numAttnHeads: number;
  /** KV head count. Collapses to a small number under GQA (e.g. Qwen3-32B has 8 KV heads vs 64 attention heads). */
  numKvHeads: number;
  /** Per-head dimension in elements. KV memory scales linearly in `headDim * numKvHeads`. */
  headDim: number;
  /** Vocabulary size. Reserved for future activation/embedding math; not load-bearing in 2b. */
  vocabSize: number;
  /** Operating-point context length in tokens. KV memory scales linearly. */
  contextLen: number;
  /** Human-readable family slug (`'qwen3'`, `'llama-3'`, …). Carried for downstream display. */
  family?: string;
}
