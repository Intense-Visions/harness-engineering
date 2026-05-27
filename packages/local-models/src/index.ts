/**
 * @harness-engineering/local-models
 *
 * Hardware-aware local-model recommender, pool manager, and proposal engine
 * for Harness Engineering's Local Model Lifecycle Manager (LMLM).
 *
 * Phase 1 (current) ships hardware detection. Subsequent phases add the
 * Hugging Face client, ranker, pool manager, Ollama installer, scheduler,
 * proposal engine, HTTP/WS surfaces, CLI commands, and dashboard panel per
 * `docs/changes/local-model-lifecycle-manager/proposal.md`.
 */

export const LOCAL_MODELS_PACKAGE = '@harness-engineering/local-models' as const;
export const LOCAL_MODELS_VERSION = '0.1.0' as const;

export * from './hardware/index.js';
