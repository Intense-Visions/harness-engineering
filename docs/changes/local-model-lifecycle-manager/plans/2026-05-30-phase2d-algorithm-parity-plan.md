# Plan: LMLM Phase 2d — `RankedModel` algorithm + parity fixtures

**Date:** 2026-05-30 | **Spec:** `docs/changes/local-model-lifecycle-manager/proposal.md` (Phase 2, lines 414–429; success criteria F3, Q1, Q2, Q3, Q4, Q5, S4) | **Tasks:** 6 | **Time:** ~3 hours | **Integration Tier:** small | **Session:** `changes--local-model-lifecycle-manager--phase2d`

## Goal

Ship the `RankedModel` orchestrator (`ranker/algorithm.ts`) that composes Phase 2b's `estimateVram` + `estimateSpeed` math with Phase 2c's `gradeEvidence` + `applyRecencyDecay` + `mergeBenchmarks` fusion into a single hardware-aware ranking. With Phase 2d in place, the package finally answers the question the spec opens with — _"on this hardware, which models should the operator install?"_ — and exposes the result through the same `RankedModel[]` shape the proposal engine (Phase 5b), the HTTP routes (Phase 7), and the dashboard panel (Phase 8) will consume directly.

Phase 2d also lands the two parity fixtures the spec calls out by name — `m3-max-36gb.json` and `rtx-4090-24gb.json` — that pin the algorithm against the whichllm reference outputs (Q1, Q2). The fixtures are committed to the repo and replayed in CI; CI never invokes the upstream whichllm process. Refreshing the fixtures is a manual maintenance task tied to each v1.x release.

Phase 2d explicitly **does not** ship the `PoolManager` orchestrator (Phase 3c), the `LocalModelResolver` integration (Phase 4), CLI subcommands (Phase 7), the background scheduler (Phase 6), the proposal engine (Phase 5b), the HTTP routes (Phase 7), or the dashboard panel (Phase 8). Every Phase 2d module is opt-in; nothing in this slice changes orchestrator behavior on a config without a `localModels` block (N4).

## Phase 2d Scope (from spec Phase 2, lines 414–429)

In:

- `src/ranker/types.ts` — public type surface for the orchestrator: `RankedModel` (matches the spec's Core types block, lines 124–138, plus the per-candidate breakdown the dashboard's "why this score?" tooltip will render), `RankerCandidate` (the per-model input the algorithm consumes), `RankInput` (full call envelope: candidates + hardware + snapshot + optional live observations + ranking options), `LiveObservation` (`BenchmarkObservation & { hfRepoId }` so the orchestrator can pair source-adapter output with a candidate), `RankerWarningCode` + `RankerWarning` (degraded-path envelope mirroring the `BenchmarkSnapshotWarning` / `SourceWarning` shapes).
- `src/ranker/algorithm.ts` — `rankModels(input: RankInput): RankResult` orchestrator. For each candidate:
  1. Run `estimateVram` against the candidate's `(sizeB, activeB?, quant, contextTokens, kvCacheQuant)`.
  2. Run `estimateSpeed` against `(sizeB, activeB?, quant, hardware, vramEstimate, backend?)`.
  3. Collect every `BenchmarkObservation` from the snapshot's per-model row plus any caller-supplied `liveObservations` matching the same `hfRepoId` (model anchor stripped before handing to `mergeBenchmarks`, which keys off contribution-side fields).
  4. Run `mergeBenchmarks({ observations, target: { model: hfRepoId, quant }, snapshotDate })`.
  5. Compose the per-candidate `RankedModel`: `fitsHardware = vramEstimate.totalGb ≤ hardware.vramGb`; `score = scaleScore({ mergedScore, fitsHardware, speedConfidence, benchmarkConfidence })`; `evidence = weakestEvidence(contributions)`.
  6. Sort by `score` desc; tie-break on `speedEstimate.tokPerSec` desc, then `hfRepoId` code-point asc (not `localeCompare` — locale collation flips between environments and would silently corrupt the parity fixtures).
- `src/ranker/index.ts` — extend the barrel to re-export the algorithm + types.
- `tests/ranker/algorithm.test.ts` — unit coverage for the orchestrator (composition, won't-fit handling, evidence rollup, empty-input short-circuit, tie-break ordering, weakest-evidence rule, scaleScore monotonicity, live-observation pairing, limit truncation).
- `tests/ranker/parity/m3-max-36gb.json` + `rtx-4090-24gb.json` — frozen reference outputs for the two hardware fixtures called out in Q1 / Q2. Each file documents the snapshot date, the candidate list, the hardware profile, and the expected top-1 result (`hfRepoId`, `scoreMin`, `scoreMax`). Snapshot used for parity is the bundled Phase 2a / 2c seed snapshot so CI is hermetic.
- `tests/ranker/parity/algorithm-parity.test.ts` — table-driven test that replays each parity fixture through `rankModels` and asserts the top-1 model id matches.
- `.changeset/lmlm-phase2d-algorithm-parity.md` — minor bump.
- README — single-paragraph Phase 2d status note + updated "Subsequent phases" sentence.

Out of Phase 2d (deferred to later phases):

- `pool/manager.ts` — the `PoolManager` orchestrator. Phase 3c.
- `LocalModelResolver` integration. Phase 4.
- CLI subcommands `harness models suggest`. Phase 7.
- HTTP routes `/api/v1/local-models/recommendations`. Phase 7.
- Dashboard "Recommendations" card. Phase 8.
- Background scheduler. Phase 6.
- Proposal engine. Phase 5b.
- Additional benchmark sources (LiveBench, AA, Aider, Arena ELO). v1.1.

## Integration Points (Phase 2d slice)

This phase is internal to `@harness-engineering/local-models`; the broader integration surface (CLI, HTTP, WS, dashboard, `LocalModelResolver` consumer, ADRs, doc updates) belongs to later phases per the spec's Integration Points section (proposal.md lines 268–337). The slice touches:

- **Entry points (new):** the `rankModels` orchestrator + `RankedModel` type become public exports from `@harness-engineering/local-models`. Phase 5b's proposal engine and Phase 7's HTTP route are the first downstream consumers; both already plan to import from this barrel.
- **Entry points (touched):** none outside the package. `src/index.ts` already re-exports `./ranker/index.js`, so the new ranker barrel exports propagate without an extra wire.
- **Registrations required:** none. Phase 0's barrel-generator and the workspace registration are already in place. No new dependency, no new build target, no new lint config.
- **Documentation updates:** README within the package only. AGENTS.md / `docs/knowledge/orchestrator/local-model-lifecycle.md` / the operator guide land in Phase 9 alongside the rest of the surface.
- **ADRs:** none new for this slice. The architecture decisions covering ranker design are already captured in proposal.md (D3, D7, D8) and the planned Phase 9 ADRs.
- **Knowledge graph:** the `business_concept: RankedModel` entry will be materialised in Phase 9; this slice deliberately stops at the type and the algorithm so the knowledge entry can be added once the dashboard and CLI surface the type to operators.

## Observable Truths (Acceptance Criteria — Phase 2d only)

1. **OT1** — Composition: a fits-hardware candidate with one fresh `direct` observation yields a `RankedModel` with `fitsHardware: true`, `score ∈ (0, 100]`, `evidence: 'direct'`, `vramEstimate.totalGb` matching `estimateVram`, `speedEstimate.tokPerSec` matching `estimateSpeed`.
2. **OT2** — Won't-fit candidates are filtered out of the default result; `options.includeUnfit: true` keeps them with `score: 0`, `estimatedTokPerSec: 0`.
3. **OT3** — Q3: every default-result row has `fitsHardware: true` and `estimatedVramGb ≤ hardware.vramGb`.
4. **OT4** — Q4: direct evidence outranks self-reported at the same raw value. Weakest-evidence roll-up flags a row with one self-reported contribution alongside a direct one.
5. **OT5** — Q5: fresh observations outrank 18-month-old ones at the same raw value.
6. **OT6** — Empty candidates short-circuit to `{ ranked: [], warnings: [] }`. Single candidate with no contributions returns `evidence: 'interpolated'`, `score: 0`, `confidence: 'low'`, one `snapshot_unavailable` warning.
7. **OT7** — Tie-break is deterministic across runs and locales (score → `tokPerSec` → `hfRepoId` code-point asc).
8. **OT8** — S4: empty-snapshot path produces one `snapshot_unavailable` warning per call, not per candidate.
9. **OT9** — Q1: replaying `m3-max-36gb.json` through `rankModels` yields the documented top-1 id within the documented `[scoreMin, scoreMax]` band.
10. **OT10** — Q2: same as OT9 but against `rtx-4090-24gb.json`.
11. **OT11** — `pnpm --filter @harness-engineering/local-models build`, `typecheck`, `lint`, and `test` green; Phases 0–3b tests pass unchanged.

## File Map

- CREATE `packages/local-models/src/ranker/types.ts`
- CREATE `packages/local-models/src/ranker/algorithm.ts`
- MODIFY `packages/local-models/src/ranker/index.ts` (re-export `algorithm` + `types`)
- CREATE `packages/local-models/tests/ranker/algorithm.test.ts`
- CREATE `packages/local-models/tests/ranker/parity/m3-max-36gb.json`
- CREATE `packages/local-models/tests/ranker/parity/rtx-4090-24gb.json`
- CREATE `packages/local-models/tests/ranker/parity/algorithm-parity.test.ts`
- CREATE `.changeset/lmlm-phase2d-algorithm-parity.md`
- MODIFY `packages/local-models/README.md` (single-paragraph Phase 2d note + status bump)

## Uncertainties

- **[ASSUMPTION]** `scaleScore` is multiplicative across three multipliers (`fitsHardware ? 1 : 0`, speed-confidence band, benchmark-confidence band). Adding the benchmark-confidence multiplier is what makes Q4 / Q5 hold at the `RankedModel.score` boundary: the merge's weighted-mean math collapses to the same raw score for a single direct vs self-reported observation, so the merge's confidence label has to feed the orchestrator score directly. If parity-fixture tuning shows the multiplicative form loses to a weighted-sum form, we tune here and re-pin the parity files.
- **[ASSUMPTION]** "Weakest evidence" (not best) is the right roll-up for the `evidence` field. The alternative would let a single direct observation rescue a row whose other contributors are self-reported, which contradicts how operators read the field. We surface the per-contribution breakdown via `benchmarkScore.contributions` for the optimistic detail.
- **[ASSUMPTION]** Parity fixtures pin the top-1 id + a 5-point score band (`[55, 60]`). The band is wide enough to tolerate Phase 2b / 2c calibration tuning but narrow enough to catch a regression that swaps the top model entirely.
- **[DEFERRABLE]** Profile-aware ranking (`profile?: 'general' | 'coding' | 'reasoning'`). The orchestrator threads the option through unused in v1; Phase 5b can add per-profile weight tables later.
- **[DEFERRABLE]** Lineage-aware recency demotion plumbing. The snapshot does not carry lineage metadata yet; `applyRecencyDecay({ lineagePosition })` is called with the default `0` for now. The next snapshot refresh adds the field.

## Tasks

### Task 1 — `ranker/types.ts`

Define `RankedModel`, `RankerCandidate`, `RankInput`, `RankOptions`, `RankResult`, `RankerWarning`, `RankerWarningCode`, `LiveObservation`. Acceptance: typecheck clean.

### Task 2 — `ranker/algorithm.ts`

`rankModels` orchestrator (composition, filtering, sorting, scoring). Exported helpers: `weakestEvidence`, `scaleScore`, `SPEED_CONFIDENCE_MULTIPLIER`, `BENCHMARK_CONFIDENCE_MULTIPLIER`. Acceptance: typecheck clean; OT1–OT8 from `algorithm.test.ts`.

### Task 3 — Re-export from `ranker/index.ts`

Add `algorithm` + `types` barrels. Acceptance: typecheck clean.

### Task 4 — `tests/ranker/algorithm.test.ts`

Unit coverage for OT1–OT8 plus `weakestEvidence` + `scaleScore` helpers. Acceptance: vitest run green.

### Task 5 — Parity fixtures + parity test

`m3-max-36gb.json` + `rtx-4090-24gb.json` + `algorithm-parity.test.ts`. Acceptance: vitest run green; the parity assertions document themselves clearly enough that a refresh-by-hand later is a one-file diff.

### Task 6 — Barrel re-export, README, changeset, verification

README single-paragraph Phase 2d note + Status bump; changeset mirroring the Phase 3b precedent; verification gate (`build`, `typecheck`, `test`, `lint`, `harness validate`). Acceptance: every command exits 0.
