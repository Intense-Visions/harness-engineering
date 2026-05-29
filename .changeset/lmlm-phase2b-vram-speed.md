---
'@harness-engineering/local-models': minor
---

Adds Phase 2b of the Local Model Lifecycle Manager — the pure-function VRAM and speed estimators the algorithm orchestrator (Phase 2d) will call to populate `RankedModel.estimatedVramGb`, `RankedModel.estimatedTokPerSec`, and `RankedModel.speedConfidence`.

- `ModelShape` is the architecture contract the estimators consume (`paramsB`, `activeParamsB?`, `layers`, `hiddenSize`, `numAttnHeads`, `numKvHeads`, `headDim`, `vocabSize`, `contextLen`, optional `family`). Phase 2c's merge logic will populate it from a curated `family → shape` table joined with HF metadata.
- `estimateVram(shape, quant)` returns a four-bucket breakdown — weights, GQA KV cache, activations, runtime overhead — so the dashboard and proposal justification renderer can explain residency without recomputing. Weights use **total** params (memory residency does not shrink with MoE routing). Bits-per-weight comes from `QUANT_BITS` for the GGUF quant set (`Q2_K`…`Q8_0`, `FP16`, `BF16`, `FP32`); unknown quants fall through to FP16 with a structured `vram_unknown_quant` note rather than throwing.
- `estimateTokPerSec({ shape, quant, hardware, partialOffload? })` returns a bandwidth-bound throughput estimate plus a `'high' | 'medium' | 'low'` confidence tag. The math layers backend efficiency (`metal ≈ 0.65`, `cuda ≈ 0.80`, `cpu ≈ 0.30`), a per-quant bandwidth factor, MoE active-params throughput, and a layer-weighted harmonic mean for the NVIDIA partial-offload path. Confidence demotes to `'low'` for CPU-only or partial-offload paths and to `'medium'` for unknown quants.
- `pickBackend` maps `HardwareProfile.platform` to the speed backend tag. Partial-offload is silently ignored on Apple Silicon (unified memory) — there is no slower bus to fall back to.

Unit-tested with hand-computed values for Qwen3-32B Q4_K_M (weights, GQA KV at 4K + 8K, full estimate), a synthetic 100B-total / 15B-active MoE shape (verifies total drives memory, active drives throughput), and the M3 Max, RTX 4090, and CPU-only hardware profiles (verifies the t/s envelope, the relative ordering, and the partial-offload + CPU-fallback paths).

No orchestrator, CLI, dashboard, or HTTP wiring yet. Evidence + recency grading (Phase 2c), live benchmark adapters + cross-source merge (Phase 2c), the `RankedModel` orchestrator (Phase 2d), and parity tests against the whichllm reference outputs (Phase 2d) land in subsequent slices.
