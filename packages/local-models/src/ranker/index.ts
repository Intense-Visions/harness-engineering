/**
 * Ranker — public barrel.
 *
 * Phase 2a stood up the benchmark namespace; Phase 2b adds `vram`, `speed`,
 * and the `ModelShape` contract those estimators consume. Phase 2c adds
 * `evidence`, `recency`, and the benchmark merge; Phase 2d adds
 * `algorithm.ts`. Re-exporting the benchmarks barrel keeps the public
 * surface stable across phases.
 */

export * from './benchmarks/index.js';

export type { KnownQuant, ModelShape } from './model-shape.js';

export {
  QUANT_BITS,
  RUNTIME_OVERHEAD_GB,
  estimateActivationsGb,
  estimateKvCacheGb,
  estimateVram,
  estimateWeightsGb,
} from './vram.js';
export type { ActivationArgs, KvCacheArgs, VramEstimate, VramNote, VramOptions } from './vram.js';

export {
  BACKEND_EFFICIENCY,
  QUANT_BANDWIDTH_FACTOR,
  estimateTokPerSec,
  pickBackend,
} from './speed.js';
export type {
  PartialOffload,
  SpeedBackend,
  SpeedConfidence,
  SpeedEstimate,
  SpeedEstimateArgs,
  SpeedNote,
} from './speed.js';
