/**
 * @harness-engineering/local-models
 *
 * Hardware-aware local-model recommender, pool manager, and proposal engine
 * for Harness Engineering's Local Model Lifecycle Manager (LMLM).
 *
 * Phase 3b (current) adds the install-adapter layer — `InstallAdapter`
 * contract, `OllamaInstallAdapter` speaking `/api/pull|delete|tags|show`,
 * `AdvisoryInstallAdapter` rendering copy-paste commands for backends whose
 * install is operator-driven, and the structured `InstallError` taxonomy —
 * on top of Phase 1's hardware detection, Phase 2a's HF client + cache +
 * frozen snapshot loader, Phase 2b's VRAM + speed math, Phase 2c's evidence /
 * recency fusion + benchmark merge, and Phase 3a's pool-state persistence +
 * eviction planner. Subsequent phases add the algorithm port (2d), the
 * `PoolManager` orchestrator + CLI (3c), the resolver integration (4), the
 * proposal engine + schema generalization (5), the scheduler (6), and the
 * HTTP / WS / dashboard surfaces (7–8) per
 * `docs/changes/local-model-lifecycle-manager/proposal.md`.
 */

export const LOCAL_MODELS_PACKAGE = '@harness-engineering/local-models' as const;
export const LOCAL_MODELS_VERSION = '0.1.0' as const;

export * from './hardware/index.js';
export * from './huggingface/index.js';
export * from './installer/index.js';
export * from './pool/index.js';
export * from './ranker/index.js';
