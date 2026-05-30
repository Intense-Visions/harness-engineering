# @harness-engineering/local-models

Hardware-aware local-model recommender, pool manager, and proposal engine for Harness Engineering's **Local Model Lifecycle Manager (LMLM)**.

See [`docs/changes/local-model-lifecycle-manager/proposal.md`](../../docs/changes/local-model-lifecycle-manager/proposal.md) for the full spec.

## Status

**Phase 3c — `PoolManager` orchestrator (with Phase 2d `RankedModel` orchestrator).**

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
- `PoolStateStore` (Phase 3a) — atomic on-disk persistence of `PoolState` to `~/.harness/local-models/pool.json` (tmp + rename, O2). Versioned schema with graceful degradation to `EmptyPoolState()` on missing / malformed / version-mismatched files. Single mutation path (`update`) always recomputes derived `diskUsedGb` from the entry sum.
- `planEviction` (Phase 3a) — pure lowest-score-LRU planner. Sorts pool entries by `(currentScore, lastUsedAt, installedAt)` ascending (treating `lastUsedAt: null` as oldest) and accumulates evictions until the requested `freeBudgetGb` is met or the pool is exhausted.
- `InstallAdapter` / `OllamaInstallAdapter` / `AdvisoryInstallAdapter` (Phase 3b) — transport-agnostic install contract plus two concrete implementations. The Ollama adapter speaks `/api/pull` (NDJSON streaming with typed `InstallEvent`s), `/api/delete`, `/api/tags`, and `/api/show` via an injected `Fetcher`. The advisory adapter renders copy-paste commands (`lms get …`, `vllm serve …`, `llama-server -m …`) for backends whose lifecycle is operator-driven (D4); `install`/`evict`/`inspect` reject with `InstallError('advisory_only', …)`. `InstallError.code` is the stable taxonomy higher layers branch on: `advisory_only`, `failed_target_missing` (D13), `installer_unavailable` (S6), `install_failed` (S7), `not_in_pool` (D12), `parse_failed`.
- `nullInstallAdapter` (Phase 3b) — `InstallAdapter` whose methods reject with `installer_unavailable`. Test seam and the manager's default when LMLM is disabled.
- `rankModels` / `RankedModel` (Phase 2d) — hardware-aware orchestrator that composes `estimateVram` + `estimateSpeed` + `mergeBenchmarks` into a sorted `RankedModel[]`. Won't-fit candidates are filtered by default (F3 / Q3); `options.includeUnfit` keeps them at the bottom with `score: 0`. Per-row `evidence` reflects the **weakest** grade among contributions so a single self-reported observation flags the row, while the full per-contribution breakdown lives on `benchmarkScore.contributions` for the dashboard tooltip. Deterministic sort: score desc → `estimatedTokPerSec` desc → `hfRepoId` code-point asc. `scaleScore` folds the merge's `confidence` label and the speed estimator's `confidence` band into the orchestrator-level score so a `'high'`-confidence fit outranks a `'low'`-confidence one at equal raw value (Q4, Q5). Never throws; degraded paths surface as `RankerWarning[]` (e.g. `snapshot_unavailable` for empty-snapshot calls, S4).
- `LiveObservation` (Phase 2d) — `BenchmarkObservation` extended with `hfRepoId` so the orchestrator can pair source-adapter output with a candidate without re-stitching the model dimension. Phase 6's scheduler will refactor the source adapters to emit this shape directly.
- Parity fixtures (Phase 2d) — `tests/ranker/parity/m3-max-36gb.json` and `rtx-4090-24gb.json` pin the top-1 model id + a `[scoreMin, scoreMax]` band for the hardware called out in spec success criteria Q1 + Q2. The bundled seed benchmark snapshot is the source of truth for the assertions; CI never invokes whichllm.
- `PoolManager` (Phase 3c) — high-level orchestrator composing `PoolStateStore` + `planEviction` + an `InstallAdapter`. `install` runs the full slot pipeline in one call (allowlist gate → idempotent short-circuit → optional `installer.inspect` for size → capacity check → pre-commit `installer.evict` in lowest-score-LRU order → `installer.install` → append + persist). Budget enforcement is hard at the engine layer (S5: `budget_exceeded` short-circuits before the installer is invoked). `install_failed` triggers best-effort partial-byte cleanup via `installer.evict` (S7); `installer_unavailable` does not (S6); `failed_target_missing` does not (D13). `evict` invokes the installer first, mutates pool state only after a successful or D12-reconciled reply (`not_in_pool` collapses to silent reconciliation). `reconcile()` prunes pool entries the installer no longer reports (D12 primitive; F10's scheduler wires the timer in Phase 6). Bookkeeping seams `markUsed` and `updateScores` persist once per call; `configurePool(partial)` is the Phase 7 CLI seam for `pool {set-budget, allow-org, allow-family}`; `snapshot()` + `isAllowed({ hfRepoId, family? })` are the read-only seams for the resolver / proposal engine / dashboard.

The `LocalModelResolver` integration (Phase 4), proposal engine + schema generalization (Phase 5), background scheduler (Phase 6), and HTTP / WS / CLI / dashboard surfaces (Phases 7–8) ship per the spec.

## Goals (recap)

- Detect the operator's hardware (Apple Silicon / NVIDIA / CPU) and rank Hugging Face models for that hardware.
- Manage a disk-budget-bounded pool of installed Ollama models within an operator-approved org/family allowlist.
- Propose pool changes through the existing hermes-phase-4 review queue with single approve/reject UX.
- Drive recommendations via the live HuggingFace API with a frozen-snapshot fallback for offline environments.

## License

MIT
