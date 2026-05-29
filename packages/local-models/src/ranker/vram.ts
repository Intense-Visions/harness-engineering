/**
 * VRAM footprint estimator.
 *
 * Pure function. Inputs are the per-model knobs the ranker pulls from HF
 * (`sizeB`, `quant`, optional MoE `activeB`) plus the workload parameters
 * (`contextTokens`, `kvCacheQuant`). Output is the footprint broken into the
 * four contributors downstream callers care about: weight tensors, KV cache,
 * activations, and framework overhead. The fitness check in Phase 2d does
 * `vramEstimate.totalGb ≤ hardware.vramGb`; the speed estimator in `./speed.ts`
 * derives the partial-offload fraction from the same totals.
 *
 * All footprints are reported in **gibibytes** (`2^30` bytes) so they compare
 * directly against `HardwareProfile.vramGb` / `ramGb`, which Phase 1's
 * detectors (`hardware/cpu.ts`, `hardware/nvidia.ts`, `hardware/macos.ts`) all
 * compute with `BYTES_PER_GIB = 1024 ** 3`. Mixing the decimal and binary
 * conventions inside the package would silently corrupt the fitness gate; we
 * pay the ~7% disagreement with vendor "marketing GB" once, at the boundary
 * where the operator reads the dashboard, not in the math.
 *
 * The math is intentionally first-order:
 *  - weights  = sizeB · 1e9 · bitsPerWeight ÷ 8 ÷ `BYTES_PER_GIB`
 *  - kv cache = sizeB · `KV_CACHE_BYTES_PER_TOKEN_PER_BILLION_PARAMS_FP16`
 *               · `kvQuantMultiplier` · contextTokens ÷ `BYTES_PER_GIB`
 *  - actGb    = `ACTIVATIONS_GB`
 *  - ovGb     = `FRAMEWORK_OVERHEAD_GB`
 *
 * We do **not** thread layer counts, head dims, or attention sharding through
 * the estimator. HuggingFace's `/api/models` response does not include the
 * `config.json` we'd need for an exact KV-cache calculation, and the spec is
 * explicit that exact per-family lookups are deferred until Phase 2d's parity
 * fixtures show the approximation is too coarse.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 2, lines 414–429)
 */

import { normalizeQuantId, type NormalizedQuant } from './quants.js';

/** Bytes per gibibyte — the binary definition Phase 1's detectors use for `vramGb` / `ramGb`. */
const BYTES_PER_GIB = 1024 ** 3;

/** Params in one billion. Used to lift `sizeB` (billions) into raw byte counts. */
const PARAMS_PER_BILLION = 1_000_000_000;

/**
 * KV-cache bytes per token per billion params at FP16. Tuned so 30B at 4 K
 * lands at ~1 GB — the published footprint for Qwen3 32B / Llama 3 8B style
 * GQA models. The constant biases slightly high for very large dense models
 * (the approximation overshoots by ~1 GB at 70B) and slightly low for very
 * small ones (~0.3 GB undershoot at 7B). Both directions are tolerable for a
 * floor estimator whose purpose is fitness gating, not exact provisioning.
 * Phase 2d parity tests will surface any family where this approximation
 * breaks down past the proposal threshold; that's the moment to upgrade to a
 * per-family table.
 */
export const KV_CACHE_BYTES_PER_TOKEN_PER_BILLION_PARAMS_FP16 = 8_000;

/** Activation buffer footprint. Single number because activations track only weakly with size. */
export const ACTIVATIONS_GB = 1.5;

/** Framework / CUDA-context / Metal-context overhead. Empirical floor across llama.cpp, MLX, vLLM. */
export const FRAMEWORK_OVERHEAD_GB = 1.0;

/** Default workload context window when the caller doesn't specify one. */
export const DEFAULT_CONTEXT_TOKENS = 4_096;

/**
 * Per-quant multiplier on top of the FP16 KV-cache baseline. KV cache is the
 * one slice the runtime can quantize independently of the weights, and Ollama
 * / llama.cpp / vLLM all support q8/q4 KV without touching the weight quant.
 */
export const KV_QUANT_MULTIPLIER: Readonly<Record<KvCacheQuant, number>> = {
  fp16: 1,
  q8: 0.5,
  q4: 0.25,
};

/** Quantization applied to the KV cache (not the weights). */
export type KvCacheQuant = 'fp16' | 'q8' | 'q4';

/** Input to `estimateVram`. */
export interface VramEstimateInput {
  /** Total parameter count in billions. For MoE this is `total`, not `active`. */
  sizeB: number;
  /** Active parameter count in billions for MoE. Recorded on the result; weights still derive from `sizeB`. */
  activeB?: number;
  /** Quant id — any string `normalizeQuantId` recognises (canonical key, alias, case variant). */
  quant: string;
  /** Context window in tokens. Defaults to `DEFAULT_CONTEXT_TOKENS`. */
  contextTokens?: number;
  /** KV-cache precision. Defaults to `'fp16'`. */
  kvCacheQuant?: KvCacheQuant;
}

/**
 * Result of `estimateVram`. The four `*Gb` contributors are pre-summed into
 * `totalGb` so downstream callers don't recompute it; raw inputs are echoed
 * for traceability when the ranker has to explain its justification.
 */
export interface VramEstimate {
  weightsGb: number;
  kvCacheGb: number;
  activationsGb: number;
  overheadGb: number;
  totalGb: number;
  /** Bits-per-weight used to size `weightsGb`. */
  quantBitsPerWeight: number;
  /** Resolved canonical quant id. */
  quant: string;
  /** Context window the estimate was sized against. */
  contextTokens: number;
  /** Per-token KV cache footprint in bytes (used by the speed estimator's confidence band). */
  kvCacheBytesPerToken: number;
  /** Echoed sizeB. */
  sizeB: number;
  /** Echoed activeB. */
  activeB?: number;
  /** Set to `'quant_unknown'` when `normalizeQuantId` did not recognise the input. */
  quantWarning?: 'quant_unknown';
}

/**
 * Compute the VRAM footprint for a `(model, quant, context)` triple. Always
 * succeeds — unknown quants fall through to the conservative
 * `UNKNOWN_QUANT_BITS_PER_WEIGHT` and surface a `quantWarning` on the result.
 */
export function estimateVram(input: VramEstimateInput): VramEstimate {
  const contextTokens = input.contextTokens ?? DEFAULT_CONTEXT_TOKENS;
  const kvCacheQuant: KvCacheQuant = input.kvCacheQuant ?? 'fp16';
  const quantInfo: NormalizedQuant = normalizeQuantId(input.quant);

  // Weights — billion params × bits/weight ÷ 8 bits/byte ÷ 2^30 bytes/GiB.
  // MoE: all weights live in memory (active params do not change the footprint).
  const weightsBytes = (input.sizeB * PARAMS_PER_BILLION * quantInfo.bitsPerWeight) / 8;
  const weightsGb = weightsBytes / BYTES_PER_GIB;

  // KV cache — scales linearly with both `sizeB` (proxy for layers × heads)
  // and `contextTokens`. The kvQuant multiplier captures runtime kv-cache
  // quantization that's independent of weight quantization.
  const kvCacheBytesPerToken =
    input.sizeB *
    KV_CACHE_BYTES_PER_TOKEN_PER_BILLION_PARAMS_FP16 *
    KV_QUANT_MULTIPLIER[kvCacheQuant];
  const kvCacheGb = (contextTokens * kvCacheBytesPerToken) / BYTES_PER_GIB;

  const totalGb = weightsGb + kvCacheGb + ACTIVATIONS_GB + FRAMEWORK_OVERHEAD_GB;

  const estimate: VramEstimate = {
    weightsGb,
    kvCacheGb,
    activationsGb: ACTIVATIONS_GB,
    overheadGb: FRAMEWORK_OVERHEAD_GB,
    totalGb,
    quantBitsPerWeight: quantInfo.bitsPerWeight,
    quant: quantInfo.canonical,
    contextTokens,
    kvCacheBytesPerToken,
    sizeB: input.sizeB,
    ...(input.activeB !== undefined ? { activeB: input.activeB } : {}),
    ...(quantInfo.known ? {} : { quantWarning: 'quant_unknown' as const }),
  };

  return estimate;
}
