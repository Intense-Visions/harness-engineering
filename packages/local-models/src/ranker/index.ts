/**
 * Ranker — public barrel.
 *
 * Phase 2a stood up the benchmark namespace; Phase 2b adds the canonical
 * quant table plus the VRAM and speed estimators; Phase 2c adds `evidence`,
 * `recency`, and the benchmark merge; Phase 2d adds `algorithm.ts`. Re-
 * exporting the namespaces eagerly keeps the public surface stable across
 * phases.
 */

export * from './benchmarks/index.js';
export * from './quants.js';
export * from './vram.js';
export * from './speed.js';
