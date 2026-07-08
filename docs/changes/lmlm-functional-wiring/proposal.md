---
title: LMLM Functional Wiring — Pool Bounds Seed + Live Candidate Source
status: planned
keywords:
  - local-models
  - lmlm
  - pool-bounds
  - configurePool
  - recommender
  - huggingface
  - ranker-candidate
  - gguf
  - frozen-snapshot
---

# LMLM Functional Wiring — Pool Bounds Seed + Live Candidate Source

## Overview & Goals

The Local Model Lifecycle Manager (LMLM) shipped its engine and operator surfaces
in #753 (Phases 4–9). When enabled (`localModels.enabled: true`), hardware
detection works and all four `/api/v1/local-models/*` routes return `200`. But
two dashboard cards render permanently empty because two primitives that already
exist in the codebase are **never called**:

1. **Pool card shows `0 / 0 GB`, "No models in the pool."** The pool state
   defaults to `diskBudgetGb: 0, allowedOrgs: []` (`packages/local-models/src/pool/types.ts:88`).
   `PoolManager.configurePool()` — which correctly updates and persists bounds
   (`packages/local-models/src/pool/manager.ts:585`) — has **zero callers**. The
   operator's configured `localModels.pool` bounds are never applied. With a
   `0` budget, no model ever fits, so both auto-install and manual pulls are
   effectively blocked.

2. **Recommendations card shows "No recommendations yet."** The recommender is
   constructed with an empty candidate set:
   `createNativeRecommender({ candidates: [] })` (`packages/orchestrator/src/orchestrator.ts:2120`).
   The seam's own header explains why: _"Phase 2's live-HF candidate parser
   (arbitrary HF model → `RankerCandidate` with `sizeB`/`quant` extracted from the
   GGUF manifest) was never built"_ (`packages/local-models/src/recommender/native.ts:5`).
   Zero candidates in → zero recommendations out, regardless of detected hardware.

**Goal:** close both gaps so the Pool and Recommendations cards become functional
using the primitives that already exist (`configurePool`, `HuggingFaceClient`,
`rankModels`, `loadFrozenSnapshot`). This is completion of the original LMLM
spec's deferred Phase 2 (candidate source, D8) and Phase 7 (pool bounds), not
net-new design.

**Non-goals (YAGNI):**

- The full `harness models pool set-budget/allow-org/allow-family` CLI group
  (proposal.md:250) — deferred; config-seed makes the bounds functional without it.
- Autonomous discovery of brand-new HF models beyond the allow-listed orgs.
- Release-coupled auto-refresh of the frozen fallback (see Decision D5).
- Dashboard mutation UX, notification sinks — these already consume pool/proposal
  state once it is populated.

**Grounding:** `STRATEGY.md` present; advances the local-inference-autonomy
thread (LMLM proposal D1/D3/D8). No contradiction with strategy.

## Decisions Made

| #      | Decision                                                                                                                                                                                                                                                                                                                                                     | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D1** | **Pool bounds are seeded from config at orchestrator startup**, by calling the existing `PoolManager.configurePool(config.localModels.pool)`. The `harness models pool` CLI subcommands are deferred.                                                                                                                                                        | Makes the already-written `localModels.pool` config functional with the smallest surface. Matches LMLM D1 ("operator pre-approves disk budget + allowed orgs"). The CLI group is a separable, larger effort not needed to make the cards work.                                                                                                                                                                                                         |
| **D2** | **Config wins over the persisted store on startup.** Each startup applies the config bounds after `store.load()`, overwriting persisted `diskBudgetGb`/`allowedOrgs`/`allowedFamilies`.                                                                                                                                                                      | Declarative, idempotent, least-surprising while bounds live only in config. Config is the single source of truth. (Revisit with a `source` marker if/when CLI runtime edits land.)                                                                                                                                                                                                                                                                     |
| **D3** | **Candidate source is hybrid (live HF + frozen fallback), built parser-first.** The keystone is a `HuggingFaceModel` (+ GGUF `siblings`) → `RankerCandidate` parser that extracts `sizeB`/`quant`. Live HF `listModels` filtered by `allowedOrgs` is the primary source; a bundled frozen candidate snapshot is the offline/rate-limited fallback (LMLM D8). | The parser is required for any source and is the real work; source-switching is a thin wrapper over it. Live matches D3/D8 freshness intent; frozen satisfies D8 graceful degradation.                                                                                                                                                                                                                                                                 |
| **D4** | **One spec, two phases.** Phase 1 = pool-bounds seed (D1/D2). Phase 2 = candidate parser + source (D3).                                                                                                                                                                                                                                                      | Phase 1 ships value immediately (pool becomes usable) and is a trivial wiring change; Phase 2 is the meatier parser. Shared LMLM context makes one spec cheaper than two.                                                                                                                                                                                                                                                                              |
| **D5** | **The frozen fallback is refreshed by an on-demand generation script, never by release-coupled CI auto-commit.** `scripts/refresh-model-candidates.mjs` regenerates it (fail-closed, sorted output) for a human to review and commit. An optional scheduled workflow that opens a PR is a deferred follow-up.                                                | The frozen candidates steer which models get recommended/installed — a data file that must stay reviewed and deterministic (mirrors the hand-seeded benchmark `snapshot.json`, `"source": "seed"`). Its freshness need tracks the HF ecosystem (~monthly), not our release cadence; coupling to releases invites non-deterministic builds and outage-at-release-time fragility. It is a fallback path, not the primary — over-automation is premature. |

## Technical Design

> The precise signatures / insertion points below are being confirmed against the
> code and will be finalized in the section-by-section review before
> implementation. File:line anchors are current as of this draft.

### Phase 1 — Pool bounds seed (Gap 1)

- **Where:** the orchestrator startup path that awaits `PoolStateStore.load()`
  (in `initLocalModelAndPipeline`, `packages/orchestrator/src/orchestrator.ts`).
  Immediately after `load()` resolves — and only when `this.modelPool` is
  non-null and `this.config.localModels?.pool` is defined — call
  `await this.modelPool.configurePool({ diskBudgetGb, allowedOrgs, allowedFamilies })`
  from the config block (D2: config wins because it runs _after_ load).
- **Guards:** no-op when `localModels` is disabled (`modelPool` null) or when
  `localModels.pool` is undefined, matching the existing disabled-path style.
- **No new types.** `ConfigurePoolRequest` already accepts exactly
  `{ diskBudgetGb?, allowedOrgs?, allowedFamilies? }`; `LocalModelsPoolConfig`
  provides all three.
- **Effect:** the Pool card renders the configured budget (`100 GB`) and the
  allow-list; auto-install and manual-pull fit checks operate against real bounds.

### Phase 2 — Candidate parser + source (Gap 2)

New module(s) in `packages/local-models/src/recommender/` (or a sibling
`candidates/` dir — finalized during review):

1. **GGUF → RankerCandidate parser.** Given a `HuggingFaceModel` /
   `HuggingFaceModelDetail`, produce zero-or-more `RankerCandidate`:
   - `hfRepoId` = model id.
   - `sizeB` = parameter count in billions, extracted from repo id / filename
     (e.g. `Qwen3-32B` → `32`), falling back to any HF metadata.
   - `quant` = extracted from each GGUF `siblings[].rfilename` (e.g.
     `...-Q4_K_M.gguf` → the string `normalizeQuantId` accepts), one candidate
     per recognized quant file.
   - `ollamaName` = mapped when a known mirror exists (best-effort).
   - Files that don't parse to a recognized quant are skipped (logged, not fatal).

2. **Candidate source.** A function that returns `RankerCandidate[]`:
   - **Live:** `HuggingFaceClient.listModels({ author: org })` for each
     `allowedOrgs` entry (respecting `allowedFamilies` when non-empty), then fetch
     model detail for `siblings`, then run the parser. Cached via the existing
     `huggingface/cache.ts` TTL layer (24h, matching refresh cadence).
   - **Frozen fallback (D8):** a bundled `candidates.json` loaded via the same
     `import ... with { type: 'json' }` static-inline pattern as the benchmark
     snapshot. Used when HF is unreachable/rate-limited; the recommender is
     already degradation-first (`native.ts`).

3. **Wiring.** Replace `createNativeRecommender({ candidates: [] })`
   (`orchestrator.ts:2120`) with the sourced candidate list. The on-demand
   recommendations route and the background refresh tick share the one
   recommender, so both light up from a single change.

4. **Frozen snapshot + refresh script (D5).**
   `scripts/refresh-model-candidates.mjs` runs the live source against the allow-list,
   writes a sorted `candidates.json`, and **fails closed** (never overwrites on HF
   error). Human reviews the diff and commits.

## Integration Points

- **Entry Points:** No new CLI command / MCP tool / route. Touches the
  orchestrator startup path (Phase 1) and the recommender candidate seam (Phase 2).
  New package-internal modules in `@harness-engineering/local-models`; a new
  `scripts/refresh-model-candidates.mjs`.
- **Registrations Required:** If new public symbols are exported from
  `packages/local-models/src/index.ts` (parser / candidate-source / frozen loader),
  regenerate the barrel if applicable. No skill/route/tier registration.
- **Documentation Updates:** Note in the LMLM proposal / any LMLM guide that Phase 2
  candidate sourcing and Phase 7 pool-bounds seed are now delivered. Document the
  `refresh-model-candidates` script (how/when to run it). Update reference docs only
  if a CLI command changes — none does here.
- **Architectural Decisions:** D2 (config-wins precedence) and D5 (no
  release-coupled snapshot refresh) are the two candidates for a short ADR — both
  encode a non-obvious policy future changes must respect. D1/D3/D4 are wiring
  choices that don't warrant standalone ADRs.
- **Knowledge Impact:** Reinforce the "Model Recommendation Lifecycle" business
  process node (hardware detect → HF fetch → parse → rank → propose). Add the
  fact that pool bounds are declarative-from-config (D2) and the frozen candidate
  fallback is human-curated (D5).

## Success Criteria

Observable, testable outcomes:

- **SC1** — With `localModels.enabled: true` and `localModels.pool.diskBudgetGb: 100`,
  after orchestrator start, `GET /api/v1/local-models/pool` returns
  `diskBudgetGb: 100` and the configured `allowedOrgs` (not `0` / `[]`).
- **SC2** — When config and a pre-existing persisted store disagree, the config
  value wins after restart (D2), verified by a test that loads a store with
  `diskBudgetGb: 5` and config `100`, then asserts `100`.
- **SC3** — Phase-1 seed is a no-op when `localModels` is disabled or
  `localModels.pool` is absent (no throw, `modelPool` stays null / bounds untouched).
- **SC4** — The GGUF parser turns a representative `HuggingFaceModelDetail`
  (e.g. `Qwen/Qwen3-32B-GGUF` with `Q4_K_M` + `Q8_0` siblings) into the expected
  `RankerCandidate[]` with correct `sizeB` and `normalizeQuantId`-valid `quant`;
  unrecognized files are skipped.
- **SC5** — With a non-empty candidate source,
  `GET /api/v1/local-models/recommendations?top=5` returns a non-empty ranked list
  for the detected hardware, each entry `fitsHardware`-consistent (mirrors LMLM F3).
- **SC6** — When the HF client throws / is unreachable, the candidate source falls
  back to the bundled frozen snapshot and recommendations are still non-empty
  (LMLM S4 degradation), surfaced as a warning, not a 503.
- **SC7** — `scripts/refresh-model-candidates.mjs` fails closed on HF error (exits
  non-zero, leaves `candidates.json` unchanged) and produces stable, sorted output
  on success (re-running with unchanged input yields no diff).
- **SC8** — `pnpm build`, typecheck, lint, and the local-models + orchestrator test
  suites pass; a changeset is present.

## Implementation Order

**Phase 1 — Pool bounds seed (small):**

1. Add the post-`load()` `configurePool` seed in the orchestrator startup path,
   guarded on enabled + `localModels.pool` present.
2. Tests: SC1, SC2, SC3 (config-wins, disabled no-op).

**Phase 2 — Candidate parser + source (medium):** 3. Build the GGUF→`RankerCandidate` parser with unit tests (SC4), reusing any
existing quant/size parsing prior art. 4. Build the candidate source (live HF via `listModels` + detail/`siblings`,
filtered by allow-list, cached) with the frozen-snapshot fallback. 5. Add the bundled `candidates.json` (curated seed) + `loadFrozenCandidates`
loader (static-inline pattern) + `scripts/refresh-model-candidates.mjs` (D5, SC7). 6. Wire the source into `createNativeRecommender` at `orchestrator.ts:2120`;
integration tests for SC5, SC6. 7. Export any new public symbols; regenerate barrel if needed.

**Wrap-up:** 8. Changeset, full local validation (SC8), PR for human review.
