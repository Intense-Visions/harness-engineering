# Recommendation Engine — Recency-Aware Discovery

**Keywords:** local-models, discovery, huggingface, recency, trending, allowedOrgs, benchmark-ranker, pool

## Overview and Goals

**Problem.** The local-model recommendation engine keeps recommending **6-month-stale models** (it surfaced `Qwen3-32B`/`Llama-2/3-70B`-era candidates in July 2026, never the current leaders like `qwen3.6:27b` or `gpt-oss:20b`). Two independent causes:

1. **Discovery sorts by cumulative downloads.** `packages/local-models/src/candidates/discover.ts:100` fetches the top-`DEFAULT_PER_ORG_LIMIT` (50) GGUF models per org with `sort: 'downloads'`. Cumulative downloads favor _old, established_ models — a brand-new model has near-zero cumulative downloads and is crowded out of the 50 slots, so it **never reaches the benchmark ranker** that would score its actual capability. Discovery is silently doing _quality selection by popularity_, and getting it wrong.
2. **The org allowlist excludes the current leaders.** `allowedOrgs: [Qwen, deepseek-ai, meta-llama, google]` (config, in `harness.orchestrator.md` + `.local` + templates). The 2026 leaders ship from orgs NOT in the list — `openai` (gpt-oss), `zai-org`/`THUDM` (GLM), `moonshotai` (Kimi). The filter (`candidates/select.ts:40`, "keep only candidates whose org is in `allowedOrgs`") is a hard gate, so those models can never be _considered_, regardless of capability.

**Goals.**

1. Make discovery a **wide net** — surface new models so the benchmark ranker can evaluate them — instead of pre-filtering by popularity.
2. Expand `allowedOrgs` so the current-leader orgs can be considered.
3. Preserve the correct division of labor: **discovery finds candidates, the benchmark ranker judges them.**

**Out of scope.** Changing the ranker's benchmark scoring (it already scores capability, `ranker/evidence.ts`). Auto-pulling models. The refresh cadence itself (daily interval is fine; the bug is _what_ it discovers).

**On-strategy.** STRATEGY.md tracks a local-model pool that keeps itself current; a discovery step biased toward stale models defeats that.

## Decisions made

- **D1 — Wide-net discovery (merge `trending` + `downloads`).** Per org, fetch BOTH `sort: 'trending'` (surfaces new/hot models) AND `sort: 'downloads'` (established quality), dedupe by model id, cap at the per-org limit, and hand the union to the ranker. _Why:_ catches new leaders without dropping established ones; the ranker does the quality selection it's built for.
- **D2 — Graceful degradation.** If the `trending` call fails (HF error/timeout), fall back to the `downloads` result — discovery must never break. _Why:_ the refresh is best-effort maintenance; a discovery failure must not halt it.
- **D3 — Expand `allowedOrgs`.** Add `openai`, `zai-org`, `THUDM`, `moonshotai` to the config allowlist (all config copies: `harness.orchestrator.md`, `harness.orchestrator.local.md`, and the `templates/orchestrator/` pair). _Why:_ let the engine _consider_ the current leaders; the ranker still filters by benchmark quality.
- **D4 — No ranker change.** The benchmark ranker (`ranker/evidence.ts`, `benchmarks/merge.ts`) is untouched — it already scores capability. This change only widens what reaches it.

## Technical design

**D1/D2 — discover.ts.** In `discoverOrg` (`packages/local-models/src/candidates/discover.ts` ~90-100), replace the single `listModels({ ..., sort: 'downloads', limit })` with two calls (`sort: 'trending'` and `sort: 'downloads'`), merge + dedupe by model id, and slice to `limit`. The HF client (`huggingface/client.ts` `listModels`) already accepts a `sort` param (`huggingface/types.ts:60` lists `'downloads' | 'trending' | 'lastModified'`), and its cache TTL absorbs the extra call. Wrap the `trending` call so a failure falls back to `downloads` only (D2). The per-org limit is respected on the merged set (D1 — do not double the candidate count).

**D3 — config.** Extend `allowedOrgs` in all four config files. Keep them consistent (the byte-identical `.local` pair is test-pinned by `local-template-lint.test.ts`).

## Integration Points

- **Entry Points.** No new CLI/MCP. Changes the local-model discovery step + the `allowedOrgs` config.
- **Registrations Required.** None.
- **Documentation Updates.** A note in the local-model-lifecycle docs / discovery module on the trending+downloads wide-net rationale.
- **Architectural Decisions.** D1 (discovery is a wide net; the ranker judges) is ADR-worthy — it sets the discovery-vs-ranking boundary.
- **Knowledge Impact.** Concept: "recency-aware model discovery"; relationship: discovery-finds → ranker-judges.

## Success Criteria

- **SC1** Discovery merges `trending` + `downloads` per org: given an HF client that returns a NEW model only under `trending` (not in the top-`downloads`), that model appears in the candidate pool. (unit test, mocked client)
- **SC2** The merged candidate set is deduped by id and capped at the per-org limit (no count blow-up, no duplicates). (unit test)
- **SC3** Graceful: a throwing/failing `trending` call falls back to the `downloads` result; discovery still returns candidates. (unit test)
- **SC4** `allowedOrgs` includes `openai`, `zai-org`, `THUDM`, `moonshotai` in all four config files; a candidate from one of those orgs now passes `select.ts`'s org filter. (config assertion + a `select` unit test)
- **SC5** No regression: the benchmark ranker is unchanged; existing discovery/select/ranker tests stay green; the byte-identical `.local` config pair stays pinned.

## Implementation Order

1. **Discovery wide-net (D1/D2)** — failing test (a trending-only new model is currently dropped); implement the trending+downloads merge + dedupe + limit + graceful fallback; SC1/SC2/SC3.
2. **Config allowlist (D3)** — extend `allowedOrgs` in the four files; a `select` test that an added-org candidate passes the filter; SC4.
3. **Docs + ADR + changeset + regression sweep (SC5).**
