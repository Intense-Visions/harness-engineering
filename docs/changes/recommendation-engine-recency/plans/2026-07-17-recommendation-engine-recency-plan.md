# Plan: Recommendation Engine — Recency-Aware Discovery

**Date:** 2026-07-17 | **Spec:** docs/changes/recommendation-engine-recency/proposal.md | **Tasks:** 8 | **Time:** ~30 min | **Integration Tier:** small

## Goal

Make local-model discovery a wide net (merge HF `trending` + `downloads`, deduped and capped) and expand `allowedOrgs` to include the 2026-leader orgs, so the benchmark ranker — not a popularity pre-filter — decides which models get recommended.

## Observable Truths (Acceptance Criteria)

1. **SC1** — When the HF client returns a NEW model only under `sort: 'trending'` (absent from the top-`downloads` slice), `discoverCandidates` includes that model in the candidate pool. (unit test, mocked sort-aware client)
2. **SC2** — The merged candidate set is deduped by model id and the per-org inspection is capped at `perOrgLimit` (no duplicate `listModels`-derived ids reach `getModel`; no count blow-up). (unit test)
3. **SC3** — If the `trending` `listModels` call throws, `discoverOrg` falls back to the `downloads` result and discovery still returns candidates (no thrown error, warning recorded). (unit test)
4. **SC4** — `allowedOrgs` includes `openai`, `zai-org`, `THUDM`, `moonshotai` in the three config files that carry a `pool.allowedOrgs` block; a `select` unit test proves a candidate from an added org (e.g. `openai/...`) now passes `selectCandidates`'s org filter. (config assertion + unit test)
5. **SC5** — No regression: `ranker/evidence.ts` and `benchmarks/merge.ts` are untouched; all existing `discover`/`select`/ranker tests stay green; the byte-identical `.local` config pair stays pinned by `local-template-lint.test.ts`.

## Uncertainties

- **[RESOLVED / spec correction] "all FOUR config files."** Only THREE files actually contain a `pool.allowedOrgs` block: `harness.orchestrator.md` (root, full config, L147), `harness.orchestrator.local.md` (root, L143), and `templates/orchestrator/harness.orchestrator.local.md` (L143). The fourth file the spec names — `templates/orchestrator/harness.orchestrator.md` — is a 162-line **shim** with NO pool config, so there is nothing to change there. The plan edits the three real files. This satisfies D3/SC4 fully; the "four" in the spec is an off-by-one on the shim.
- **[RESOLVED] Byte-identity pin.** `harness.orchestrator.local.md` and `templates/orchestrator/harness.orchestrator.local.md` are byte-identical and pinned by `packages/orchestrator/src/local-template-lint.test.ts`. Both `.local` files must receive the identical edit. Verified with `diff` (IDENTICAL).
- **[ASSUMPTION] Changeset package for config edits.** Config `.md` files are repo-root scaffold sources (not copied into any package's `files[]`/`dist`); historically config-semantics changes ship under `@harness-engineering/orchestrator` changesets, and the template-lint test lives in that package. Plan uses `@harness-engineering/local-models` (minor, the code change) + `@harness-engineering/orchestrator` (minor, the config change). If the maintainer prefers `cli` for template ownership, only the changeset frontmatter changes — no task rework.
- **[DEFERRABLE] Stale docs example.** `docs/guides/local-model-lifecycle.md:27` shows a different, illustrative `allowedOrgs` example (`mistralai`, quoted strings). It is illustrative, not the live config; the docs task adds the wide-net rationale near it without forcing the example to match the config verbatim.
- **[NOTE] Existing discover mock ignores `sort`.** The current `fakeClient` in `discover.test.ts` returns the same listing regardless of `sort`. SC1/SC2/SC3 tests need a **sort-aware** fake client (keyed on `sort`), added in the test tasks — the existing fake is left intact for the existing tests.

## Ranker-Untouched Risk Flag

**D4/SC5 hard constraint:** `packages/local-models/src/ranker/evidence.ts` and `packages/local-models/src/benchmarks/merge.ts` MUST NOT be modified. This change only widens the input set handed to the ranker (`discover.ts` output → `select.ts` → ranker). No task in this plan opens either file. Task 8 explicitly asserts (via `git diff --stat`) that neither ranker file appears in the change set. If any task tempts a ranker edit, STOP — the discovery/ranking boundary (ADR, Task 7) is the whole point of the fix.

## File Map

- MODIFY `packages/local-models/tests/candidates/discover.test.ts` (add sort-aware fake + SC1/SC2/SC3 tests)
- MODIFY `packages/local-models/src/candidates/discover.ts` (`discoverOrg`: trending+downloads merge/dedupe/limit/fallback)
- MODIFY `packages/local-models/tests/candidates/select.test.ts` (add SC4 added-org test)
- MODIFY `harness.orchestrator.md` (allowedOrgs, L147)
- MODIFY `harness.orchestrator.local.md` (allowedOrgs, L143)
- MODIFY `templates/orchestrator/harness.orchestrator.local.md` (allowedOrgs, L143 — keep byte-identical to root `.local`)
- MODIFY `docs/guides/local-model-lifecycle.md` (wide-net rationale note)
- CREATE `docs/knowledge/decisions/0077-discovery-is-a-wide-net-ranker-judges.md` (ADR for D1)
- CREATE `.changeset/recommendation-engine-recency.md` (changeset)

## Skeleton

1. Wide-net discovery, TDD (~4 tasks, ~16 min) — failing SC1 test, implement merge/dedupe/limit, then SC2 + SC3 tests
2. Config allowlist + select test (~2 tasks, ~8 min) — SC4 test then edit three config files
3. Docs + ADR + changeset + regression sweep (~2 tasks, ~6 min) — SC5

_Skeleton approved: implicit — mirrors the spec's approved Implementation Order; direction pre-approved by the spec._

## Tasks

### Task 1: Failing SC1 test — a trending-only new model is currently dropped

**Depends on:** none | **Files:** `packages/local-models/tests/candidates/discover.test.ts`

1. In `packages/local-models/tests/candidates/discover.test.ts`, add a **sort-aware** fake client helper below the existing `fakeClient` (do not modify the existing `fakeClient` — existing tests depend on it):

   ```ts
   /** Sort-aware fake: `listing[author][sort]` lets a test return different ids per sort. */
   function sortAwareClient(
     listing: Record<string, Partial<Record<string, HuggingFaceModel[]>>>,
     details: Record<string, HuggingFaceModelDetail>,
     opts: { throwOnSort?: string } = {}
   ) {
     const calls = { list: [] as Array<{ author: string; sort: string }>, get: [] as string[] };
     return {
       calls,
       client: {
         async listModels(o: { author?: string; sort?: string }) {
           const author = o.author ?? '';
           const sort = o.sort ?? 'downloads';
           calls.list.push({ author, sort });
           if (opts.throwOnSort && sort === opts.throwOnSort) throw new Error(`HF ${sort} 503`);
           return listing[author]?.[sort] ?? [];
         },
         async getModel(id: string) {
           calls.get.push(id);
           const d = details[id];
           if (!d) throw new Error(`no detail for ${id}`);
           return d;
         },
       },
     };
   }
   ```

2. Extend the module-level curation map so both a downloads-established and a trending-only model are installable. Add a second `describe` block, `describe('discoverCandidates wide-net (SC1)', ...)`, with this test:

   ```ts
   const WIDE_CURATION = new Map<string, CurationTags>([
     ['Qwen/Qwen3-32B-GGUF', { ollamaName: 'qwen3:32b', family: 'qwen3' }],
     ['Qwen/Qwen3.6-27B-GGUF', { ollamaName: 'qwen3.6:27b', family: 'qwen3' }],
   ]);

   it('SC1: includes a NEW model returned only under `trending` (absent from `downloads`)', async () => {
     const { client } = sortAwareClient(
       {
         Qwen: {
           downloads: [{ id: 'Qwen/Qwen3-32B-GGUF', tags: ['gguf'] } as HuggingFaceModel],
           trending: [{ id: 'Qwen/Qwen3.6-27B-GGUF', tags: ['gguf'] } as HuggingFaceModel],
         },
       },
       {
         'Qwen/Qwen3-32B-GGUF': detail('Qwen/Qwen3-32B-GGUF', ['Q4_K_M']),
         'Qwen/Qwen3.6-27B-GGUF': detail('Qwen/Qwen3.6-27B-GGUF', ['Q4_K_M']),
       }
     );
     const res = await discoverCandidates({ orgs: ['Qwen'], curation: WIDE_CURATION, client });
     const ids = res.candidates.map((c) => c.hfRepoId);
     expect(ids).toContain('Qwen/Qwen3.6-27B-GGUF'); // trending-only new model reaches the pool
     expect(ids).toContain('Qwen/Qwen3-32B-GGUF'); // established still present
   });
   ```

3. Run: `pnpm --filter @harness-engineering/local-models test -- discover` — observe the SC1 test **FAIL** (current `discoverOrg` only calls `sort: 'downloads'`, so the trending-only model is dropped).
4. Commit: `test(local-models): failing test — trending-only new model dropped from pool`

### Task 2: Implement trending+downloads merge in `discoverOrg`

**Depends on:** Task 1 | **Files:** `packages/local-models/src/candidates/discover.ts`

1. In `packages/local-models/src/candidates/discover.ts`, replace the body of `discoverOrg` (currently L96-110) with a two-call merge + dedupe + limit + graceful trending-fallback:

   ```ts
   /** List one org's popular GGUF repos and fold each into `collected`. Fail-soft. */
   async function discoverOrg(org: string, ctx: DiscoverContext): Promise<void> {
     const { client, limit, opts, warn } = ctx;

     // Established quality (cumulative downloads). If this base call fails, the org is skipped.
     let downloads: Awaited<ReturnType<typeof client.listModels>>;
     try {
       downloads = await client.listModels({
         author: org,
         search: 'gguf',
         sort: 'downloads',
         limit,
       });
     } catch (err) {
       warn(`HF list failed for ${org}: ${messageOf(err)}`, err);
       return;
     }

     // New/hot models (trending). Graceful (D2): a trending failure falls back to downloads only.
     let trending: Awaited<ReturnType<typeof client.listModels>> = [];
     try {
       trending = await client.listModels({ author: org, search: 'gguf', sort: 'trending', limit });
     } catch (err) {
       warn(
         `HF trending list failed for ${org} (falling back to downloads): ${messageOf(err)}`,
         err
       );
     }

     // Wide net: merge both sorts, dedupe by model id, cap at the per-org limit (D1 — no blow-up).
     const merged = new Map<string, (typeof downloads)[number]>();
     for (const model of [...trending, ...downloads]) {
       if (merged.size >= limit && !merged.has(model.id)) continue;
       if (!merged.has(model.id)) merged.set(model.id, model);
     }

     for (const model of merged.values()) {
       if (opts.signal?.aborted) break;
       if (!model.tags?.includes('gguf')) continue;
       await discoverModel(model.id, ctx);
     }
   }
   ```

   Notes: trending is listed first in the merge so new leaders are preferred when the cap bites; dedupe is by `model.id` before `getModel` so no repo is fetched twice; the `limit` guard caps the merged set (not `2*limit`).

2. Run: `pnpm --filter @harness-engineering/local-models test -- discover` — observe the SC1 test now **PASSES** and all pre-existing `discover` tests stay green (the existing tests use `fakeClient`, whose `listModels` ignores `sort` and returns the same listing for both calls — dedupe collapses the duplicate, so counts are unchanged).
3. Run: `node packages/cli/dist/bin/harness.js validate 2>&1 | tail -3` (expect only pre-existing baseline noise: dashboard CSS tokens, orchestrator circular dep — nothing from local-models).
4. Commit: `feat(local-models): wide-net discovery — merge trending + downloads, dedupe, cap`

### Task 3: SC2 test — merged set deduped and capped (no blow-up)

**Depends on:** Task 2 | **Files:** `packages/local-models/tests/candidates/discover.test.ts`

1. Add to the `describe('discoverCandidates wide-net ...')` block:

   ```ts
   it('SC2: dedupes overlap by id and caps the inspected set at perOrgLimit', async () => {
     const shared = { id: 'Qwen/Qwen3-32B-GGUF', tags: ['gguf'] } as HuggingFaceModel;
     const { client, calls } = sortAwareClient(
       {
         Qwen: {
           downloads: [shared, { id: 'Qwen/Qwen3.6-27B-GGUF', tags: ['gguf'] } as HuggingFaceModel],
           trending: [shared], // overlaps downloads → must dedupe, not double
         },
       },
       {
         'Qwen/Qwen3-32B-GGUF': detail('Qwen/Qwen3-32B-GGUF', ['Q4_K_M']),
         'Qwen/Qwen3.6-27B-GGUF': detail('Qwen/Qwen3.6-27B-GGUF', ['Q4_K_M']),
       }
     );
     await discoverCandidates({ orgs: ['Qwen'], curation: WIDE_CURATION, client, perOrgLimit: 5 });
     // shared id fetched exactly once (deduped across the two sorts)
     const sharedFetches = calls.get.filter((id) => id === 'Qwen/Qwen3-32B-GGUF');
     expect(sharedFetches).toHaveLength(1);
     // both sorts were queried
     expect(calls.list.map((c) => c.sort).sort()).toEqual(['downloads', 'trending']);
   });

   it('SC2: never inspects more than perOrgLimit distinct repos', async () => {
     const many = (n: number) =>
       Array.from(
         { length: n },
         (_, i) => ({ id: `Qwen/M${i}-GGUF`, tags: ['gguf'] }) as HuggingFaceModel
       );
     const { client, calls } = sortAwareClient(
       { Qwen: { downloads: many(4), trending: many(4).map((m) => ({ ...m, id: m.id + 'T' })) } },
       {}
     );
     // getModel throws for all (uncurated) — we only assert the cap on inspection count
     await discoverCandidates({ orgs: ['Qwen'], curation: WIDE_CURATION, client, perOrgLimit: 3 });
     expect(calls.get.length).toBeLessThanOrEqual(3);
   });
   ```

2. Run: `pnpm --filter @harness-engineering/local-models test -- discover` — observe both SC2 tests **PASS**.
3. Commit: `test(local-models): SC2 — wide-net dedupe + per-org cap`

### Task 4: SC3 test — throwing `trending` falls back to `downloads`

**Depends on:** Task 3 | **Files:** `packages/local-models/tests/candidates/discover.test.ts`

1. Add to the same `describe` block:

   ```ts
   it('SC3: a throwing `trending` call falls back to `downloads`; discovery still returns candidates', async () => {
     const { client } = sortAwareClient(
       {
         Qwen: {
           downloads: [{ id: 'Qwen/Qwen3-32B-GGUF', tags: ['gguf'] } as HuggingFaceModel],
           trending: [],
         },
       },
       { 'Qwen/Qwen3-32B-GGUF': detail('Qwen/Qwen3-32B-GGUF', ['Q4_K_M']) },
       { throwOnSort: 'trending' }
     );
     const res = await discoverCandidates({ orgs: ['Qwen'], curation: WIDE_CURATION, client });
     expect(res.candidates.map((c) => c.hfRepoId)).toContain('Qwen/Qwen3-32B-GGUF'); // downloads survived
     expect(res.warnings.some((w) => /trending.*fall/i.test(w))).toBe(true); // fallback warned
   });

   it('SC3: a throwing `downloads` (base) call skips the org fail-soft (unchanged behavior)', async () => {
     const { client } = sortAwareClient({}, {}, { throwOnSort: 'downloads' });
     const res = await discoverCandidates({ orgs: ['broken'], curation: WIDE_CURATION, client });
     expect(res.candidates).toHaveLength(0);
     expect(res.warnings.some((w) => /HF list failed for broken/.test(w))).toBe(true);
   });
   ```

2. Run: `pnpm --filter @harness-engineering/local-models test -- discover` — observe both SC3 tests **PASS**, entire `discover` suite green.
3. Run: `node packages/cli/dist/bin/harness.js check-deps 2>&1 | tail -3` (no NEW circular deps from local-models; pre-existing orchestrator cycle is baseline).
4. Commit: `test(local-models): SC3 — graceful trending fallback to downloads`

### Task 5: SC4 test — an added-org candidate passes `selectCandidates`

**Depends on:** none | **Files:** `packages/local-models/tests/candidates/select.test.ts`

1. In `packages/local-models/tests/candidates/select.test.ts`, add to the `describe('selectCandidates', ...)` block:

   ```ts
   it('SC4: a candidate from an added leader org (openai) passes the org filter', () => {
     const withLeader: FrozenCandidate[] = [
       ...CANDIDATES,
       {
         hfRepoId: 'openai/gpt-oss-20B-GGUF',
         ollamaName: 'gpt-oss:20b',
         sizeB: 20,
         quant: 'Q4_K_M',
       },
     ];
     const result = selectCandidates(withLeader, {
       allowedOrgs: [
         'Qwen',
         'deepseek-ai',
         'meta-llama',
         'google',
         'openai',
         'zai-org',
         'THUDM',
         'moonshotai',
       ],
       allowedFamilies: [],
     });
     expect(result.map((c) => c.hfRepoId)).toContain('openai/gpt-oss-20B-GGUF');
   });
   ```

2. Run: `pnpm --filter @harness-engineering/local-models test -- select` — observe the SC4 test **PASSES** (this is a pure-function assertion over `selectCandidates`, which already honors any `allowedOrgs` passed; the config wiring is Task 6). All existing `select` tests stay green.
3. Commit: `test(local-models): SC4 — added leader org passes the org filter`

### Task 6: Expand `allowedOrgs` in the three config files

**Depends on:** Task 5 | **Files:** `harness.orchestrator.md`, `harness.orchestrator.local.md`, `templates/orchestrator/harness.orchestrator.local.md` | **Category:** integration

1. In **all three** files, replace the `allowedOrgs` line
   `    allowedOrgs: [Qwen, deepseek-ai, meta-llama, google]`
   with
   `    allowedOrgs: [Qwen, deepseek-ai, meta-llama, google, openai, zai-org, THUDM, moonshotai]`
   - `harness.orchestrator.md` — line 147
   - `harness.orchestrator.local.md` — line 143
   - `templates/orchestrator/harness.orchestrator.local.md` — line 143

   (Note: `templates/orchestrator/harness.orchestrator.md` is a shim with no `pool` block — do NOT create one; the spec's "fourth file" does not exist as a config surface.)

2. Verify the byte-identical `.local` pair stays identical:
   `diff harness.orchestrator.local.md templates/orchestrator/harness.orchestrator.local.md && echo IDENTICAL`
   — must print `IDENTICAL`.
3. Run: `pnpm --filter @harness-engineering/orchestrator test -- local-template-lint` — the byte-identity pin (SC5) stays green.
4. Run: `node packages/cli/dist/bin/harness.js validate 2>&1 | tail -3` (baseline noise only).
5. Commit: `feat(orchestrator): add openai/zai-org/THUDM/moonshotai to allowedOrgs`

### Task 7: ADR — discovery is a wide net, the ranker judges

**Depends on:** Task 2 | **Files:** `docs/knowledge/decisions/0077-discovery-is-a-wide-net-ranker-judges.md` | **Category:** integration

1. Confirm `0077` is the next number: `ls docs/knowledge/decisions/ | sort | tail -3` (highest is currently `0076-staged-empty-diff-halt.md`).
2. Create `docs/knowledge/decisions/0077-discovery-is-a-wide-net-ranker-judges.md` following the shape of a neighboring ADR (open `0076-staged-empty-diff-halt.md` for the exact heading/frontmatter convention and mirror it). Content must capture:
   - **Title:** Discovery is a wide net; the benchmark ranker judges.
   - **Status:** Accepted (2026-07-17).
   - **Context:** Discovery previously sorted only by cumulative downloads, silently doing quality selection by popularity and crowding out new models before they reached the ranker. Result: 6-month-stale recommendations.
   - **Decision (D1):** Discovery merges `trending` + `downloads` per org (deduped, capped) — a wide net. It does NOT judge quality. The benchmark ranker (`ranker/evidence.ts`) is the sole quality authority. `allowedOrgs`/`allowedFamilies` remain the operator trust gate (`select.ts`), not a quality gate.
   - **Consequences:** New leaders reach the ranker; the ranker is untouched (D4); discovery is best-effort and fail-soft (D2). The discovery↔ranking boundary is now explicit and must not be blurred (no re-adding popularity filters to discovery, no adding discovery heuristics to the ranker).
3. Run: `node packages/cli/dist/bin/harness.js validate 2>&1 | tail -3`.
4. Commit: `docs(local-models): ADR 0077 — discovery wide-net vs ranker judgement`

### Task 8: Docs note + changeset + regression sweep (SC5)

**Depends on:** Task 6, Task 7 | **Files:** `docs/guides/local-model-lifecycle.md`, `.changeset/recommendation-engine-recency.md` | **Category:** integration

1. In `docs/guides/local-model-lifecycle.md`, near the discovery/`allowedOrgs` section (around L27), add a short paragraph on the wide-net rationale: discovery now merges HF `trending` (new/hot) with `downloads` (established), deduped and capped per org, so brand-new leaders are not crowded out by cumulative-download popularity before the benchmark ranker can score them. Link the ADR: `docs/knowledge/decisions/0077-discovery-is-a-wide-net-ranker-judges.md`. Do NOT rewrite the pre-existing illustrative `allowedOrgs` example line — it is illustrative, not the live config.
2. Create `.changeset/recommendation-engine-recency.md`:

   ```md
   ---
   '@harness-engineering/local-models': minor
   '@harness-engineering/orchestrator': minor
   ---

   Recency-aware local-model discovery. Discovery is now a wide net: per approved org it merges HuggingFace `trending` (new/hot) with `downloads` (established), dedupes by model id, and caps at the per-org limit, then hands the union to the benchmark ranker — instead of pre-filtering by cumulative downloads, which crowded out brand-new leaders before they could be scored. A failing `trending` call falls back to `downloads` (discovery never breaks). The `allowedOrgs` allowlist gains `openai`, `zai-org`, `THUDM`, `moonshotai` so the current-leader orgs can be considered. The benchmark ranker is unchanged — this only widens what reaches it.
   ```

   (If the maintainer owns `templates/orchestrator/` scaffolds under `cli` rather than `orchestrator`, swap the second package — no code changes.)

3. **Ranker-untouched assertion (D4/SC5):** run
   `git diff --stat main -- packages/local-models/src/ranker/ packages/local-models/src/benchmarks/`
   — must print **nothing** (no ranker/benchmark files changed).
4. Full regression sweep: `pnpm --filter @harness-engineering/local-models test` and `pnpm --filter @harness-engineering/orchestrator test -- local-template-lint` — all green.
5. Run: `node packages/cli/dist/bin/harness.js validate 2>&1 | tail -3` (baseline noise only).
6. Commit: `docs(local-models): wide-net rationale + changeset for recency-aware discovery`

## Change Specification (delta)

### Local-model discovery (`discover.ts`)

- [MODIFIED] `discoverOrg` fetches BOTH `sort: 'trending'` and `sort: 'downloads'` (was: `downloads` only), merges + dedupes by model id, caps the merged set at `perOrgLimit`.
- [ADDED] Graceful fallback: a throwing `trending` call is warned and dropped, leaving the `downloads` result; the base `downloads` failure keeps the existing org-skip fail-soft behavior.

### Config allowlist

- [MODIFIED] `pool.allowedOrgs` in `harness.orchestrator.md`, `harness.orchestrator.local.md`, and `templates/orchestrator/harness.orchestrator.local.md` gains `openai`, `zai-org`, `THUDM`, `moonshotai`.

### Untouched (D4)

- [UNCHANGED] `ranker/evidence.ts`, `benchmarks/merge.ts` — asserted empty in the diff (Task 8).
