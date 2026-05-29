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
- `ModelShape` + `estimateVram` + `estimateTokPerSec` (Phase 2b) — pure functions converting `(shape, quant, hardware)` into a per-bucket VRAM breakdown (weights + GQA KV + activations + runtime overhead) and a bandwidth-bound tokens-per-second estimate with backend-efficiency, quant, MoE-active, and partial-offload awareness.

Evidence + recency grading, live benchmark sources, the merge algorithm, the `RankedModel` orchestrator, the pool manager, the Ollama installer, the proposal engine, the scheduler, and the HTTP / CLI / dashboard surfaces ship in Phases 2c–9 per the spec.

## Goals (recap)

- Detect the operator's hardware (Apple Silicon / NVIDIA / CPU) and rank Hugging Face models for that hardware.
- Manage a disk-budget-bounded pool of installed Ollama models within an operator-approved org/family allowlist.
- Propose pool changes through the existing hermes-phase-4 review queue with single approve/reject UX.
- Drive recommendations via the live HuggingFace API with a frozen-snapshot fallback for offline environments.

## License

MIT
