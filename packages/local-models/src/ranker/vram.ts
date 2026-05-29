/**
 * VRAM math — pure functions that convert a `(ModelShape, quant)` pair into a
 * memory residency estimate. Phase 2d's `algorithm.ts` calls this to populate
 * `RankedModel.estimatedVramGb` and gate `fitsHardware`.
 *
 * The estimate is decomposed into four buckets so the dashboard + proposal
 * justification renderer (Phase 5b) can show operators *why* a model would or
 * wouldn't fit — not just a single opaque number:
 *
 * - **Weights**: `(params × bitsPerWeight) / 8`. Drives the dominant term.
 * - **KV cache**: `2 (K+V) × layers × headDim × numKvHeads × contextLen × bytesPerEntry`. GQA shrinks this dramatically vs MHA.
 * - **Activations**: linear in `hiddenSize × contextLen × batchSize`. Conservative upper bound.
 * - **Runtime overhead**: flat scratch the host runtime (ollama / llama.cpp) keeps resident.
 *
 * For MoE, the weights bucket uses **total** params (memory residency does not
 * shrink with routing). The throughput math in `speed.ts` uses **active**
 * params (only the routed experts move per token).
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 2, lines 414–429)
 */

import type { KnownQuant, ModelShape } from './model-shape.js';

const BYTES_PER_GB = 1024 ** 3;

/**
 * Bits-per-weight per GGUF quant. Q-quant numbers are llama.cpp's published
 * per-tensor averages (Q-quants vary per-tensor; the average is what matters
 * for memory residency). FP16/BF16/FP32 are exact.
 *
 * Phase 2d's parity tests against whichllm pin these values — adjust only
 * with a parity refresh.
 */
export const QUANT_BITS: Readonly<Record<KnownQuant, number>> = Object.freeze({
  Q2_K: 2.6,
  Q3_K_M: 3.3,
  Q4_0: 4.5,
  Q4_K_M: 4.5,
  Q5_0: 5.5,
  Q5_K_M: 5.5,
  Q6_K: 6.6,
  Q8_0: 8.5,
  FP16: 16,
  BF16: 16,
  FP32: 32,
});

/** Default bits-per-weight applied when an unknown quant string is passed. Matches FP16 so the estimate is *over*-conservative rather than under. */
const DEFAULT_QUANT_BITS = QUANT_BITS.FP16;

/** Flat runtime overhead (ollama/llama.cpp scratch buffers, KV cache headroom, sampling/temperature tables). */
export const RUNTIME_OVERHEAD_GB = 0.5;

/**
 * Activation memory multiplier applied to `hiddenSize × contextLen × bytes`.
 * Captures intermediate buffers (attention scratch, MLP scratch, residual
 * stream double-buffering). Empirically `~4×` on llama.cpp for the dense FP16
 * activations path.
 */
const ACTIVATION_MULTIPLIER = 4;

/** Activation bytes-per-element. Modern runtimes keep activations in FP16. */
const ACTIVATION_BYTES_PER_ELEM = 2;

/** KV cache bytes-per-entry. Default FP16 — KV-Q8 is a future operator opt-in. */
const DEFAULT_KV_BYTES_PER_ENTRY = 2;

/** Default batch size for activation math when the caller doesn't specify one. */
const DEFAULT_BATCH = 1;

/**
 * Structured note attached to a `VramEstimate`. Stable codes the dashboard /
 * justification renderer can switch on without parsing free-text messages.
 */
export interface VramNote {
  code: 'vram_unknown_quant';
  message: string;
}

/** Per-component breakdown of `estimateVram`. Components sum to `totalGb` modulo float epsilon. */
export interface VramEstimate {
  totalGb: number;
  weightsGb: number;
  kvGb: number;
  activationsGb: number;
  overheadGb: number;
  /** Resolved bits-per-weight; `DEFAULT_QUANT_BITS` for unknown quants. */
  quantBits: number;
  notes: VramNote[];
}

/** Optional knobs for `estimateVram`. */
export interface VramOptions {
  /** Override the default batch size used by `estimateActivationsGb`. */
  batchSize?: number;
  /** Override KV cache bytes-per-entry (e.g. KV-Q8 = 1). */
  kvBytesPerEntry?: number;
}

/**
 * Weights memory in GiB for a model of `paramsB` billions at `bitsPerWeight`
 * bits/weight. Pure float — does not bound or round.
 */
export function estimateWeightsGb(paramsB: number, bitsPerWeight: number): number {
  const totalBits = paramsB * 1e9 * bitsPerWeight;
  return totalBits / 8 / BYTES_PER_GB;
}

export interface KvCacheArgs {
  layers: number;
  headDim: number;
  numKvHeads: number;
  contextLen: number;
  /** Defaults to 2 (FP16 KV). */
  bytesPerEntry?: number;
}

/**
 * KV cache memory in GiB. The leading `2 ×` factor covers K and V. The
 * formula collapses to `2 × layers × headDim × numKvHeads × contextLen ×
 * bytesPerEntry / 2^30`.
 */
export function estimateKvCacheGb(args: KvCacheArgs): number {
  const bytesPerEntry = args.bytesPerEntry ?? DEFAULT_KV_BYTES_PER_ENTRY;
  const totalBytes =
    2 * args.layers * args.headDim * args.numKvHeads * args.contextLen * bytesPerEntry;
  return totalBytes / BYTES_PER_GB;
}

export interface ActivationArgs {
  hiddenSize: number;
  contextLen: number;
  batchSize?: number;
}

/** Activation scratch memory in GiB. Linear in `hiddenSize × contextLen × batchSize`. */
export function estimateActivationsGb(args: ActivationArgs): number {
  const batchSize = args.batchSize ?? DEFAULT_BATCH;
  const totalBytes =
    args.hiddenSize *
    args.contextLen *
    batchSize *
    ACTIVATION_BYTES_PER_ELEM *
    ACTIVATION_MULTIPLIER;
  return totalBytes / BYTES_PER_GB;
}

/**
 * Resolve the bits-per-weight for a quant string. Returns the calibrated value
 * for known names; for everything else returns `DEFAULT_QUANT_BITS` and a
 * single `vram_unknown_quant` note.
 */
function resolveQuantBits(quant: string): { bits: number; note: VramNote | null } {
  const known = (QUANT_BITS as Record<string, number | undefined>)[quant];
  if (typeof known === 'number') {
    return { bits: known, note: null };
  }
  return {
    bits: DEFAULT_QUANT_BITS,
    note: {
      code: 'vram_unknown_quant',
      message: `Unknown quant "${quant}"; falling back to FP16 (${DEFAULT_QUANT_BITS} bits/weight)`,
    },
  };
}

/**
 * Top-level VRAM estimate. Aggregates the four component buckets and surfaces
 * the breakdown so consumers (proposal renderer, dashboard) can explain the
 * residency without recomputing.
 *
 * For MoE shapes, the weights bucket uses `shape.paramsB` (total) because
 * routed experts still live in memory; only `speed.ts` switches to the
 * `activeParamsB` term.
 */
export function estimateVram(
  shape: ModelShape,
  quant: string,
  options: VramOptions = {}
): VramEstimate {
  const { bits, note } = resolveQuantBits(quant);
  const weightsGb = estimateWeightsGb(shape.paramsB, bits);
  const kvArgs: KvCacheArgs = {
    layers: shape.layers,
    headDim: shape.headDim,
    numKvHeads: shape.numKvHeads,
    contextLen: shape.contextLen,
    ...(options.kvBytesPerEntry !== undefined ? { bytesPerEntry: options.kvBytesPerEntry } : {}),
  };
  const kvGb = estimateKvCacheGb(kvArgs);
  const activationArgs: ActivationArgs = {
    hiddenSize: shape.hiddenSize,
    contextLen: shape.contextLen,
    ...(options.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
  };
  const activationsGb = estimateActivationsGb(activationArgs);
  const overheadGb = RUNTIME_OVERHEAD_GB;
  const totalGb = weightsGb + kvGb + activationsGb + overheadGb;
  return {
    totalGb,
    weightsGb,
    kvGb,
    activationsGb,
    overheadGb,
    quantBits: bits,
    notes: note ? [note] : [],
  };
}
