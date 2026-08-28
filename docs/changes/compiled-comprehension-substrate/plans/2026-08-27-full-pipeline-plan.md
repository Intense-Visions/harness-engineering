# Plan: Compiled Comprehension Substrate — Phase 5 (Full Pipeline)

**Date:** 2026-08-27 | **Spec:** docs/changes/compiled-comprehension-substrate/proposal.md (D4, D6; §Serving, §Execution across contexts) | **Tasks:** 13 | **Time:** ~52 min | **Integration Tier:** large

## Goal

Serve the comprehension substrate end-to-end — kept fresh on push (static-only), backstopped in CI (token-free), demand-recompilable by an interactive leaf, pre-warmed into the leaf's dispatch prompt, and reflected in the #1524 per-leaf context budget — so the measured context-replay reduction (SC1) becomes real without ever putting an LLM or credential on the push/CI/correctness path.

## Observable Truths (Acceptance Criteria)

1. **[SF1] Push keeps the static half fresh, no LLM.** When a push touches source in module M, `harness comprehend --changed --static` recompiles M's static unit and stages `.harness/comprehension/**/_module.md` — with the provider resolver never invoked (SC4). Verified by CLI unit test asserting `--static` ⇒ provider unresolved and unit `semantic: absent`.
2. **[SF1] Config-gated + never blocks on an LLM.** With `comprehension.storage: "cache"` (or the hook disabled) the pre-push step is a no-op; in the default `committed` posture it runs static-only and cannot invoke a model. Verified by the gating-helper test.
3. **[SF2] CI catches hook-bypassers, non-blocking by default.** A CI step runs `harness comprehend --check` (token-free); a source-stale unit surfaces as an advisory annotation and does **not** fail the build. Verified by the workflow step's `continue-on-error: true` + the annotation contract.
4. **[SF3] Leaf-demand recompilation.** `get_comprehension({ module })` returns the rendered served unit via `serveGate`; on source-stale or `forceRecompile: true` it recompiles that one module (wrapped in `withComprehensionActive`) and returns the fresh unit. Verified by `get-comprehension.test.ts` (fresh serve; stale→recompile→serve; forceRecompile; reentrancy-guarded).
5. **[SF3] Registered like peers.** `get_comprehension` appears in the MCP tool registry (`server.ts`), `tool-tiers.ts`, and `tool-capability-declarations.ts` (`scopes: ['read']` for serve; `['read','write']` when recompile writes a unit), and in the regenerated tool catalog + CLI reference.
6. **[SF4] Dispatch pre-warm.** At leaf dispatch the orchestrator resolves the leaf's candidate modules, serves their fresh units through `serveGate`, and injects them as a `comprehensionPrewarm` block into the stage prompt; with no fresh units the block is empty and dispatch is byte-identical to today. Verified by `comprehension-prewarm.test.ts` + a stage-prompt render test.
7. **[SF5] Budget reflects served units (#1524).** A leaf's `LeafContextEstimate` attributes served-comprehension token counts (via `renderServedUnit`) into `sources` and yields an `estimatedTokens` **lower** than the raw-source equivalent for the same modules. Verified by `context-budget-governor.test.ts` asserting served-estimate < raw-estimate and `sources` naming the units.
8. Everything that COMPILES reuses `createNodeModuleSourceReader` + `withComprehensionActive`; `--check` and the serve/correctness path never need a credential (SC2/SC4 intact). `harness validate` passes.

## Uncertainties

- **[ASSUMPTION → verified] `.harness/comprehension/` is git-trackable.** `git check-ignore` confirms it is NOT ignored (no blanket `.harness/` rule; only `graph/`, `sessions/`, `state.*`, etc. are). So SF1 staging works this phase; the D2 `.gitignore` un-ignore + `storage`-mode gating is a **phase-6 registration item**, not a phase-5 blocker.
- **[BLOCKING → resolved via checkpoint] SF1 hook timing/staging semantics.** Pre-push runs _after_ the commit, so units staged at pre-push do not land in the pushed commits unless the push is blocked-and-instructed (commit + re-push) or the step is moved to pre-commit. Default in this plan: **stage + warn, non-blocking** (never hostile to a push), with the block-vs-warn / pre-push-vs-pre-commit choice marked `[checkpoint:decision]` in Task SF1.3.
- **[BLOCKING → resolved via checkpoint] SF4 seed for "the leaf's blast-radius modules."** At dispatch the leaf has no diff yet, so blast radius has no edited-file seed. Minimal acceptable seed (per the task brief): modules referenced by the issue (title/description/spec-path file mentions) + their direct graph deps, degrading gracefully to an empty pre-warm. Full `compute_blast_radius` wiring is the stretch. Marked `[checkpoint:decision]` in Task SF4.1.
- **[ASSUMPTION] SF5 estimate is a documented floor.** `estimateIssueContextTokens` today counts only title+description. SF5 introduces per-module source accounting (the #1524-flagged follow-up slice) so the served-vs-raw delta is meaningful; the estimate stays an explicit floor, not a measured replay.
- **[DEFERRABLE] SF2 opt-in token-gated `refresh` job.** The spec marks CI `refresh` mode optional; default is `verify`. Deferred to a follow-up (see Concerns).

## File Map

```
# SF1 — pre-push static recompile + stage
MODIFY packages/cli/src/commands/comprehend.ts            (add --static / --stage flags + wiring)
MODIFY packages/cli/tests/comprehension/*                 (comprehend-flags.test.ts — new)
CREATE packages/cli/src/comprehension/prepush.ts          (config-gated gating helper: should-run + stage paths)
CREATE packages/cli/tests/comprehension/prepush.test.ts
MODIFY .husky/pre-push                                     (config-gated static-only comprehend + stage step)

# SF2 — CI backstop (non-blocking)
MODIFY .github/workflows/ci.yml                            (non-blocking `harness comprehend --check` advisory step)

# SF3 — get_comprehension MCP tool
CREATE packages/cli/src/mcp/tools/get-comprehension.ts
CREATE packages/cli/src/mcp/tools/get-comprehension.test.ts
MODIFY packages/cli/src/mcp/server.ts                      (definition array + handler map)
MODIFY packages/cli/src/mcp/tool-tiers.ts                  (tier membership)
MODIFY packages/cli/src/mcp/tool-capability-declarations.ts (scopes)

# SF4 — orchestrator dispatch pre-warm
CREATE packages/orchestrator/src/workflow/comprehension-prewarm.ts        (seed→served-units helper)
CREATE packages/orchestrator/src/workflow/comprehension-prewarm.test.ts
MODIFY packages/orchestrator/src/workflow/local-stage-prompt.ts           ({{ comprehensionPrewarm }} in local template)
MODIFY packages/orchestrator/src/workflow/stage-prompt-template.ts        ({{ comprehensionPrewarm }} in default template)
MODIFY packages/orchestrator/src/workflow/orchestrator-context.ts         (populate the variable in renderStagePromptFactory)
MODIFY packages/orchestrator/src/workflow/local-stage-prompt.test.ts      (render assertion)

# SF5 — #1524 budget wiring
MODIFY packages/orchestrator/src/core/context-budget-governor.ts          (served-unit token attribution → LeafContextEstimate.sources, lower estimatedTokens)
MODIFY packages/orchestrator/src/core/context-budget-governor.test.ts

# Docs (mechanical, required by pre-push gates for new CLI/tool surface)
MODIFY docs/reference/*                                    (generate-docs)
MODIFY (tool catalog)                                      (generate:tool-catalog)
```

## Skeleton (produced; standard rigor, 13 tasks ≥ 8 threshold)

1. **SF1 Pre-push static recompile + stage** (~3 tasks, ~13 min) — INDEPENDENT
2. **SF2 CI backstop, non-blocking** (~1 task, ~4 min) — INDEPENDENT
3. **SF3 get_comprehension MCP tool + registration + docs** (~3 tasks, ~14 min) — INDEPENDENT
4. **SF4 Orchestrator dispatch pre-warm** (~3 tasks, ~14 min) — INDEPENDENT (biggest integration; RISK)
5. **SF5 #1524 budget wiring** (~2 tasks, ~7 min) — DEPENDS ON SF4.1 (reuses the served-unit helper)

**Estimated total:** 13 tasks, ~52 minutes. SF1/SF2/SF3/SF4 are mutually independent (disjoint files/subsystems) and parallelizable; SF5 follows SF4.1.
_Skeleton approved: proceeding (autonomous fleet driver; execution-time checkpoints marked inline)._

## Dependency & Parallelism Map

| Sub-feature             | dependsOn                                   | Independent? | Risk                                                     |
| ----------------------- | ------------------------------------------- | ------------ | -------------------------------------------------------- |
| SF1 (pre-push)          | none                                        | yes          | med — staging/timing semantics (checkpoint) + Windows sh |
| SF2 (CI)                | none                                        | yes          | low                                                      |
| SF3 (get_comprehension) | none                                        | yes          | med — recompile-on-miss + registration triple            |
| SF4 (pre-warm)          | none (uses landed gather_context/serveGate) | yes          | **HIGH — seed ambiguity (checkpoint) + dist rebuild**    |
| SF5 (budget)            | SF4.1 (served-unit helper)                  | no           | med                                                      |

Parallel waves: **Wave A** = SF1, SF2, SF3, SF4.1 concurrently. **Wave B** = SF4.2/SF4.3 and SF5 after SF4.1.

---

## Tasks

### Task SF1.1: Add `--static` flag to `harness comprehend` (force static-only, no provider)

**Depends on:** none | **Files:** packages/cli/src/commands/comprehend.ts, packages/cli/tests/comprehension/comprehend-flags.test.ts | **Owns:** packages/cli/src/commands/comprehend.ts

1. Write `packages/cli/tests/comprehension/comprehend-flags.test.ts`: assert that when `--static` is set, `runCompileMode` resolves NO provider (`generateSemantic` undefined) regardless of `config.comprehension.semantic: true`, so units are `semantic: absent`. Inject a fake `resolveAnalysisProvider` spy and assert it is never called under `--static`.
2. Run: `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/comprehend-flags.test.ts` — observe failure.
3. In `comprehend.ts`: add `.option('--static', 'Static-only: never resolve a provider or call an LLM (pre-push/CI posture)')`; thread a `staticOnly` boolean into `runCompileMode`; when true, skip `resolveAnalysisProvider`/`maybeCreateGenerateSemantic` entirely (provider stays `null`). `--check`/`--stats` unaffected.
4. Run the test — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate` (build first if needed: `pnpm --filter @harness-engineering/cli build`).
6. Commit: `feat(comprehension): add --static flag to comprehend (no-LLM push/CI posture)`

### Task SF1.2: Add `--stage` behavior (git-add compiled unit paths after a run)

**Depends on:** SF1.1 | **Files:** packages/cli/src/commands/comprehend.ts, packages/cli/tests/comprehension/comprehend-flags.test.ts | **Owns:** packages/cli/src/commands/comprehend.ts

1. Extend the test file: assert `--stage` invokes an injected `stage(paths)` seam with exactly the compiled units' shard paths (`store.path(module)` for each `result.compiled`), and is a no-op when nothing compiled. Keep the git call behind an injectable seam so the test never shells out.
2. Run the test — observe failure.
3. In `comprehend.ts`: add `.option('--stage', 'git-add the compiled unit shards (pre-push posture)')`; after a successful compile run, when `--stage` is set, stage each compiled module's shard path via a `stagePaths` helper (default impl: `spawnSync('git', ['add', ...paths])`, injectable for tests). Windows-safe: pass explicit posix paths, never a glob.
4. Run the test — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(comprehension): --stage git-adds compiled unit shards`

### Task SF1.3: Config-gated pre-push step + gating helper `[checkpoint:decision]`

**Depends on:** SF1.2 | **Files:** packages/cli/src/comprehension/prepush.ts, packages/cli/tests/comprehension/prepush.test.ts, .husky/pre-push | **Owns:** packages/cli/src/comprehension/prepush.ts, .husky/pre-push

`[checkpoint:decision]` — Present the staging/timing tradeoff before wiring `.husky/pre-push`:

|          | A) stage + warn, non-blocking (plan default) | B) block + instruct (commit & re-push)  | C) move to pre-commit                                       |
| -------- | -------------------------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| **Pros** | Never hostile to a push; fast                | Units truly land with the source commit | Units land in the same commit, naturally                    |
| **Cons** | Staged units sit uncommitted after push      | Extra round-trip on every drift push    | Slows every commit; pre-commit already runs heavy arch gate |
| **Risk** | Low                                          | Medium                                  | Medium                                                      |

**Recommendation:** A (confidence: medium) — matches "must NEVER block push," keeps the critical path fast; a follow-up can escalate to B behind config if drift-after-push proves noisy. Wait for the choice, then:

1. Write `packages/cli/tests/comprehension/prepush.test.ts`: assert `shouldRunPrepushComprehend(config)` returns `false` when `comprehension.storage === 'cache'` or comprehension is disabled, and `true` in the default `committed` posture; assert it NEVER enables semantic (always static).
2. Run: `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/prepush.test.ts` — observe failure.
3. Create `packages/cli/src/comprehension/prepush.ts` with `shouldRunPrepushComprehend(config?: HarnessConfig | null): boolean` (reuses `readComprehensionConfig`). Export it.
4. Run the test — observe pass.
5. Edit `.husky/pre-push`: add a config-gated, non-blocking step BEFORE the doc-gen checks (POSIX sh, no bashisms) that runs `harness comprehend --changed --static --stage` only when the gating helper says so, e.g.:
   ```sh
   # Comprehension substrate: static-only recompile + stage (never calls an LLM;
   # opt-out via comprehension.storage:"cache"). Non-blocking — a failure here
   # must never block a push (|| true).
   if node packages/cli/dist/bin/harness.js comprehend --changed --static --stage; then :; else
     echo "pre-push: comprehension static recompile skipped (non-fatal)."
   fi
   ```
   (The CLI itself performs the gating check via `shouldRunPrepushComprehend` and exits 0 as a no-op when disabled, so the hook stays dumb + POSIX-simple.)
6. Run: `node packages/cli/dist/bin/harness.js validate`
7. Commit: `feat(comprehension): config-gated static-only pre-push recompile + stage (D4)`

### Task SF2.1: Non-blocking CI backstop step (`comprehend --check`)

**Depends on:** none | **Files:** .github/workflows/ci.yml | **Category:** integration | **Owns:** .github/workflows/ci.yml

1. Add a step to the appropriate existing CI job in `ci.yml` (after the build step so the CLI exists), advisory + non-blocking:
   ```yaml
   - name: Comprehension freshness (advisory)
     continue-on-error: true
     run: node packages/cli/dist/bin/harness.js comprehend --check
   ```
   Use `continue-on-error: true` so a source-stale unit annotates but never reds the build (spec: default non-blocking). Do NOT add a token-gated `refresh` job (deferred — see Concerns).
2. Validate the workflow YAML parses: `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"` (js-yaml is a repo dep) — observe no throw.
3. Run: `node packages/cli/dist/bin/harness.js validate`
4. Commit: `ci(comprehension): non-blocking comprehend --check backstop`

### Task SF3.1: `get_comprehension` tool — serve + leaf-demand recompile (TDD)

**Depends on:** none | **Files:** packages/cli/src/mcp/tools/get-comprehension.ts, packages/cli/src/mcp/tools/get-comprehension.test.ts | **Owns:** packages/cli/src/mcp/tools/get-comprehension.ts

1. Write `get-comprehension.test.ts` (colocated, per repo MCP-tool convention) covering: (a) fresh unit → returns `renderServedUnit` output; (b) source-stale unit → recompiles that one module then returns the fresh rendered unit; (c) `forceRecompile: true` on a fresh unit → recompiles anyway; (d) recompile runs inside `withComprehensionActive` and refuses when already reentrant; (e) module with no unit + no source → structured "no comprehension available" (not a throw). Inject fakes for store/reader/extractStatic/generateSemantic (no disk, no LLM).
2. Run: `pnpm --filter @harness-engineering/cli exec vitest run src/mcp/tools/get-comprehension.test.ts` — observe failure.
3. Implement `get-comprehension.ts`: export `getComprehensionDefinition` (`name: 'get_comprehension'`, inputSchema `{ path, module (required), forceRecompile? }`) and `handleGetComprehension`. Logic: build `ComprehensionStore` + `createNodeModuleSourceReader(path)`; read unit; run `serveGate`; if `serve` and not `forceRecompile` → return rendered unit; else recompile the single module via `runComprehend({ mode:'changed', changedModules:[module], ... })` (static-or-semantic per config, reusing `createStaticExtractor` + `maybeCreateGenerateSemantic` + `resolveAnalysisProvider` exactly as `comprehend.ts` does), then re-serve and render. Reentrancy handled by `runComprehend`. Never throw — return `isError` envelopes like `get-impact.ts`.
4. Run the test — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(mcp): get_comprehension tool — serve + leaf-demand recompilation (D6)`

### Task SF3.2: Register `get_comprehension` (server + tiers + capabilities)

**Depends on:** SF3.1 | **Files:** packages/cli/src/mcp/server.ts, packages/cli/src/mcp/tool-tiers.ts, packages/cli/src/mcp/tool-capability-declarations.ts | **Owns:** (none — shared registries)

1. In `server.ts`: import `getComprehensionDefinition, handleGetComprehension`; add the definition to the definitions array and `get_comprehension: handleGetComprehension as ToolHandler` to the handler map (mirror the `gather_context` lines).
2. In `tool-tiers.ts`: add `'get_comprehension'` to the same tier as `gather_context`/`get_impact` (context tier).
3. In `tool-capability-declarations.ts`: add `get_comprehension: { scopes: ['read', 'write'] }` (serve is read; recompile writes a unit — declare write so the capability is honest).
4. Run: `node packages/cli/dist/bin/harness.js validate` and the tool-catalog check: `pnpm run generate:tool-catalog:check` (expect it to FAIL — the new tool isn't in the catalog yet; regenerated in SF3.3).
5. Commit: `feat(mcp): register get_comprehension (server, tiers, capabilities)`

### Task SF3.3: Regenerate tool catalog + CLI/reference docs

**Depends on:** SF3.2 | **Files:** generated docs + tool catalog | **Category:** integration | **Owns:** (none — generated)

1. Run: `pnpm run generate:tool-catalog` and `pnpm run generate-docs`.
2. Run the freshness checks the pre-push gate enforces: `pnpm run generate-docs --check` and `pnpm run generate:tool-catalog:check` — observe pass (no diff).
3. Run: `node packages/cli/dist/bin/harness.js validate`
4. Commit: `docs(comprehension): regenerate tool catalog + reference for get_comprehension`

### Task SF4.1: Pre-warm helper — resolve a leaf's served units `[checkpoint:decision]`

**Depends on:** none | **Files:** packages/orchestrator/src/workflow/comprehension-prewarm.ts, packages/orchestrator/src/workflow/comprehension-prewarm.test.ts | **Owns:** packages/orchestrator/src/workflow/comprehension-prewarm.ts

`[checkpoint:decision]` — Present the SF4 seed choice before implementing:

|          | A) Minimal: issue-referenced modules + direct deps (plan default) | B) Full `compute_blast_radius` from issue-associated files | C) Defer SF4 prompt-injection (pull-primary already serves) |
| -------- | ----------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| **Pros** | Bounded, graph-optional, ships this phase                         | Truest blast radius                                        | Zero new risk; D6 pull half already landed                  |
| **Cons** | Approximate seed                                                  | Needs graph at dispatch; larger, hub-node blowups          | Loses the push-prewarm guarantee (optimization only)        |
| **Risk** | Medium                                                            | High                                                       | Low                                                         |

**Recommendation:** A (confidence: medium) — a bounded seed captures most of the value and keeps dispatch graceful; if the graph is present the helper may enrich with direct deps, else it degrades to the referenced modules alone. C is the fallback if A proves unreliable in Task SF4.3 (see Concerns). Wait for the choice, then:

1. Write `comprehension-prewarm.test.ts`: given a fake store+reader, `resolveLeafPrewarm(issue, { projectRoot, store, reader })` returns (a) a rendered block of ONLY fresh (serveGate-passing) units for the seed modules, (b) a `sources: {label, tokens}[]` breakdown (tokens via a chars/4 estimate over `renderServedUnit`), (c) an EMPTY block + empty sources when no units are fresh/available (graceful). Assert stale units are excluded and it never throws / never calls an LLM.
2. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run src/workflow/comprehension-prewarm.test.ts` — observe failure.
3. Implement `comprehension-prewarm.ts`: `deriveSeedModules(issue)` (parse module dir paths out of title/description/spec references; posix-normalize, dedupe) → for each, `store.read` + core `serveGate` + `renderServedUnit`; return `{ block: string, sources: LeafContextSource[] }`. Reuse `@harness-engineering/core` (`ComprehensionStore`, `createNodeComprehensionIO`, `createNodeModuleSourceReader`, `serveGate`, `renderServedUnit`) — the SAME canonical primitives.
4. Run the test — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): pre-warm helper resolves a leaf's served comprehension units (D6)`

### Task SF4.2: Inject `comprehensionPrewarm` into both stage templates

**Depends on:** SF4.1 | **Files:** packages/orchestrator/src/workflow/stage-prompt-template.ts, packages/orchestrator/src/workflow/local-stage-prompt.ts, packages/orchestrator/src/workflow/orchestrator-context.ts, packages/orchestrator/src/workflow/local-stage-prompt.test.ts | **Owns:** (none — shared prompt files)

1. Extend `local-stage-prompt.test.ts` (or add an orchestrator-context render test): rendering with a non-empty `comprehensionPrewarm` includes the block under a "Pre-warmed comprehension (primary understanding)" heading; rendering with `''` produces a prompt byte-identical to today (strictVariables satisfied, no stray heading).
2. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run src/workflow/local-stage-prompt.test.ts` — observe failure.
3. Add a `{{ comprehensionPrewarm }}` slot to BOTH `LOCAL_STAGE_PROMPT_TEMPLATE` and `STAGE_PROMPT_TEMPLATE` (LiquidJS strictVariables ⇒ the variable MUST exist in both), guarded so an empty string renders nothing extra (e.g. `{% if comprehensionPrewarm != '' %}...{{ comprehensionPrewarm }}{% endif %}`). In `orchestrator-context.ts` `renderStagePromptFactory`, call `resolveLeafPrewarm(issue, ...)` (best-effort; try/catch → `''` on any error) and add `comprehensionPrewarm` to BOTH variable bags. Default `''` keeps exactOptionalPropertyTypes + strictVariables happy.
4. Run the test — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): pre-warm served units into the stage prompt (D6 push-primary)`

### Task SF4.3: Rebuild dist + e2e smoke of pre-warm `[checkpoint:human-verify]`

**Depends on:** SF4.2, SF5.1 | **Files:** (build artifacts only) | **Category:** integration | **Owns:** (none)

`[checkpoint:human-verify]` — the orchestrator loads its **dist bundle**, not source; editing source ≠ updating it. Confirm the built pipeline renders a pre-warm block and stays graceful when no units exist.

1. Rebuild: `pnpm --filter @harness-engineering/orchestrator build` (and `@harness-engineering/cli` if the CLI changed).
2. Run the orchestrator workflow tests against the build: `pnpm --filter @harness-engineering/orchestrator exec vitest run src/workflow/ src/core/context-budget-governor.test.ts`.
3. Show the reviewer: a rendered stage prompt WITH units (block present) and WITHOUT units (byte-identical to baseline). Confirm before proceeding.
4. Run: `node packages/cli/dist/bin/harness.js validate`
5. Commit (if any build-tracked artifact changed): `chore(orchestrator): rebuild dist for pre-warm + budget wiring`

### Task SF5.1: Attribute served-unit tokens into `LeafContextEstimate` (#1524)

**Depends on:** SF4.1 | **Files:** packages/orchestrator/src/core/context-budget-governor.ts, packages/orchestrator/src/core/context-budget-governor.test.ts | **Owns:** packages/orchestrator/src/core/context-budget-governor.ts

1. Extend `context-budget-governor.test.ts`: with fresh units resolvable for a leaf, the estimate's `sources` name those units and `estimatedTokens` is LOWER than the raw-source token count for the same modules (served < raw); with no units, behavior is byte-identical to today (title+description floor). Assert no LLM/credential is touched.
2. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run src/core/context-budget-governor.test.ts` — observe failure.
3. In `context-budget-governor.ts`: add an estimate builder that, given the leaf's `resolveLeafPrewarm` result, folds each served unit's token count into `LeafContextEstimate.sources` (label = module, tokens = served estimate) and sums them into `estimatedTokens` in place of the raw-source count for those modules. Keep the title+description floor. Keep it a pure, IO-injected function so the existing `assertIssueWithinContextBudget` seam threads the enriched estimate through unchanged. Document the estimate as a deliberate floor.
4. Run the test — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): budget estimate attributes served-comprehension tokens (#1524)`

### Task SF5.2: Thread the enriched estimate through the dispatch consult

**Depends on:** SF5.1 | **Files:** packages/orchestrator/src/core/context-budget-governor.ts, packages/orchestrator/src/core/context-budget-governor.test.ts | **Owns:** packages/orchestrator/src/core/context-budget-governor.ts

1. Extend the test: `assertIssueWithinContextBudget` uses the enriched (comprehension-lowered) estimate, so a leaf that is OVER budget on raw source can be WITHIN budget once served units are attributed — and the `LeafBudgetVerdict.topSources` names the served units on an overage. No-op still byte-identical when no budget configured.
2. Run: `pnpm --filter @harness-engineering/orchestrator exec vitest run src/core/context-budget-governor.test.ts` — observe failure.
3. Wire the enriched estimate into `assertIssueWithinContextBudget` (pass the prewarm result through; keep the unconfigured-budget path a pure no-op — byte-identical default preserved).
4. Run the test — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(orchestrator): consult budget with the comprehension-lowered estimate (SC1)`

---

## Sequencing summary

- **Wave A (parallel):** SF1.1→SF1.2→SF1.3 ‖ SF2.1 ‖ SF3.1→SF3.2→SF3.3 ‖ SF4.1
- **Wave B:** SF4.2 (after SF4.1) ; SF5.1→SF5.2 (after SF4.1) ; SF4.3 (after SF4.2 **and** SF5.1 — the joint e2e/dist checkpoint)
- **Checkpoints (3):** SF1.3 `[decision]` staging/timing; SF4.1 `[decision]` seed source; SF4.3 `[human-verify]` built-pipeline pre-warm.

## Changes to existing behavior

- [ADDED] `harness comprehend --static` and `--stage` flags.
- [ADDED] `get_comprehension` MCP tool.
- [ADDED] `comprehensionPrewarm` stage-prompt variable (both templates).
- [MODIFIED] `.husky/pre-push` gains a config-gated, non-blocking static comprehend+stage step.
- [MODIFIED] `.github/workflows/ci.yml` gains a non-blocking `comprehend --check` advisory step.
- [MODIFIED] `LeafContextEstimate` for a leaf now attributes served-comprehension tokens (lower `estimatedTokens`).
- [DEFERRED] CI opt-in token-gated `refresh` job; SF1 block-and-instruct escalation; D2 `.gitignore` un-ignore + storage-mode gating (phase 6).

## Validation checklist (Phase 4 of planning)

- [x] `harness validate` passes (pre-existing design-token noise only; 0 refs to phase-5 files).
- [x] `harness check-deps` passes.
- [x] Every observable truth traces to a task (SF1↔T1-3, SF2↔SF2.1, SF3↔SF3.1-3, SF4↔SF4.1-3, SF5↔SF5.1-2).
- [x] Every code task is TDD (test → fail → implement → pass) and ≤3 files.
- [x] File map complete; checkpoints marked; dependsOn/owns recorded for `plan_parallelization`.
