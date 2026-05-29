# Plan: LMLM Phase 2b — VRAM + speed math

**Date:** 2026-05-29 | **Spec:** `docs/changes/local-model-lifecycle-manager/proposal.md` (Phase 2, lines 414–429) | **Tasks:** 5 | **Time:** ~2 hours | **Integration Tier:** small | **Session:** `changes--local-model-lifecycle-manager--phase2b`

## Goal

Stand up the two pure-math primitives the ranker (Phase 2c–d) composes into a `RankedModel`: a **VRAM estimator** that turns a `(ModelShape, quant)` pair into a four-bucket residency breakdown, and a **speed estimator** that turns the same pair plus a `HardwareProfile` into a bandwidth-bound tokens-per-second figure with a discrete confidence grade. Both modules are dependency-free, deterministic, and accept all architecture knobs through a shared `ModelShape` so Phase 2c can populate them from HF metadata + a curated family table without touching the math.

Phase 2b does **not** ship benchmark evidence grading, recency demotion, the cross-source merge, the `RankedModel` type itself, parity fixtures, or any orchestrator / HTTP / CLI wiring.

## Phase 2b Scope (from spec Phase 2, lines 414–429)

In:

- `src/ranker/model-shape.ts` — leaf type. `KnownQuant` union covers the GGUF labels we calibrate constants for (`Q2_K`, `Q3_K_M`, `Q4_0`, `Q4_K_M`, `Q5_0`, `Q5_K_M`, `Q6_K`, `Q8_0`, `FP16`, `BF16`, `FP32`). `ModelShape` carries `paramsB`, optional `activeParamsB` (MoE), `layers`, `hiddenSize`, `numAttnHeads`, `numKvHeads`, `headDim`, `vocabSize`, `contextLen`, and optional `family`. No imports, no behavior — Phase 2c's merge logic will populate it.
- `src/ranker/vram.ts` — four-term breakdown returned by `estimateVram(shape, quant, options?)`:
  - **weights**: `(paramsB × 1e9 × bitsPerWeight) / 8`. MoE uses total `paramsB`, not active (every expert is resident even when only a subset streams per token).
  - **KV cache**: GQA-aware. `2 × layers × headDim × numKvHeads × contextLen × bytesPerEntry` — exact, not heuristic. `bytesPerEntry` defaults to 2 (FP16); operator can pass `1` for KV-Q8.
  - **activation**: `hiddenSize × contextLen × batchSize × 2 (FP16) × 4 (multiplier)` — empirical 4× multiplier captures attention + MLP scratch + residual double-buffering.
  - **overhead**: flat `RUNTIME_OVERHEAD_GB` = 0.5 (ollama / llama.cpp scratch + sampling tables).
  - The math is broken into named helpers (`estimateWeightsGb`, `estimateKvCacheGb`, `estimateActivationsGb`) so each is independently testable. Unknown quants fall back to FP16 with a structured `vram_unknown_quant` note instead of throwing — the ranker would rather over-budget than crash.
- `src/ranker/speed.ts` — bandwidth-bound throughput estimate via `estimateTokPerSec({ shape, quant, hardware, partialOffload? })`:
  - `tokPerSec ≈ effectiveBandwidth / bytesPerToken`.
  - `effectiveBandwidth = hardware.bandwidthGbps × backendEfficiency × quantFactor`. `BACKEND_EFFICIENCY` = `{ metal: 0.65, cuda: 0.80, cpu: 0.30 }`; `QUANT_BANDWIDTH_FACTOR` is per-quant, mid-band of public llama.cpp numbers.
  - `bytesPerToken` uses **active** params for MoE (only routed experts stream per token) and adds the GQA-aware KV row.
  - `pickBackend(hardware)` maps `platform` (`macos|nvidia|cpu`) → backend tag (`metal|cuda|cpu`).
  - **Partial offload** (NVIDIA only): when `layersOffloaded < shape.layers`, compute a layer-weighted harmonic mean of VRAM + DRAM bandwidths so the non-resident layers pay the slower bus. Apple Silicon's unified memory short-circuits this — partial offload is ignored on `'macos'`.
  - **Confidence** demotes to `'low'` for CPU-only and partial-offload paths, `'medium'` for unknown quants, `'high'` otherwise. Stable codes (`speed_unknown_quant`, `speed_partial_offload`, `speed_cpu_fallback`) ride alongside in `notes[]` so Phase 5b's justification renderer can switch on data, not strings.
- `src/ranker/index.ts` — re-export `KnownQuant`, `ModelShape`, the public VRAM API (`QUANT_BITS`, `RUNTIME_OVERHEAD_GB`, `estimateWeightsGb`, `estimateKvCacheGb`, `estimateActivationsGb`, `estimateVram`, plus `VramEstimate` / `VramNote` / `VramOptions` / `KvCacheArgs` / `ActivationArgs` types), and the public speed API (`BACKEND_EFFICIENCY`, `QUANT_BANDWIDTH_FACTOR`, `pickBackend`, `estimateTokPerSec`, plus `SpeedBackend` / `SpeedConfidence` / `SpeedEstimate` / `SpeedEstimateArgs` / `SpeedNote` / `PartialOffload` types). Phase 2c's evidence + merge modules ride on top of this barrel.
- Tests under `tests/ranker/`: `vram.test.ts` (per-bucket helpers + composed `estimateVram` + MoE + unknown-quant + KV-Q8 override + per-bucket sum invariant) and `speed.test.ts` (backend dispatch + M3 Max / RTX 4090 envelopes + MoE active-params + CPU demote + partial-offload arithmetic + unified-memory short-circuit + bytesPerToken / effective-bandwidth exposure).
- Smoke-import test in `tests/smoke.test.ts` (OT8) asserts the new exports are reachable through the package barrel.
- `.changeset/lmlm-phase2b-vram-speed.md`.
- `README.md` — one-paragraph Phase 2b status line.

Out of Phase 2b (deferred):

- `RankedModel` shape and `algorithm.ts` orchestrator — Phase 2d.
- Evidence grading + recency demotion — Phase 2c.
- Live benchmark source adapters + cross-source merge — Phase 2c.
- HF detail parsing that populates `ModelShape.layers / numKvHeads / headDim` from `config.json` — Phase 2c (today the math accepts whatever the caller provides; Phase 2c will ship a curated family table + HF detail extractor).
- Parity fixtures against whichllm — Phase 2d (Q1, Q2).
- Orchestrator / HTTP / CLI / dashboard wiring.

## Observable Truths (Acceptance Criteria — Phase 2b only)

1. **OT1**: `estimateWeightsGb(32, 4.5)` ≈ `16.764` GiB. The helper is linear in both `params` and `bits` (doubling either doubles the result; verified by direct multiplication).
2. **OT2**: `estimateKvCacheGb({ layers: 64, headDim: 128, numKvHeads: 8, contextLen: 4096 })` ≈ `1.0` GiB; the same call at 8192 ctx ≈ `2.0` GiB. Switching `numKvHeads` from `8` to `64` (MHA) multiplies KV by exactly `8` (GQA collapse). `bytesPerEntry: 1` halves the result (KV-Q8).
3. **OT3**: `estimateActivationsGb({ hiddenSize: 5120, contextLen: 8192 })` ≈ `0.313` GiB; the helper is linear in `batchSize`.
4. **OT4**: `estimateVram(qwen3_32b, 'Q4_K_M')` totals ≈ `19.58` GiB across all four buckets, the per-bucket sum matches `totalGb` modulo float epsilon, and the breakdown is exposed for the future justification renderer.
5. **OT5**: For an MoE shape (`paramsB: 100, activeParamsB: 15`), the VRAM weights bucket uses `100` (total). A regression that swaps to `activeParamsB` fails this test fast.
6. **OT6**: An unknown quant ("`NOT_A_QUANT`") falls back to FP16 + emits a single `vram_unknown_quant` note. The math never throws.
7. **OT7**: `pickBackend` maps `'macos'`→`'metal'`, `'nvidia'`→`'cuda'`, `'cpu'`→`'cpu'`.
8. **OT8**: `estimateTokPerSec(qwen3_32b, 'Q4_K_M', m3_max)` lands in the `10–25` t/s envelope at `'high'` confidence. The same call on `rtx_4090` lands in `35–60` t/s — NVIDIA is at least `2×` faster than M3 Max for the same shape + quant.
9. **OT9**: MoE active-params drive throughput — a 100B-total / 15B-active model on M3 Max is at least `2×` as fast as dense 32B on the same hardware.
10. **OT10**: CPU-only path returns `confidence: 'low'` + a `speed_cpu_fallback` note. Throughput lags the same shape on M3 Max.
11. **OT11**: Unknown quant on the speed path demotes confidence to `'medium'` + emits a `speed_unknown_quant` note.
12. **OT12**: Partial offload on NVIDIA — passing `{ layersOffloaded: 32, dramBandwidthGbps: 50 }` for a 64-layer shape — demotes confidence to `'low'`, emits a `speed_partial_offload` note, and yields strictly lower `tokPerSec` than full residency. With all layers offloaded (`layersOffloaded === shape.layers`), the result is identical to the no-partial-offload call (no-op short-circuit).
13. **OT13**: Partial-offload arguments are silently ignored on Apple Silicon (unified memory; the partial-offload code path is NVIDIA-gated). The `tokPerSec` and `confidence` match the non-partial call.
14. **OT14**: `bytesPerToken` and `effectiveBandwidthGbps` are exposed on `SpeedEstimate` so the Phase 5b justification renderer / dashboard can show the breakdown without recomputing.
15. **OT15**: The new exports are reachable through `@harness-engineering/local-models`'s root barrel — `import { estimateVram, estimateTokPerSec, pickBackend, ModelShape }`. A one-line smoke test guards this.
16. **OT16**: `pnpm --filter @harness-engineering/local-models typecheck`, `lint`, `test`, and `build` are all green. The package's `dependencies` block is unchanged (no new runtime deps).
17. **OT17**: Existing Phase 1 + Phase 2a tests pass unchanged (55 → 83 tests, 8 → 10 files).

## Skill Recommendations

- `tdd-classicist` (reference) — pure functions with tabular cases keep tests classical and side-effect-free.
- `domain-modelling` (reference) — `ModelShape`, `VramEstimate`, and `SpeedEstimate` are first-class types in the public barrel; consumers branch on data (notes with stable codes), not free-text strings.

## File Map

- CREATE `packages/local-models/src/ranker/model-shape.ts`
- CREATE `packages/local-models/src/ranker/vram.ts`
- CREATE `packages/local-models/src/ranker/speed.ts`
- MODIFY `packages/local-models/src/ranker/index.ts` — re-export the Phase 2b surface
- CREATE `packages/local-models/tests/ranker/vram.test.ts`
- CREATE `packages/local-models/tests/ranker/speed.test.ts`
- MODIFY `packages/local-models/tests/smoke.test.ts` — add OT15 import smoke for the new exports
- MODIFY `packages/local-models/README.md` — single-paragraph Phase 2b status
- CREATE `.changeset/lmlm-phase2b-vram-speed.md`

## Skeleton

1. Land `model-shape.ts` (leaf type + `KnownQuant` union). (~1 task)
2. Land `vram.ts` with per-bucket helpers + composed estimator + unknown-quant fallback. (~1 task)
3. Land `speed.ts` with backend dispatch + MoE-aware bytesPerToken + partial-offload arithmetic + confidence grading. (~1 task)
4. Wire the ranker barrel + import-smoke test for OT15. (~1 task)
5. Verification gate + changeset + README touch-up. (~1 task)
