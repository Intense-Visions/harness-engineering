/**
 * @harness-engineering/local-models
 *
 * Hardware-aware local-model recommender, pool manager, and proposal engine
 * for Harness Engineering's Local Model Lifecycle Manager (LMLM).
 *
 * Phases live (in order): Phase 1 hardware detection, Phase 2a HuggingFace
 * API client + cache. Subsequent phases add the ranker math, benchmark
 * adapters, pool manager, Ollama installer, scheduler, proposal engine,
 * HTTP/WS surfaces, CLI commands, and dashboard panel per
 * `docs/changes/local-model-lifecycle-manager/proposal.md`.
 */

export { LOCAL_MODELS_PACKAGE, LOCAL_MODELS_VERSION } from './version.js';

export * from './hardware/index.js';
export * from './huggingface/index.js';
