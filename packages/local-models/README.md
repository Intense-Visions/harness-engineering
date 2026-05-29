# @harness-engineering/local-models

Hardware-aware local-model recommender, pool manager, and proposal engine for Harness Engineering's **Local Model Lifecycle Manager (LMLM)**.

See [`docs/changes/local-model-lifecycle-manager/proposal.md`](../../docs/changes/local-model-lifecycle-manager/proposal.md) for the full spec.

## Status

**Phase 2b — VRAM + speed math.**

Public surface so far:

- `HardwareDetector` / `detectHardware` (Phase 1) — Apple Silicon, NVIDIA, CPU profiles with fallback warnings.
- `HuggingFaceClient` (Phase 2a) — typed wrapper over `/api/models` and `/api/models/:repo` with stable error codes and an injected `fetcher` DI seam.
- `HuggingFaceCache` (Phase 2a) — in-memory + atomically-persisted on-disk cache (TTL 24h) for HF responses.
- `loadFrozenSnapshot` (Phase 2a) — bundled benchmark snapshot loader the orchestrator falls back to when live sources are unreachable (S4).
- `normalizeQuantId` / `QUANT_BITS_PER_WEIGHT` (Phase 2b) — canonical GGUF + MLX quant table with case-insensitive alias resolution and a conservative fallback for unknown ids.
- `estimateVram` (Phase 2b) — four-term VRAM decomposition (weights + KV cache + activations + framework overhead) for any `(sizeB, activeB?, quant, contextTokens, kvCacheQuant)` tuple. MoE keeps all weights resident; `activeB` is echoed for the speed estimator.
- `estimateSpeed` (Phase 2b) — bandwidth-bound token throughput projection with backend-efficiency multipliers, MoE active-params handling, partial-offload blending toward a CPU floor, and a hard-zero short-circuit for won't-fit candidates. Never throws.

Evidence + recency grading, live benchmark sources, the merge algorithm, the `RankedModel` orchestrator, the pool manager, the Ollama installer, the proposal engine, the scheduler, and the HTTP / CLI / dashboard surfaces ship in Phases 2c–9 per the spec.

## Goals (recap)

- Detect the operator's hardware (Apple Silicon / NVIDIA / CPU) and rank Hugging Face models for that hardware.
- Manage a disk-budget-bounded pool of installed Ollama models within an operator-approved org/family allowlist.
- Propose pool changes through the existing hermes-phase-4 review queue with single approve/reject UX.
- Drive recommendations via the live HuggingFace API with a frozen-snapshot fallback for offline environments.

## License

MIT
