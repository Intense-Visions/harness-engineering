/**
 * Ranker — public barrel.
 *
 * Phase 2a stood up the benchmark namespace; Phase 2b added the canonical
 * quant table plus the VRAM and speed estimators; Phase 2c adds `evidence`
 * grading, lineage-aware `recency` decay, and the cross-source benchmark
 * merge (re-exported via `./benchmarks/index.js`); Phase 2d will add
 * `algorithm.ts`. Re-exporting the namespaces eagerly keeps the public
 * surface stable across phases.
 */

export * from './benchmarks/index.js';
export * from './quants.js';
export * from './vram.js';
export * from './speed.js';
export * from './evidence.js';
export * from './recency.js';
