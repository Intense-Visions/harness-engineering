/**
 * Speed math — pure functions that convert a `(ModelShape, quant, hardware)`
 * triple into a bandwidth-bound tokens-per-second estimate. Phase 2d's
 * `algorithm.ts` calls this to populate `RankedModel.estimatedTokPerSec` and
 * `RankedModel.speedConfidence`.
 *
 * The model is bandwidth-bound for inference: each generated token requires
 * the runtime to stream every active weight + the KV cache row through the
 * compute unit. So:
 *
 *   tokPerSec ≈ (effectiveBandwidth) / (bytesPerToken)
 *
 *   effectiveBandwidth = hardwareBandwidth × backendEfficiency × quantFactor
 *   bytesPerToken      = activeWeightsBytes + kvBytesPerToken
 *
 * Three real-world refinements layered on top:
 *
 * 1. **Backend efficiency**: real bandwidth utilization is lower than the
 *    chip's nominal number (Metal ≈ 0.65 on Apple Silicon unified memory;
 *    CUDA ≈ 0.80 on NVIDIA discrete; CPU ≈ 0.30).
 * 2. **Quant factor**: dequantize math has a (small) cost. Lower-bit quants
 *    pay slightly more per byte (Q4_K_M ≈ 0.95, FP16 ≈ 1.0).
 * 3. **MoE**: per-token compute touches `activeParamsB` (not `paramsB`).
 *    Throughput accordingly scales with the active subset.
 *
 * The estimator also exposes a partial-offload path for NVIDIA hosts where
 * the model exceeds VRAM. Layer-weighted harmonic mean of VRAM and DRAM
 * bandwidths captures the cost of streaming the non-resident layers through
 * the slower bus; confidence demotes to `'low'`.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 2, lines 414–429)
 */

import type { HardwareProfile } from '../hardware/types.js';
import type { KnownQuant, ModelShape } from './model-shape.js';
import { QUANT_BITS } from './vram.js';

const BYTES_PER_GB = 1024 ** 3;

/**
 * Fraction of nominal bandwidth a backend realizes for streaming weights.
 *
 * - `metal` — Apple Silicon unified memory. Mid-band of public llama.cpp /
 *   MLX numbers across M-series chips (0.6–0.7 envelope).
 * - `cuda` — NVIDIA discrete GDDR/HBM with flash-attention. Mid-band of
 *   public llama.cpp + flash-attn numbers on 4090 / A100 (0.75–0.85).
 * - `cpu` — System DRAM via AVX-512 inner loops. Bandwidth-limited and noisy.
 */
export const BACKEND_EFFICIENCY: Readonly<Record<'metal' | 'cuda' | 'cpu', number>> = Object.freeze(
  {
    metal: 0.65,
    cuda: 0.8,
    cpu: 0.3,
  }
);

/**
 * Quant-specific bandwidth factor. Captures the small dequantize tax: lower
 * bit-widths pay slightly more compute per byte streamed, so effective
 * throughput is `factor × effectiveBandwidth`.
 *
 * FP16/BF16/FP32 are baseline (no dequantize). Q4/Q5 K-quants are ~0.9–0.95.
 */
export const QUANT_BANDWIDTH_FACTOR: Readonly<Record<KnownQuant, number>> = Object.freeze({
  Q2_K: 0.9,
  Q3_K_M: 0.92,
  Q4_0: 0.93,
  Q4_K_M: 0.95,
  Q5_0: 0.93,
  Q5_K_M: 0.94,
  Q6_K: 0.93,
  Q8_0: 0.95,
  FP16: 1.0,
  BF16: 1.0,
  FP32: 1.0,
});

const DEFAULT_QUANT_FACTOR = 1.0;
const DEFAULT_QUANT_BITS = QUANT_BITS.FP16;

/** Tag for the active inference backend, derived from `HardwareProfile.platform`. */
export type SpeedBackend = 'metal' | 'cuda' | 'cpu';

/** Confidence the estimator attaches to a returned `tokPerSec`. */
export type SpeedConfidence = 'high' | 'medium' | 'low';

/**
 * Structured note attached to a `SpeedEstimate`. Stable codes the dashboard /
 * justification renderer can switch on without parsing free-text messages.
 */
export interface SpeedNote {
  code: 'speed_unknown_quant' | 'speed_partial_offload' | 'speed_cpu_fallback';
  message: string;
}

/** Layer-offload arguments for the partial-offload path (NVIDIA only). */
export interface PartialOffload {
  /** Number of transformer blocks resident in VRAM. The remainder lives in system DRAM. */
  layersOffloaded: number;
  /** Effective DRAM bandwidth in GB/s for the non-resident layers (PCIe-bound or DDR-bound). */
  dramBandwidthGbps: number;
}

export interface SpeedEstimateArgs {
  shape: ModelShape;
  quant: string;
  hardware: HardwareProfile;
  partialOffload?: PartialOffload;
}

export interface SpeedEstimate {
  tokPerSec: number;
  confidence: SpeedConfidence;
  /** Resolved backend tag. */
  backend: SpeedBackend;
  /** Resolved effective bandwidth in GB/s (after backend + quant + partial-offload). */
  effectiveBandwidthGbps: number;
  /** Resolved bytes-per-token: active weights + KV row. */
  bytesPerToken: number;
  notes: SpeedNote[];
}

/** Map a `HardwareProfile.platform` to the backend tag used in the efficiency table. */
export function pickBackend(hardware: HardwareProfile): SpeedBackend {
  switch (hardware.platform) {
    case 'macos':
      return 'metal';
    case 'nvidia':
      return 'cuda';
    case 'cpu':
      return 'cpu';
  }
}

/** Resolve the bits-per-weight for a quant; unknowns get `DEFAULT_QUANT_BITS`. */
function resolveQuantBits(quant: string): number {
  const known = (QUANT_BITS as Record<string, number | undefined>)[quant];
  return typeof known === 'number' ? known : DEFAULT_QUANT_BITS;
}

/** Resolve the quant bandwidth factor; unknowns get `DEFAULT_QUANT_FACTOR` and an `unknown_quant` note. */
function resolveQuantFactor(quant: string): { factor: number; note: SpeedNote | null } {
  const known = (QUANT_BANDWIDTH_FACTOR as Record<string, number | undefined>)[quant];
  if (typeof known === 'number') {
    return { factor: known, note: null };
  }
  return {
    factor: DEFAULT_QUANT_FACTOR,
    note: {
      code: 'speed_unknown_quant',
      message: `Unknown quant "${quant}"; using unity bandwidth factor`,
    },
  };
}

/**
 * Bytes streamed per generated token: the active weights (all of them flow
 * through the compute unit once) plus the KV cache row (read for cross-token
 * attention).
 *
 * MoE shapes use `activeParamsB`; dense shapes use `paramsB`.
 */
function computeBytesPerToken(shape: ModelShape, bitsPerWeight: number): number {
  const activeParamsB = shape.activeParamsB ?? shape.paramsB;
  const activeWeightsBytes = (activeParamsB * 1e9 * bitsPerWeight) / 8;
  const kvBytesPerToken = 2 * shape.layers * shape.headDim * shape.numKvHeads * 2;
  return activeWeightsBytes + kvBytesPerToken;
}

/**
 * Layer-weighted harmonic mean of VRAM + DRAM bandwidths for the partial-
 * offload path. Derived from per-token time being a sum of per-layer terms
 * `layer_bytes / per_layer_bandwidth`:
 *
 *   effectiveBw = totalLayers / (offloaded/vramBw + (total - offloaded)/dramBw)
 */
function effectivePartialOffloadBandwidth(
  vramBandwidthGbps: number,
  dramBandwidthGbps: number,
  layersOffloaded: number,
  totalLayers: number
): number {
  const dramLayers = Math.max(totalLayers - layersOffloaded, 0);
  if (layersOffloaded >= totalLayers) {
    return vramBandwidthGbps;
  }
  if (layersOffloaded <= 0) {
    return dramBandwidthGbps;
  }
  return totalLayers / (layersOffloaded / vramBandwidthGbps + dramLayers / dramBandwidthGbps);
}

/**
 * Top-level speed estimate. See module-level docstring for the math.
 *
 * The returned `confidence` is `'high'` when every input is known + the model
 * is fully resident on a non-CPU backend; `'medium'` when one bandwidth
 * factor is the unknown-quant fallback; `'low'` for CPU-only or partial-
 * offload paths.
 */
export function estimateTokPerSec(args: SpeedEstimateArgs): SpeedEstimate {
  const { shape, quant, hardware, partialOffload } = args;
  const backend = pickBackend(hardware);
  const backendEfficiency = BACKEND_EFFICIENCY[backend];
  const bits = resolveQuantBits(quant);
  const { factor: quantFactor, note: quantNote } = resolveQuantFactor(quant);

  const notes: SpeedNote[] = [];
  if (quantNote) notes.push(quantNote);

  let rawBandwidthGbps = hardware.bandwidthGbps;
  let confidence: SpeedConfidence;

  if (
    partialOffload &&
    hardware.platform === 'nvidia' &&
    partialOffload.layersOffloaded < shape.layers
  ) {
    rawBandwidthGbps = effectivePartialOffloadBandwidth(
      hardware.bandwidthGbps,
      partialOffload.dramBandwidthGbps,
      partialOffload.layersOffloaded,
      shape.layers
    );
    confidence = 'low';
    notes.push({
      code: 'speed_partial_offload',
      message:
        `${partialOffload.layersOffloaded}/${shape.layers} layers in VRAM; ` +
        `non-resident layers stream through DRAM (${partialOffload.dramBandwidthGbps} GB/s)`,
    });
  } else if (backend === 'cpu') {
    confidence = 'low';
    notes.push({
      code: 'speed_cpu_fallback',
      message: 'CPU-only inference; throughput is bandwidth-limited by system DRAM',
    });
  } else if (quantNote) {
    confidence = 'medium';
  } else {
    confidence = 'high';
  }

  const effectiveBandwidthGbps = rawBandwidthGbps * backendEfficiency * quantFactor;
  const bytesPerToken = computeBytesPerToken(shape, bits);
  const effectiveBandwidthBytesPerSec = effectiveBandwidthGbps * BYTES_PER_GB;
  const tokPerSec = bytesPerToken > 0 ? effectiveBandwidthBytesPerSec / bytesPerToken : 0;

  return {
    tokPerSec,
    confidence,
    backend,
    effectiveBandwidthGbps,
    bytesPerToken,
    notes,
  };
}
