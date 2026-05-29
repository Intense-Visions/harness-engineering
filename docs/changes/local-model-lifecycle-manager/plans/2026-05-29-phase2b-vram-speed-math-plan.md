# Plan: LMLM Phase 2b — VRAM + Speed math

**Date:** 2026-05-29 | **Spec:** `docs/changes/local-model-lifecycle-manager/proposal.md` (Phase 2, lines 414–429) | **Tasks:** 6 | **Time:** ~3 hours | **Integration Tier:** small | **Session:** `changes--local-model-lifecycle-manager--phase2b`

## Goal

Ship the two pure math modules the ranker (Phase 2c–d) will compose into a `RankedModel`: an estimator that turns `(sizeB, activeB?, quant, contextTokens?)` into a `VramEstimate` and a bandwidth-bound estimator that turns that estimate plus a `HardwareProfile` into a `SpeedEstimate`. Both functions are deterministic, side-effect-free, and unit-testable without any fetcher, shell, or filesystem seam — the rest of LMLM stacks on top of them.

Phase 2b does **not** ship the evidence/recency math (2c), the benchmark merge (2c), the live source adapters (2c), the `RankedModel` orchestrator (2d), or the parity fixtures (2d). It ships the math; later phases call it.

## Phase 2b Scope (from spec Phase 2, lines 414–429)

In:

- `src/ranker/vram.ts` — `estimateVram({ sizeB, activeB?, quant, contextTokens?, kvCacheQuant? })` returning `{ weightsGb, kvCacheGb, activationsGb, overheadGb, totalGb, … }`. Weights derived from a per-quant bits-per-weight table; KV cache derived from a per-context-token cost scaled by `sizeB`; activations + overhead as documented constants. MoE total params drive weights (all weights live in memory); `activeB` is recorded on the estimate for downstream consumers but does not change VRAM.
- `src/ranker/speed.ts` — `estimateSpeed({ sizeB, activeB?, quant, hardware, vramEstimate, backend? })` returning `{ tokPerSec, confidence, effectiveBandwidthGbps, activeWeightsGb, partialOffloadFraction, backend }`. Core model: `tokPerSec ≈ effectiveBandwidth × backendEfficiency / activeWeightsGb`. MoE active params drive throughput (`activeB ?? sizeB`). Partial-offload reduces `effectiveBandwidthGbps` toward a CPU-only floor when `vramEstimate.totalGb > hardware.vramGb`. Apple Silicon unified memory still pays the spillover penalty once it exceeds unified memory (swap-bound).
- `src/ranker/quants.ts` — canonical bits-per-weight table for GGUF / MLX quant ids plus a normalizer that accepts common aliases (`'Q4_K_M' | 'q4_k_m' | 'IQ4_XS' | 'FP16' | 'MLX-4bit' | …`). Shared by `vram.ts` and `speed.ts`.
- `src/ranker/index.ts` — extend the barrel to re-export the new modules and their public types.
- `src/index.ts` — already re-exports `./ranker/index.js`; nothing further required.
- Tests for each module under `tests/ranker/`: `vram.test.ts`, `speed.test.ts`, `quants.test.ts`.

Out of Phase 2b (deferred to 2c–d):

- Evidence grading (`ranker/evidence.ts`) and lineage-aware recency demotion (`ranker/recency.ts`) — Phase 2c.
- Live benchmark source adapters (`ranker/benchmarks/sources.ts`) and the cross-source merge (`ranker/benchmarks/merge.ts`) — Phase 2c.
- The `RankedModel` type and `ranker/algorithm.ts` orchestrator — Phase 2d.
- Parity tests against `m3-max-36gb.json` / `rtx-4090-24gb.json` (Q1, Q2) — Phase 2d.
- HTTP / CLI / dashboard / orchestrator wiring — Phases 6–8.

## Observable Truths (Acceptance Criteria — Phase 2b only)

1. **OT1**: `estimateVram({ sizeB: 32, quant: 'Q4_K_M', contextTokens: 4096 })` returns a `totalGb` between 20 GB and 26 GB (Qwen3-32B Q4_K_M's published footprint), with `weightsGb` derived from the per-quant bits/weight table and `kvCacheGb` scaling linearly with `contextTokens`.
2. **OT2**: Doubling `contextTokens` doubles `kvCacheGb`; halving the KV cache quant from `fp16` to `q8` halves `kvCacheGb`; quantizing to `q4` quarters it. `totalGb = weightsGb + kvCacheGb + activationsGb + overheadGb` to floating-point precision.
3. **OT3**: For an MoE input (`sizeB: 30, activeB: 3, quant: 'Q4_K_M'`), `weightsGb` is sized off the total (`sizeB`), not the active params; the returned estimate echoes `activeB` so downstream consumers can route to the speed module.
4. **OT4**: Unknown quant strings normalize via `normalizeQuantId` to the closest documented match when the alias is registered (case-insensitive `'q4_k_m' → 'Q4_K_M'`, `'mlx-q4' → 'MLX-4bit'`); truly unknown ids surface `quantBitsPerWeight = UNKNOWN_QUANT_BITS_PER_WEIGHT` (8) and the estimate carries `quantWarning: 'quant_unknown'` so the caller can flag the result.
5. **OT5**: `estimateSpeed` on a synthetic Apple-Silicon profile (`platform: 'macos', bandwidthGbps: 400, vramGb: 36`) running `Qwen3-32B Q4_K_M` returns `tokPerSec` in the 10–30 t/s range with `confidence: 'high'` (full-fit case).
6. **OT6**: `estimateSpeed` on an NVIDIA profile (`platform: 'nvidia', bandwidthGbps: 1008, vramGb: 24`) running `Llama-3 70B Q4_K_M` whose `vramEstimate.totalGb > hardware.vramGb` triggers a partial-offload path: `partialOffloadFraction > 0`, `tokPerSec` falls strictly below the would-be full-fit estimate, and `confidence` is `'medium'` when offload ≤ 0.5 or `'low'` when above.
7. **OT7**: For MoE (`sizeB: 30, activeB: 3`), `estimateSpeed` uses `activeWeightsGb` derived from `activeB`, not the total — the returned `tokPerSec` is at least 4× the dense-30B baseline at the same bandwidth and quant.
8. **OT8**: A CPU profile (`platform: 'cpu', bandwidthGbps: 80, vramGb: 0`) returns a non-zero `tokPerSec`, `confidence: 'low'`, and a `partialOffloadFraction` of `1.0` (everything runs on system RAM).
9. **OT9**: `estimateSpeed` never throws when the model would not fit at all (`vramEstimate.totalGb > hardware.vramGb + hardware.ramGb`): it returns `tokPerSec: 0`, `confidence: 'low'`, `partialOffloadFraction: 1.0`, and `effectiveBandwidthGbps: 0`.
10. **OT10**: `pnpm --filter @harness-engineering/local-models build`, `typecheck`, `lint`, and `test` are all green; Phase 1 + Phase 2a tests pass unchanged.

## Skill Recommendations

- `gof-strategy` (reference) — `backend` is a strategy that selects the bandwidth-efficiency constant; the canonical quant table is itself a strategy lookup. Both stay pure and substitutable.
- `tdd-classicist` (reference) — each math module has table-driven unit tests with no I/O; the assertions are numeric ranges chosen from public footprints rather than golden numbers, so the tests stay honest as we tune constants.
- `ts-type-guards` (reference) — `normalizeQuantId` guards the public API surface so downstream callers can pass user-supplied quant strings without crashing the ranker.

## File Map

- CREATE `packages/local-models/src/ranker/quants.ts`
- CREATE `packages/local-models/src/ranker/vram.ts`
- CREATE `packages/local-models/src/ranker/speed.ts`
- MODIFY `packages/local-models/src/ranker/index.ts` (re-export `quants`, `vram`, `speed`)
- CREATE `packages/local-models/tests/ranker/quants.test.ts`
- CREATE `packages/local-models/tests/ranker/vram.test.ts`
- CREATE `packages/local-models/tests/ranker/speed.test.ts`
- CREATE `.changeset/lmlm-phase2b-vram-speed.md`
- MODIFY `packages/local-models/README.md` — single-paragraph Phase 2b note

## Skeleton

1. Land `quants.ts` — bits-per-weight table + alias normalizer; pure data + one function. (~1 task)
2. Land `vram.ts` — weights + KV cache + activations + overhead; pure math; depends on `quants.ts`. (~1 task)
3. Land `speed.ts` — bandwidth × backend efficiency ÷ active weights, with partial-offload toward CPU floor and a hard zero when nothing fits; depends on `quants.ts` + the `HardwareProfile` from Phase 1. (~1 task)
4. Tests for each module — table-driven; numeric assertions are ranges from public footprints, not golden constants. (~1 task)
5. Verification gate. (~1 task)
6. Changeset + README touch-up. (~1 task)

**Estimated total:** 6 tasks, ~3 hours.

## Uncertainties

- **[ASSUMPTION]** The bits-per-weight table is seeded from published llama.cpp / MLX numbers (Q4_K_M ≈ 4.85 bits/weight, Q5_K_M ≈ 5.7, Q6_K ≈ 6.6, Q8_0 ≈ 8.5, FP16/BF16 = 16, MLX-4bit ≈ 4.25). These are the canonical figures the GGUF README and the llama.cpp README report; Phase 2d's parity fixtures will catch drift if any vendor revises a quant.
- **[ASSUMPTION]** KV cache per token at FP16 is approximated as `KV_CACHE_BYTES_PER_TOKEN_PER_BILLION_PARAMS × sizeB` (a single calibration constant), not the exact `2 × n_layers × n_kv_heads × head_dim × 2`. We do not know layer counts / head dims from the HF metadata the ranker consumes (the HF list endpoint omits `config.json`). The constant is tuned so 32B at 4 K matches published numbers (~1 GB). Phase 2d's parity tests will surface any model family where this approximation diverges by more than the proposal threshold; that's the natural moment to upgrade to a per-family lookup if needed.
- **[ASSUMPTION]** Backend-efficiency constants (`ollama / llama-cpp` on CUDA ≈ 0.55, Metal/MLX ≈ 0.70, CPU ≈ 0.35) are drawn from the same public benchmarks the whichllm port references. They land here as named constants so they can be re-tuned without touching call sites.
- **[ASSUMPTION]** Apple-Silicon unified memory still pays the spillover penalty once it exceeds unified memory, because at that point we're swapping to disk. The math is intentionally identical to the NVIDIA partial-offload case there; the difference is that Apple Silicon's "VRAM" equals system RAM, so the spillover threshold is the unified memory pool, not just GPU VRAM.
- **[DEFERRABLE]** Per-family layer/head counts for an exact KV cache calculation — would replace the single constant with a small lookup. Defer until Phase 2d's parity fixtures show the approximation is too coarse.
- **[DEFERRABLE]** Quant-time decode overhead (Q4 dequant is slightly slower than Q8) — a second-order effect we can fold into the backend efficiency multiplier once parity tests show it matters.

## Tasks

### Task 1: Land `ranker/quants.ts`

**Depends on:** none | **Files:** `src/ranker/quants.ts`

1. Export `QUANT_BITS_PER_WEIGHT: Readonly<Record<string, number>>` with entries for: `F32`, `FP16`, `BF16`, `F16`, `Q8_0`, `Q6_K`, `Q5_K_M`, `Q5_K_S`, `Q4_K_M`, `Q4_K_S`, `Q4_0`, `Q3_K_M`, `Q3_K_S`, `Q2_K`, `IQ4_XS`, `IQ3_M`, `MLX-4bit`, `MLX-8bit`. Numbers in bits/weight.
2. Export `UNKNOWN_QUANT_BITS_PER_WEIGHT = 8` as the conservative fallback.
3. Export `normalizeQuantId(value: string): NormalizedQuant` that:
   - Trims whitespace, then matches case-insensitively against the table keys.
   - Honors documented aliases (`'q4_k_m' → 'Q4_K_M'`, `'mlx-q4' → 'MLX-4bit'`, `'fp16' → 'FP16'`, `'q4' → 'Q4_K_M'`, …).
   - Returns `{ canonical, known: true, bitsPerWeight }` for matched ids; `{ canonical: value, known: false, bitsPerWeight: UNKNOWN_QUANT_BITS_PER_WEIGHT }` otherwise.

Acceptance: `typecheck` clean; `quants.ts` is exported through `ranker/index.ts`.

### Task 2: Land `ranker/vram.ts`

**Depends on:** Task 1 | **Files:** `src/ranker/vram.ts`, `src/ranker/index.ts`

1. Define `KV_CACHE_BYTES_PER_TOKEN_PER_BILLION_PARAMS_FP16` so that `30 (sizeB) × 4096 (tokens) → ~1 GB` at FP16. Constant is tunable; Phase 2d's parity tests will revisit.
2. Define `ACTIVATIONS_GB = 1.5` and `FRAMEWORK_OVERHEAD_GB = 1.0`.
3. Define `KV_QUANT_MULTIPLIER: Record<KvCacheQuant, number> = { fp16: 1, q8: 0.5, q4: 0.25 }`.
4. Export `VramEstimate` interface — `{ weightsGb, kvCacheGb, activationsGb, overheadGb, totalGb, quantBitsPerWeight, quant, contextTokens, kvCacheBytesPerToken, sizeB, activeB?, quantWarning? }`.
5. Export `estimateVram(input)`:
   - `quantInfo = normalizeQuantId(input.quant)`.
   - `weightsGb = sizeB × bitsPerWeight / 8` (equivalent to `sizeB × 1e9 × bits / 8 / 1e9 bytes/GB`).
   - `kvCacheBytesPerToken = sizeB × KV_CACHE_BYTES_PER_TOKEN_PER_BILLION_PARAMS_FP16 × kvQuantMultiplier`.
   - `kvCacheGb = contextTokens × kvCacheBytesPerToken / 1e9`.
   - `totalGb = weightsGb + kvCacheGb + ACTIVATIONS_GB + FRAMEWORK_OVERHEAD_GB`.
   - `quantWarning = quantInfo.known ? undefined : 'quant_unknown'`.
   - Return the populated `VramEstimate`.
6. Defaults: `contextTokens = 4096`, `kvCacheQuant = 'fp16'`.

Acceptance: typecheck clean; `vram.ts` exported through the barrel.

### Task 3: Land `ranker/speed.ts`

**Depends on:** Tasks 1–2 | **Files:** `src/ranker/speed.ts`, `src/ranker/index.ts`

1. Define `BACKEND_EFFICIENCY: Readonly<Record<SpeedBackend, number>>` — `ollama: 0.55`, `llama-cpp: 0.55`, `mlx: 0.70`, `vllm: 0.65`, `cpu: 0.35`.
2. Define `CPU_BANDWIDTH_FLOOR_GBPS = 60` (DDR5 desktop baseline) used as the CPU side of the partial-offload blend.
3. Export `SpeedBackend` union and `SpeedEstimate` interface — `{ tokPerSec, confidence, effectiveBandwidthGbps, activeWeightsGb, partialOffloadFraction, backend }`.
4. Export `estimateSpeed(input)`:
   - `quantInfo = normalizeQuantId(input.quant)`.
   - `activeWeightsGb = (activeB ?? sizeB) × bitsPerWeight / 8`.
   - Default backend: `'mlx'` for `platform: 'macos'`, `'llama-cpp'` for `'nvidia'`, `'cpu'` for `'cpu'`. Caller can override.
   - Won't-fit short-circuit: `vramEstimate.totalGb > hardware.vramGb + hardware.ramGb` ⇒ return `tokPerSec: 0, confidence: 'low', partialOffloadFraction: 1, effectiveBandwidthGbps: 0`.
   - Partial-offload fraction: `0` when `vramEstimate.totalGb ≤ hardware.vramGb`; `(totalGb − vramGb) / totalGb` when spills (capped at 1); `1` on CPU platform.
   - `effectiveBandwidthGbps = hardware.bandwidthGbps × (1 − partialOffloadFraction) + CPU_BANDWIDTH_FLOOR_GBPS × partialOffloadFraction`.
   - `tokPerSec = effectiveBandwidthGbps × BACKEND_EFFICIENCY[backend] / activeWeightsGb`.
   - `confidence`: `'low'` for CPU backend, unknown quant, or partial-offload > 0.5; `'medium'` when partial-offload > 0; `'high'` otherwise.

Acceptance: typecheck clean; `speed.ts` exported through the barrel.

### Task 4: Tests for `quants` + `vram` + `speed`

**Depends on:** Tasks 1–3 | **Files:** `tests/ranker/quants.test.ts`, `tests/ranker/vram.test.ts`, `tests/ranker/speed.test.ts`

1. `quants.test.ts`:
   - Table of known ids (case variations) → matched canonical + bitsPerWeight.
   - Unknown id → `known: false`, `bitsPerWeight: UNKNOWN_QUANT_BITS_PER_WEIGHT`.
   - Aliases: `'q4_k_m'`, `'mlx-q4'`, `'fp16'`, `'q4'` all match.
   - Every registered key resolves through the normalizer.
2. `vram.test.ts`:
   - 32B Q4_K_M @ 4096 tokens → `totalGb` between 20 and 26 (OT1).
   - 7B Q4_K_M @ 4096 → `totalGb` between 5 and 8 (sanity).
   - 70B Q4_K_M @ 4096 → `totalGb` between 42 and 50 (sanity).
   - Doubling tokens doubles kvCache; kvCacheQuant `q8` halves, `q4` quarters (OT2).
   - MoE input echoes `activeB`; weights derived from `sizeB` (OT3).
   - Unknown quant ⇒ `quantWarning: 'quant_unknown'` (OT4).
3. `speed.test.ts`:
   - Apple Silicon M3 Max (400 GB/s, 36 GB) + Qwen3 32B Q4_K_M (fits) → 10–30 t/s, confidence `'high'` (OT5).
   - RTX 4090 (1008 GB/s, 24 GB) + Llama-3 70B Q4_K_M (does NOT fit) → partial offload, `tokPerSec` drops vs. would-be full-fit case, confidence `'medium'` or `'low'` (OT6).
   - Tight VRAM host + 70B Q4_K_M → offload > 0.5 ⇒ confidence `'low'`.
   - MoE: 30B total / 3B active → t/s ≥ 4× dense-30B at same bandwidth + quant (OT7).
   - CPU profile → non-zero t/s, confidence `'low'`, partialOffloadFraction `1.0` (OT8).
   - Won't-fit case (`vram + ram` too small) → `tokPerSec: 0`, `confidence: 'low'` (OT9).
   - Unknown quant ⇒ confidence `'low'` even on a full-fit case.
   - Backend override picks up a different efficiency.

### Task 5: Verification gate

**Depends on:** Tasks 1–4 | **Files:** none

1. `pnpm --filter @harness-engineering/types build`.
2. `pnpm --filter @harness-engineering/local-models typecheck` — green.
3. `pnpm --filter @harness-engineering/local-models test` — green; Phase 1 + Phase 2a + Phase 2b tests all pass.
4. `pnpm --filter @harness-engineering/local-models build` — green.
5. `pnpm --filter @harness-engineering/local-models lint` — green.
6. `pnpm exec harness validate` from repo root — no new issues introduced under `packages/local-models`.

### Task 6: Changeset + README

**Depends on:** Tasks 1–5 | **Files:** `.changeset/lmlm-phase2b-vram-speed.md`, `packages/local-models/README.md`

1. `minor` bump on `@harness-engineering/local-models`.
2. Body summarizes the three new pure functions (`normalizeQuantId`, `estimateVram`, `estimateSpeed`), the constants they centralize, and explicitly notes the evidence/recency/merge math and the algorithm orchestrator still land in 2c–d.
3. README — append a brief Phase 2b section to the status list.

## Integration Notes

Phase 2b's integration footprint stays at the package boundary, same as 2a:

- The new exports (`normalizeQuantId`, `QUANT_BITS_PER_WEIGHT`, `estimateVram`, `VramEstimate`, `estimateSpeed`, `SpeedEstimate`, `SpeedBackend`) reach the public surface through `ranker/index.ts` → `src/index.ts`. No orchestrator, CLI, dashboard, or HTTP wiring lands here.
- **Phase 2c (Evidence + Recency + Merge)** does not depend on `vram.ts` / `speed.ts` directly; it consumes the HF client + frozen snapshot to produce a benchmark roll-up.
- **Phase 2d (Algorithm)** is the first consumer of `estimateVram` + `estimateSpeed`. It also wires `HardwareDetector` (Phase 1), the HF client (Phase 2a), and the benchmark merge (Phase 2c) together to produce `RankedModel[]`.
- **Phases 6–8** never call `estimateVram` / `estimateSpeed` directly; they call the eventual `ModelRanker.rank()` from 2d.

**Knowledge graph**: no new concepts entered in Phase 2b. `VRAM Estimate` and `Speed Estimate` remain internal implementation details — they don't earn first-class concept status until they're surfaced through the operator-visible `RankedModel` in Phase 2d.

**ADRs**: none in Phase 2b. ADR-NNNN+1 (TS port of ranking algorithm, not whichllm wrapper) still lands with Phase 2d when the algorithm itself ships.

**Docs**: changeset entry + a one-paragraph README note. The operator guide and `local-model-lifecycle.md` knowledge entry land in Phase 9.
