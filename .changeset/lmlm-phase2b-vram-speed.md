---
'@harness-engineering/local-models': minor
---

Adds Phase 2b of the Local Model Lifecycle Manager — the VRAM and speed estimators the ranker (Phase 2c–d) will compose.

- `normalizeQuantId` resolves any GGUF / MLX quant string the HF ecosystem actually emits (canonical keys, case variants, common aliases like `'q4_k_m'`, `'mlx-q4'`, `'fp16'`, `'q4'`) to a canonical `{ canonical, known, bitsPerWeight }` record. Unknown ids fall through to a conservative 8-bit fallback and surface as `known: false` so downstream callers can flag the estimate.
- `estimateVram({ sizeB, activeB?, quant, contextTokens?, kvCacheQuant? })` returns the four-term decomposition the dashboard's "why this won't fit" tooltip will eventually show — weights, KV cache, activations, framework overhead — pre-summed into `totalGb`. Weights are sized off the total params (MoE keeps all weights resident); KV cache scales linearly with `contextTokens` and respects the kv-cache quantization multiplier.
- `estimateSpeed({ sizeB, activeB?, quant, hardware, vramEstimate, backend? })` returns the bandwidth-bound token throughput projection plus enough provenance for the ranker's justification text (`effectiveBandwidthGbps`, `partialOffloadFraction`, `activeWeightsGb`, `backend`, `confidence`). MoE active params drive throughput, partial-offload blends GPU bandwidth with a conservative CPU floor, and `tokPerSec` short-circuits to 0 with `confidence: 'low'` when the model won't fit at all — the estimator never throws.

The canonical `QUANT_BITS_PER_WEIGHT` table, `BACKEND_EFFICIENCY` table, and `CPU_BANDWIDTH_FLOOR_GBPS` live as named constants in one place so Phase 2d's parity fixtures can retune them without touching call sites.

No orchestrator, CLI, dashboard, or HTTP wiring yet. Evidence + recency grading (Phase 2c), the cross-source benchmark merge (Phase 2c), the `RankedModel` orchestrator (Phase 2d), and the parity tests against the whichllm reference outputs (Phase 2d) land in subsequent slices. LMLM remains opt-in and disabled by default per Phase 0.
