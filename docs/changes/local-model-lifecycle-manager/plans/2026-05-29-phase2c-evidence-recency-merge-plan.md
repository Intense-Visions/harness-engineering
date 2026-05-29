# Plan: LMLM Phase 2c — Evidence + Recency + Benchmark sources/merge

**Date:** 2026-05-29 | **Spec:** `docs/changes/local-model-lifecycle-manager/proposal.md` (Phase 2, lines 414–429; success criteria Q4/Q5/S4) | **Tasks:** 7 | **Time:** ~3.5 hours | **Integration Tier:** small | **Session:** `changes--local-model-lifecycle-manager--phase2c`

## Goal

Ship the four pure modules the ranker (Phase 2d) will compose with the math from Phase 2b into a single `RankedModel.score`: an **evidence grader** that turns a `(BenchmarkObservation, target)` pair into a confidence-weighted contribution, a **recency demotion** module that ages observations against the snapshot date with lineage awareness, two seed **source adapters** (`open-llm-leaderboard`, `huggingface-popularity`) behind a common interface, and a **cross-source merge** that emits one weighted score per model plus a `'high' | 'medium' | 'low'` confidence label.

Phase 2c does **not** ship the `RankedModel` orchestrator (`ranker/algorithm.ts`) or the parity fixtures (`m3-max-36gb.json`, `rtx-4090-24gb.json`). Those land in Phase 2d, which composes Phase 2c's merge output with Phase 2b's VRAM/speed math.

## Phase 2c Scope (from spec Phase 2, lines 414–429)

In:

- `src/ranker/evidence.ts` — `gradeEvidence({ observationModel, observationQuant, targetModel, targetQuant, lineage? })` returns `{ grade: BenchmarkEvidence, confidence: number }` per the published table (`direct = 1.0`, `variant = 0.85`, `base = 0.7`, `interpolated = 0.5`, `self-reported = 0.35`). Pure function; no I/O; depends only on string + lineage compare.
- `src/ranker/recency.ts` — `applyRecencyDecay({ observedAt, snapshotDate, lineagePosition? })` returns `{ ageMonths, weight }` where `weight = max(MIN_RECENCY_WEIGHT, exp(-ageMonths / HALFLIFE_MONTHS))`, and a lineage-aware demotion multiplier reduces weight by `LINEAGE_STEP_PENALTY` per generation when the observation is on an older lineage member (e.g. `Qwen2.5` when the merge target is on `Qwen3`).
- `src/ranker/benchmarks/sources.ts` — `BenchmarkSource` interface (`id`, `fetch({ now, fetcher }) → Promise<BenchmarkSourceResult>`) + two seed adapters:
  - `openLlmLeaderboardSource` — wraps the public Open LLM Leaderboard JSON endpoint; normalizes `(model, quant, benchmark, value)` into `BenchmarkObservation[]`; tolerates 4xx/5xx/parse failures with structured warnings (never throws).
  - `huggingFacePopularitySource` — adapts `downloads + likes` from the HF model list (reusing the Phase 2a `huggingface/client.ts` shape) into popularity observations on a synthetic `'hf-popularity'` benchmark.
- `src/ranker/benchmarks/merge.ts` — `mergeBenchmarks({ observations, target, snapshotDate, sourceWeights? }) → MergedScore` that:
  - Grades each observation via `evidence.ts`,
  - Ages each observation via `recency.ts`,
  - Multiplies `evidenceConfidence × recencyWeight × sourceWeight` to produce a contribution weight,
  - Normalises source-native scales (Open LLM Leaderboard 0–100, HF popularity rank-based) into a shared `0..1` space before combining,
  - Returns `{ score: number (0–100), confidence: 'high' | 'medium' | 'low', contributions: ScoredObservation[] }`.
- `src/ranker/index.ts` — extend the barrel to re-export `evidence`, `recency`, and (via `benchmarks/index.ts`) the new `sources` + `merge` symbols.
- `src/ranker/benchmarks/index.ts` — re-export `BenchmarkSource`, `BenchmarkSourceResult`, the two seed adapters, and `mergeBenchmarks` + `MergedScore`.
- Tests for each module under `tests/ranker/`:
  - `evidence.test.ts`
  - `recency.test.ts`
  - `benchmarks/sources.test.ts`
  - `benchmarks/merge.test.ts`

Out of Phase 2c (deferred to 2d / later):

- `src/ranker/algorithm.ts` — the `RankedModel` orchestrator that composes VRAM + speed + merge — Phase 2d.
- Parity fixtures `m3-max-36gb.json` / `rtx-4090-24gb.json` (Q1, Q2) — Phase 2d.
- Live integration tests against the real Open LLM Leaderboard / HF endpoints — Phases 6–7.
- Additional benchmark sources (LiveBench, AA, Aider, Arena ELO) — v1.1 per the spec.

## Observable Truths (Acceptance Criteria — Phase 2c only)

1. **OT1** — `gradeEvidence({ observationModel: 'Qwen/Qwen3-32B-GGUF', observationQuant: 'Q4_K_M', targetModel: 'Qwen/Qwen3-32B-GGUF', targetQuant: 'Q4_K_M' })` returns `{ grade: 'direct', confidence: 1.0 }`.
2. **OT2** — Same model id, different quant returns `{ grade: 'variant', confidence: 0.85 }`. Same family base (`'Qwen/Qwen3-32B'`, no `-GGUF`) returns `{ grade: 'base', confidence: 0.7 }`. Sibling on the same lineage with no quant match returns `{ grade: 'interpolated', confidence: 0.5 }`. An observation explicitly marked self-reported returns `{ grade: 'self-reported', confidence: 0.35 }` regardless of model id match.
3. **OT3** — `applyRecencyDecay({ observedAt: snapshotDate, snapshotDate })` returns `weight === 1.0`. `applyRecencyDecay({ observedAt: snapshotDate − 12 months, snapshotDate })` returns `weight ≤ 0.7` (≥ 30 % demotion) and `≥ 0.3`. `applyRecencyDecay({ observedAt: snapshotDate − 24 months, snapshotDate })` returns `weight ≤ 0.4` (≥ 60 % demotion).
4. **OT4** — Lineage-aware demotion: an observation tagged `lineagePosition: 1` (one generation behind the target lineage) at the same `observedAt` produces a strictly smaller `weight` than the same observation tagged `lineagePosition: 0`. Two generations behind (`lineagePosition: 2`) produces a strictly smaller weight than one generation behind. Weight is clamped at `MIN_RECENCY_WEIGHT` (`0.05`).
5. **OT5** — `openLlmLeaderboardSource.fetch({ fetcher })` with a mocked `fetcher` returning the documented Open LLM Leaderboard shape produces `BenchmarkObservation[]` with `source: 'open-llm-leaderboard'`, `evidence: 'direct'` populated, and the benchmark field set to one of the leaderboard's slugs (`'arc'`, `'mmlu'`, …). A 5xx / network / parse failure produces an empty array and a `SourceWarning[]` populated with `code: 'fetch_failed' | 'parse_failed'`; the source never throws.
6. **OT6** — `huggingFacePopularitySource.fetch({ fetcher })` with a mocked HF list response produces synthetic `BenchmarkObservation[]` on the `'hf-popularity'` benchmark whose `value` increases monotonically with the underlying `downloads + likes` composite.
7. **OT7** — Q4 (proposal success criterion): given two models A and B with identical raw benchmark scores but A's observation grades as `direct` (`confidence: 1.0`) and B's grades as `self-reported` (`confidence: 0.35`), `mergeBenchmarks` returns a strictly higher `score` for A than for B.
8. **OT8** — Q5 (proposal success criterion): given two models A and B with identical raw benchmark scores and identical `direct` evidence, but A's observation is dated within 1 month of `snapshotDate` and B's is 18 months prior, A's merged score is strictly higher than B's.
9. **OT9** — `mergeBenchmarks` returns `confidence: 'high'` only when at least one observation graded `direct` with `recency.weight ≥ 0.8` contributed; `confidence: 'low'` when no observation graded above `interpolated` and / or every contribution's combined weight `< 0.3`; `'medium'` otherwise.
10. **OT10** — `mergeBenchmarks({ observations: [], … })` returns `{ score: 0, confidence: 'low', contributions: [] }` without throwing.
11. **OT11** — `pnpm --filter @harness-engineering/local-models build`, `typecheck`, `lint`, and `test` are all green; Phase 0 / 1 / 2a / 2b tests pass unchanged (no regression in barrel exports).

## Skill Recommendations

- `gof-strategy` (reference) — each source adapter is a Strategy implementation behind the shared `BenchmarkSource` interface; new sources plug in without touching `merge.ts`.
- `tdd-classicist` (reference) — every module is pure; tests are table-driven with no I/O seam (fetcher injected, dates injected). Numeric assertions are ranges, not golden constants.
- `ts-type-guards` (reference) — `evidence.ts` guards the public API against unknown evidence grades; the parser inside `openLlmLeaderboardSource` runtime-validates the upstream JSON shape before mapping it into `BenchmarkObservation`.

## File Map

- CREATE `packages/local-models/src/ranker/evidence.ts`
- CREATE `packages/local-models/src/ranker/recency.ts`
- CREATE `packages/local-models/src/ranker/benchmarks/sources.ts`
- CREATE `packages/local-models/src/ranker/benchmarks/merge.ts`
- MODIFY `packages/local-models/src/ranker/benchmarks/index.ts` (re-export `sources` + `merge`)
- MODIFY `packages/local-models/src/ranker/index.ts` (re-export `evidence` + `recency`)
- CREATE `packages/local-models/tests/ranker/evidence.test.ts`
- CREATE `packages/local-models/tests/ranker/recency.test.ts`
- CREATE `packages/local-models/tests/ranker/benchmarks/sources.test.ts`
- CREATE `packages/local-models/tests/ranker/benchmarks/merge.test.ts`
- CREATE `.changeset/lmlm-phase2c-evidence-recency-merge.md`
- MODIFY `packages/local-models/README.md` — single-paragraph Phase 2c note

## Skeleton

1. `evidence.ts` — grading + confidence table; pure. (~1 task)
2. `recency.ts` — age + lineage demotion; pure. (~1 task)
3. `benchmarks/sources.ts` — `BenchmarkSource` interface + two seed adapters with injected fetcher. (~1 task)
4. `benchmarks/merge.ts` — fold evidence × recency × source weight into a single `MergedScore`. (~1 task)
5. Tests — one file per module, table-driven, numeric ranges. (~1 task)
6. Barrel + README + changeset. (~1 task)
7. Verification gate. (~1 task)

**Estimated total:** 7 tasks, ~3.5 hours.

## Uncertainties

- **[ASSUMPTION]** Evidence confidence multipliers (`direct = 1.0`, `variant = 0.85`, `base = 0.7`, `interpolated = 0.5`, `self-reported = 0.35`) are picked to satisfy Q4 (`direct > self-reported` at equal raw score) with room for recency to also shift ordering. Exact constants land in this phase; Phase 2d's parity fixtures will catch drift if any value needs retuning.
- **[ASSUMPTION]** Recency follows a single exponential decay (`weight = exp(-ageMonths / HALFLIFE_MONTHS)`, `HALFLIFE_MONTHS = 9`) with a floor `MIN_RECENCY_WEIGHT = 0.05` and a per-generation lineage step `LINEAPE_STEP_PENALTY = 0.6`. Tuning surfaces the same way as the evidence table — Phase 2d parity fixtures pin the constants.
- **[ASSUMPTION]** The Open LLM Leaderboard JSON shape is stable enough that a single tolerant parser handles it; failures degrade silently to warnings, never throws. We do not call the live endpoint in CI — adapter tests inject a mock fetcher.
- **[ASSUMPTION]** HF popularity is mapped to a synthetic `'hf-popularity'` benchmark on a 0–100 scale derived from `(downloads + likes × LIKE_WEIGHT)` normalised against the per-fetch maximum. The exact LIKE_WEIGHT (`= 50`) and normalisation are tunable constants in one place.
- **[DEFERRABLE]** Per-source weights in `mergeBenchmarks` default to `{ 'open-llm-leaderboard': 1.0, 'hf-popularity': 0.25 }`. Operators / Phase 2d can override via the optional `sourceWeights` parameter. We do not surface this through `harness.config.json` yet — the spec's config block lands in Phase 6 with the scheduler.
- **[DEFERRABLE]** Additional sources (LiveBench, Arena ELO, Aider) are listed in the spec for v1.1; the `BenchmarkSource` interface lands here so v1.1 is a pure addition, no migration.

## Tasks

### Task 1: Land `ranker/evidence.ts`

**Depends on:** none | **Files:** `packages/local-models/src/ranker/evidence.ts`

1. Create `packages/local-models/src/ranker/evidence.ts` with:
   - Imports: `import type { BenchmarkEvidence } from './benchmarks/types.js';`
   - `export const EVIDENCE_CONFIDENCE: Readonly<Record<BenchmarkEvidence, number>>` = `{ 'direct': 1.0, 'variant': 0.85, 'base': 0.7, 'interpolated': 0.5, 'self-reported': 0.35 }`.
   - `export interface EvidenceGrade { grade: BenchmarkEvidence; confidence: number; }`
   - `export interface EvidenceInput { observationModel: string; observationQuant?: string; observationEvidence?: BenchmarkEvidence; targetModel: string; targetQuant?: string; lineagePosition?: number; }`
   - `export function gradeEvidence(input: EvidenceInput): EvidenceGrade` that:
     - If `input.observationEvidence === 'self-reported'` return `{ grade: 'self-reported', confidence: EVIDENCE_CONFIDENCE['self-reported'] }` immediately (self-reported is an absorbing tag).
     - Normalize `observationModel` and `targetModel`: lowercase, strip trailing `-GGUF` / `-MLX` / `-AWQ` / `-GPTQ` suffixes; compute a `baseModel` form (strips trailing `-Instruct`, `-Chat`, parameter-size suffixes like `-32B`, `-7B`).
     - If `normalized observation === normalized target` and quants match (case-insensitive, using `normalizeQuantId` aliasing): `direct`.
     - If `normalized observation === normalized target` and quants differ but both resolve to a known canonical quant: `variant`.
     - If `baseModel(observation) === baseModel(target)` (same family, same param size, different fine-tune/quant): `base`.
     - If `input.lineagePosition !== undefined && input.lineagePosition >= 0`: `interpolated`.
     - Otherwise: `interpolated` with the same confidence (the lineage hint just refines the rationale for the caller).
   - Re-use `normalizeQuantId` from `./quants.js` for quant comparison.
2. Run: `pnpm --filter @harness-engineering/local-models typecheck` — verify clean.
3. Commit: `feat(local-models): add evidence grading module (Phase 2c)`

Acceptance: typecheck clean; module is not yet re-exported (Task 6 wires the barrel).

### Task 2: Land `ranker/recency.ts`

**Depends on:** none | **Files:** `packages/local-models/src/ranker/recency.ts`

1. Create `packages/local-models/src/ranker/recency.ts` with:
   - `export const HALFLIFE_MONTHS = 9` — exponential decay constant.
   - `export const MIN_RECENCY_WEIGHT = 0.05` — floor preventing total annihilation.
   - `export const LINEAGE_STEP_PENALTY = 0.6` — multiplier per generation behind the target lineage.
   - `export interface RecencyInput { observedAt: string; snapshotDate: string; lineagePosition?: number; }`
   - `export interface RecencyDecay { ageMonths: number; weight: number; lineagePenaltyApplied: number; }`
   - `export function applyRecencyDecay(input: RecencyInput): RecencyDecay` that:
     - Parses `observedAt` and `snapshotDate` as ISO dates; computes `ageMonths = (snapshot - observed) / MS_PER_MONTH`. Negative ages (observation newer than snapshot) clamp to `0`.
     - Computes `baseWeight = Math.exp(-ageMonths / HALFLIFE_MONTHS)`.
     - If `lineagePosition !== undefined && lineagePosition > 0`: `lineagePenalty = LINEAGE_STEP_PENALTY ** lineagePosition`; else `lineagePenalty = 1`.
     - Returns `{ ageMonths, weight: Math.max(MIN_RECENCY_WEIGHT, baseWeight * lineagePenalty), lineagePenaltyApplied: lineagePenalty }`.
   - `MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30` — local constant; documented as "calendar approximation; calibration constants land here so a future shift to days-based math is a one-line change."
2. Run: `pnpm --filter @harness-engineering/local-models typecheck` — verify clean.
3. Commit: `feat(local-models): add lineage-aware recency demotion (Phase 2c)`

Acceptance: typecheck clean.

### Task 3: Land `ranker/benchmarks/sources.ts`

**Depends on:** Task 1 (for type imports), Task 2 (none direct, but conceptually grouped) | **Files:** `packages/local-models/src/ranker/benchmarks/sources.ts`

1. Create `packages/local-models/src/ranker/benchmarks/sources.ts` with:
   - Imports: `BenchmarkObservation`, `BenchmarkEvidence` from `./types.js`.
   - `export type SourceWarningCode = 'fetch_failed' | 'parse_failed' | 'schema_invalid';`
   - `export interface SourceWarning { code: SourceWarningCode; message: string; cause?: string; }`
   - `export interface BenchmarkSourceResult { source: string; observations: BenchmarkObservation[]; warnings: SourceWarning[]; fetchedAt: string; }`
   - `export type Fetcher = (input: { url: string; init?: RequestInit }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;`
   - `export interface BenchmarkSource { id: string; fetch(input: { now?: () => Date; fetcher: Fetcher }): Promise<BenchmarkSourceResult>; }`
   - **`export const openLlmLeaderboardSource: BenchmarkSource`** with `id: 'open-llm-leaderboard'`. Its `fetch` implementation:
     - Resolves `url = 'https://huggingface.co/api/datasets/open-llm-leaderboard/contents/v2/leaderboard.json'` (documented constant, not yet hit live; CI tests inject a fetcher).
     - Wraps the fetch in try/catch. On network / non-ok HTTP, returns an empty observations array and `[{ code: 'fetch_failed', message, cause? }]`.
     - Validates the JSON shape with a small runtime guard (`Array.isArray(data?.models)`, each entry has `model: string` and `scores: Record<string, number>`); failures produce `code: 'parse_failed' | 'schema_invalid'` warnings, never throws.
     - Maps each valid `(model, benchmark, value)` triple to `BenchmarkObservation { source: 'open-llm-leaderboard', benchmark, value, evidence: 'direct', observedAt: <fetchedAt> }`.
   - **`export const huggingFacePopularitySource: BenchmarkSource`** with `id: 'hf-popularity'`. Its `fetch`:
     - Hits `https://huggingface.co/api/models?filter=text-generation&sort=downloads&limit=100` through the injected fetcher.
     - On success, computes `score = (downloads + likes * LIKE_WEIGHT)` per model; then normalises against the maximum so `value ∈ [0, 100]`.
     - Emits `BenchmarkObservation { source: 'hf-popularity', benchmark: 'hf-popularity', value, evidence: 'interpolated', observedAt: <fetchedAt> }` per model.
     - Same try/catch / structured-warning discipline as the leaderboard adapter.
   - Local constant `LIKE_WEIGHT = 50` documented as "one like ≈ 50 downloads of intent signal".
2. Run: `pnpm --filter @harness-engineering/local-models typecheck` — verify clean.
3. Commit: `feat(local-models): add benchmark source adapters (Phase 2c)`

Acceptance: typecheck clean; both adapters defined; no live network calls in the implementation (fetcher always injected).

### Task 4: Land `ranker/benchmarks/merge.ts`

**Depends on:** Task 1, Task 2, Task 3 | **Files:** `packages/local-models/src/ranker/benchmarks/merge.ts`

1. Create `packages/local-models/src/ranker/benchmarks/merge.ts` with:
   - Imports: `BenchmarkObservation`, `BenchmarkEvidence` from `./types.js`; `gradeEvidence`, `EvidenceInput` from `../evidence.js`; `applyRecencyDecay` from `../recency.js`.
   - `export const DEFAULT_SOURCE_WEIGHTS: Readonly<Record<string, number>>` = `{ 'open-llm-leaderboard': 1.0, 'hf-popularity': 0.25 }`. Documented: "popularity is a proxy for community trust; weighted to one-quarter of a graded leaderboard."
   - `export interface MergeTarget { model: string; quant?: string; }`
   - `export interface MergeInput { observations: readonly BenchmarkObservation[]; target: MergeTarget; snapshotDate: string; sourceWeights?: Readonly<Record<string, number>>; }`
   - `export interface ScoredObservation { observation: BenchmarkObservation; evidenceConfidence: number; recencyWeight: number; sourceWeight: number; combinedWeight: number; normalisedValue: number; weightedValue: number; }`
   - `export interface MergedScore { score: number; confidence: 'high' | 'medium' | 'low'; contributions: ScoredObservation[]; }`
   - `export function mergeBenchmarks(input: MergeInput): MergedScore` that:
     - Short-circuits to `{ score: 0, confidence: 'low', contributions: [] }` when `observations.length === 0`.
     - For each observation:
       - `evidence = gradeEvidence({ observationModel: <fromObservation.benchmark or target.model>, observationQuant: undefined, observationEvidence: observation.evidence, targetModel: target.model, targetQuant: target.quant })`. (The `observation` object only carries `evidence` and a benchmark slug — the per-source adapter is responsible for matching model strings; the merge defers to `observation.evidence`.)
       - `recency = applyRecencyDecay({ observedAt: observation.observedAt, snapshotDate: input.snapshotDate })`.
       - `sourceWeight = (input.sourceWeights ?? DEFAULT_SOURCE_WEIGHTS)[observation.source] ?? 0.5`.
       - `normalisedValue = normalise(observation.value, observation.source)` — `0..100 → 0..1` for `'open-llm-leaderboard'`; identity for already-normalised `'hf-popularity'`; default `clamp(value, 0, 100) / 100` for unknown sources.
       - `combinedWeight = evidence.confidence * recency.weight * sourceWeight`.
       - `weightedValue = normalisedValue * combinedWeight`.
     - `score = (Σ weightedValue / Σ combinedWeight) * 100` — weighted mean on the 0–100 scale; returns `0` when `Σ combinedWeight === 0`.
     - `confidence`:
       - `'high'` if at least one contribution has `evidence.grade === 'direct' && recency.weight >= 0.8`.
       - `'low'` if no contribution has `evidence.grade` better than `'interpolated'` **or** every contribution's `combinedWeight < 0.3`.
       - `'medium'` otherwise.
2. Run: `pnpm --filter @harness-engineering/local-models typecheck` — verify clean.
3. Commit: `feat(local-models): add cross-source benchmark merge (Phase 2c)`

Acceptance: typecheck clean; merge composes evidence + recency + source weight; deterministic numeric output for the same input.

### Task 5: Tests for evidence / recency / sources / merge

**Depends on:** Tasks 1–4 | **Files:** `packages/local-models/tests/ranker/evidence.test.ts`, `tests/ranker/recency.test.ts`, `tests/ranker/benchmarks/sources.test.ts`, `tests/ranker/benchmarks/merge.test.ts`

1. **`tests/ranker/evidence.test.ts`** — table-driven cases proving OT1 + OT2:
   - `direct` for identical `(model, quant)`.
   - `variant` for same model id, different valid quant.
   - `base` after stripping `-GGUF` / `-Instruct` / `-32B` suffixes.
   - `interpolated` when `lineagePosition` is set but no model match.
   - `self-reported` when `observationEvidence: 'self-reported'`, regardless of model match.
   - `confidence` values come from `EVIDENCE_CONFIDENCE` (no golden constants in assertions; use the exported table).

2. **`tests/ranker/recency.test.ts`** — table-driven cases proving OT3 + OT4:
   - Zero age → `weight === 1.0` (within `1e-9`).
   - 12-month age → `weight <= 0.7 && weight >= 0.3` (the spec band).
   - 24-month age → `weight <= 0.4`.
   - `lineagePosition: 1` produces a strictly lower weight than `lineagePosition: 0` at the same `observedAt`.
   - Very old observation with `lineagePosition: 5` clamps at `MIN_RECENCY_WEIGHT`.
   - Future-dated observation (`observedAt > snapshotDate`) returns `weight === 1.0` (treated as zero age).

3. **`tests/ranker/benchmarks/sources.test.ts`** — proving OT5 + OT6:
   - `openLlmLeaderboardSource.fetch` with a mocked fetcher that returns the documented JSON shape → `observations.length > 0`, every observation has `source: 'open-llm-leaderboard'`.
   - Same source with a fetcher that returns `{ ok: false, status: 503 }` → `observations.length === 0`, `warnings[0].code === 'fetch_failed'`.
   - Same source with a fetcher whose `json()` rejects → `warnings[0].code === 'parse_failed'`.
   - Same source with a fetcher returning a wrong-shape payload (`{ "junk": true }`) → `warnings[0].code === 'schema_invalid'`.
   - `huggingFacePopularitySource.fetch` with a mocked fetcher returning a synthetic HF list → values are monotonically increasing with `downloads + likes * LIKE_WEIGHT`.

4. **`tests/ranker/benchmarks/merge.test.ts`** — proving OT7 + OT8 + OT9 + OT10:
   - Empty observations → `{ score: 0, confidence: 'low', contributions: [] }`.
   - OT7 (Q4 from spec): two single-observation inputs with the same raw `value: 80` — A's evidence is `'direct'`, B's is `'self-reported'` — `mergeA.score > mergeB.score`.
   - OT8 (Q5 from spec): same raw value, both `'direct'`, but A's `observedAt` equals `snapshotDate` and B's is 18 months prior — `mergeA.score > mergeB.score`.
   - OT9: one observation with `'direct'` evidence, fresh — `confidence === 'high'`. Two observations both `'interpolated'`, fresh — `confidence === 'medium'`. Two observations `'self-reported'` and 18 months stale — `confidence === 'low'`.
   - Custom `sourceWeights` override default and shifts the contribution ordering accordingly.

5. Run: `pnpm --filter @harness-engineering/local-models test` — verify all green.
6. Commit: `test(local-models): cover evidence, recency, sources, merge (Phase 2c)`

Acceptance: all four test files green; Phase 0 / 1 / 2a / 2b tests still pass.

### Task 6: Barrel updates + README + changeset

**Depends on:** Task 5 | **Files:** `packages/local-models/src/ranker/index.ts`, `packages/local-models/src/ranker/benchmarks/index.ts`, `packages/local-models/README.md`, `.changeset/lmlm-phase2c-evidence-recency-merge.md`

1. Edit `packages/local-models/src/ranker/index.ts` to add:
   - `export * from './evidence.js';`
   - `export * from './recency.js';`
2. Edit `packages/local-models/src/ranker/benchmarks/index.ts` to add:
   - `export { openLlmLeaderboardSource, huggingFacePopularitySource } from './sources.js';`
   - `export type { BenchmarkSource, BenchmarkSourceResult, SourceWarning, SourceWarningCode, Fetcher } from './sources.js';`
   - `export { mergeBenchmarks, DEFAULT_SOURCE_WEIGHTS } from './merge.js';`
   - `export type { MergeInput, MergeTarget, MergedScore, ScoredObservation } from './merge.js';`
3. Edit `packages/local-models/README.md` to add a single paragraph under the existing phase notes:
   - "Phase 2c adds the evidence grader, lineage-aware recency demotion, two seed benchmark source adapters (`open-llm-leaderboard`, `hf-popularity`) behind the `BenchmarkSource` interface, and the cross-source merge that emits a single `{ score, confidence, contributions }` per model. Phase 2d composes this with the Phase 2b VRAM/speed math into the `RankedModel` orchestrator."
4. Create `.changeset/lmlm-phase2c-evidence-recency-merge.md`:

   ```markdown
   ---
   '@harness-engineering/local-models': minor
   ---

   Adds Phase 2c of the Local Model Lifecycle Manager — the evidence grader, the lineage-aware recency demotion, two seed benchmark source adapters, and the cross-source merge the ranker (Phase 2d) will compose with Phase 2b's VRAM/speed math.

   - `gradeEvidence({ observationModel, observationQuant, targetModel, targetQuant, lineagePosition?, observationEvidence? })` returns one of `'direct' | 'variant' | 'base' | 'interpolated' | 'self-reported'` with its calibrated confidence multiplier. Self-reported observations are absorbed (no upgrade); GGUF / MLX / AWQ / GPTQ suffixes are stripped before model comparison so `Qwen/Qwen3-32B-GGUF` and `Qwen/Qwen3-32B` collapse to one identity.
   - `applyRecencyDecay({ observedAt, snapshotDate, lineagePosition? })` ages observations on an exponential curve (`halflife = 9 months`) with a per-generation lineage penalty (`× 0.6` per step behind the target lineage). Weights clamp at `MIN_RECENCY_WEIGHT = 0.05` so no observation is fully zeroed out — Phase 2d's parity tests want a deterministic floor.
   - `openLlmLeaderboardSource` and `huggingFacePopularitySource` implement the new `BenchmarkSource` interface. Both take a `Fetcher` so CI mocks the wire and the live network is not touched during tests. Every failure path (network, schema, parse) surfaces a structured `SourceWarning` rather than throwing — same discipline as Phase 2a's frozen snapshot loader.
   - `mergeBenchmarks({ observations, target, snapshotDate, sourceWeights? })` weights each observation by `evidenceConfidence × recencyWeight × sourceWeight`, normalises source-native scales into `0..1`, and emits `{ score (0–100), confidence ('high' | 'medium' | 'low'), contributions[] }`. Confidence is `'high'` only when a fresh `direct` observation participated; `'low'` when no graded contribution survived recency.

   No orchestrator, CLI, dashboard, or HTTP wiring yet. Phase 2d (the `RankedModel` orchestrator and the parity fixtures against the whichllm reference outputs) composes Phase 2c's merge output with Phase 2b's VRAM/speed math. LMLM remains opt-in and disabled by default per Phase 0.
   ```

5. Run: `pnpm --filter @harness-engineering/local-models build && pnpm --filter @harness-engineering/local-models typecheck && pnpm --filter @harness-engineering/local-models lint && pnpm --filter @harness-engineering/local-models test` — verify all green.
6. Commit: `chore(local-models): wire Phase 2c barrels, README, changeset`

Acceptance: barrels expose every new symbol; README mentions Phase 2c; changeset describes the slice; build / typecheck / lint / test all green.

### Task 7: Verification gate

**Depends on:** Task 6 | **Files:** none modified | **Category:** integration

1. Run `pnpm --filter @harness-engineering/local-models build` — confirm green.
2. Run `pnpm --filter @harness-engineering/local-models typecheck` — confirm green.
3. Run `pnpm --filter @harness-engineering/local-models lint` — confirm green.
4. Run `pnpm --filter @harness-engineering/local-models test` — confirm every test (Phase 0/1/2a/2b/2c) green.
5. Run `pnpm typecheck` at the repo root — confirm no consumer (CLI, orchestrator) breaks via the public barrel.
6. Run any project-wide hooks via a `git status` check; confirm no unexpected drift.

Acceptance: every check green; ready to commit on the topic branch and open a PR.

## Sequence

- Task 1, Task 2, Task 3 — independent in source terms; sequential by file boundary discipline (single-file commits).
- Task 4 depends on Tasks 1, 2, 3.
- Task 5 depends on Tasks 1–4.
- Task 6 depends on Task 5.
- Task 7 depends on Task 6.

Total: 7 tasks, ~3.5 hours.

## Harness Integration

- **`harness validate`** — repository-wide validation is implicit in the `pnpm typecheck` + `pnpm test` gates the PR will run; the per-task acceptance focuses on `pnpm --filter @harness-engineering/local-models …` because the package is hermetic at this phase (no consumers yet — Phase 4 wires the `LocalModelResolver`).
- **Plan location** — `docs/changes/local-model-lifecycle-manager/plans/2026-05-29-phase2c-evidence-recency-merge-plan.md` (sibling to the approved proposal).
- **Integration tier** — `small`. Phase 2c is purely new files inside an already-published package barrel; no AGENTS.md, ADR, or roadmap entry required at this phase (those land with the orchestrator + dashboard wiring in Phases 6–9 per the spec).
- **Handoff** — once executed, the next slice is Phase 2d (algorithm.ts + parity fixtures) per the spec's Phase 2 breakdown.
