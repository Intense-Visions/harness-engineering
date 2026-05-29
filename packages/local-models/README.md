# @harness-engineering/local-models

Hardware-aware local-model recommender, pool manager, and proposal engine for Harness Engineering's **Local Model Lifecycle Manager (LMLM)**.

See [`docs/changes/local-model-lifecycle-manager/proposal.md`](../../docs/changes/local-model-lifecycle-manager/proposal.md) for the full spec.

## Status

**Phase 2c — Evidence + recency + benchmark sources/merge.**

Public surface so far:

- `HardwareDetector` / `detectHardware` (Phase 1) — Apple Silicon, NVIDIA, CPU profiles with fallback warnings.
- `HuggingFaceClient` (Phase 2a) — typed wrapper over `/api/models` and `/api/models/:repo` with stable error codes and an injected `fetcher` DI seam.
- `HuggingFaceCache` (Phase 2a) — in-memory + atomically-persisted on-disk cache (TTL 24h) for HF responses.
- `loadFrozenSnapshot` (Phase 2a) — bundled benchmark snapshot loader the orchestrator falls back to when live sources are unreachable (S4).
- `normalizeQuantId` / `QUANT_BITS_PER_WEIGHT` (Phase 2b) — canonical GGUF + MLX quant table with case-insensitive alias resolution and a conservative fallback for unknown ids.
- `estimateVram` (Phase 2b) — four-term VRAM decomposition (weights + KV cache + activations + framework overhead) for any `(sizeB, activeB?, quant, contextTokens, kvCacheQuant)` tuple. MoE keeps all weights resident; `activeB` is echoed for the speed estimator.
- `estimateSpeed` (Phase 2b) — bandwidth-bound token throughput projection with backend-efficiency multipliers, MoE active-params handling, partial-offload blending toward a CPU floor, and a hard-zero short-circuit for won't-fit candidates. Never throws.
- `gradeEvidence` / `EVIDENCE_CONFIDENCE` (Phase 2c) — five-rung evidence ladder (`direct`, `variant`, `base`, `interpolated`, `self-reported`) with calibrated confidence multipliers; self-reported observations are absorbed.
- `applyRecencyDecay` (Phase 2c) — exponential age decay (halflife 9 months) plus an optional lineage step penalty (`× 0.6` per generation behind the target). Weights clamp at `MIN_RECENCY_WEIGHT = 0.05`.
- `openLlmLeaderboardSource` / `huggingFacePopularitySource` (Phase 2c) — two seed adapters behind the `BenchmarkSource` interface. Both take an injected `Fetcher` so CI never touches the network; every failure path surfaces as a structured `SourceWarning` rather than throwing.
- `mergeBenchmarks` (Phase 2c) — folds evidence × recency × source weight into a single `{ score (0–100), confidence: 'high' | 'medium' | 'low', contributions }` per candidate. Empty input short-circuits to `confidence: 'low'`; never throws.

The `RankedModel` orchestrator and parity fixtures land in Phase 2d. Pool manager, Ollama installer, proposal engine, scheduler, and HTTP / CLI / dashboard surfaces ship in Phases 3–9 per the spec.

## Goals (recap)

- Detect the operator's hardware (Apple Silicon / NVIDIA / CPU) and rank Hugging Face models for that hardware.
- Manage a disk-budget-bounded pool of installed Ollama models within an operator-approved org/family allowlist.
- Propose pool changes through the existing hermes-phase-4 review queue with single approve/reject UX.
- Drive recommendations via the live HuggingFace API with a frozen-snapshot fallback for offline environments.

## License

MIT
