# Plan: Hermes Phase 1 — Foundation (Search + Summary + Insights — CLI/MCP only)

**Date:** 2026-05-16
**Spec:** `docs/changes/hermes-phase-1-session-search/proposal.md` (complexity: medium)
**Parent meta-spec:** `docs/changes/hermes-adoption/proposal.md`
**Roadmap item:** `github:Intense-Visions/harness-engineering#311`
**Starting branch:** `main` (will create `feat/hermes-phase-1-sessi-596c2987`)
**Session:** `hermes-phase-1-sessi-596c2987`
**Tasks:** 22
**Checkpoints:** 5 (one per spec sub-phase)
**Estimated time:** ~5 working days condensed → single execution pass

## Goal

Land the Phase 1 foundation: FTS5 session search, LLM auto-summary on archive, `harness search` + `harness insights` CLI commands, and three MCP tools (`search_sessions`, `summarize_session`, `insights_summary`) — wired into the existing session-archive lifecycle, the existing `AnalysisProvider`, and the existing dashboard `gather/*` modules. Dashboard UI is explicitly out (deferred to Phase 1.1).

## Observable Truths (Acceptance Criteria)

1. **Indexer round-trip.** When `archiveSession()` runs against a fixture with seeded markdown content, the system shall upsert one row per (`session_id`, `archived=1`, `file_kind`) into `.harness/search-index.sqlite`; a subsequent `searchSessions(idx, "<seeded term>")` returns that session in the top-N matches. Verified by `packages/orchestrator/src/sessions/search-index.test.ts`.
2. **Summary success.** When a stub `AnalysisProvider` returning a valid Zod payload is injected, `archiveSession()` shall write `<archive-dir>/llm-summary.md` with the spec frontmatter + headline/keyOutcomes/openQuestions/relatedSessions sections. Verified by `summarize.test.ts`.
3. **Summary degradation.** When no `AnalysisProvider` is injected (or the provider throws), `archiveSession()` still completes successfully; no `llm-summary.md` is written when provider absent; a stub `## Summary unavailable` block is written when provider throws. Verified by two test cases.
4. **CLI search.** When the operator runs `harness search "<seeded term>" --json --limit 5` against a project with the fixture index, stdout shall be valid JSON containing the seeded session in `matches[0]`. Verified by `search.test.ts` integration test.
5. **CLI insights.** `harness insights --json` shall emit a JSON object with all five top-level keys (`health`, `entropy`, `decay`, `attention`, `impact`) plus `warnings[]`; when one sub-component is mocked to throw, `warnings[]` contains an entry for that key and the corresponding top-level value is `null`. Verified by `insights.test.ts`.
6. **MCP tools registered.** `search_sessions` and `insights_summary` appear in the `core` tier set; `summarize_session` in the `standard` tier set, after running the existing tier snapshot test. Verified by updating tier snapshot fixture.
7. **No new top-level dep.** `pnpm-lock.yaml` diff shows zero added package names (only version churn allowed). Verified by `git diff --stat pnpm-lock.yaml` showing no new dep lines.
8. **Architecture clean.** `harness check-arch` reports zero new layer violations. Verified by CI.
9. **Backwards compat.** Existing test suite passes unchanged; existing `harness.config.json` files without a `hermes` section continue to validate. Verified by full CI.
10. **Archive contract preserved.** `archiveSession()`'s public signature stays compatible — the new `archiveHooks` argument is optional with a sensible no-op default. Verified by checking all existing call sites compile without modification.

## Uncertainties

- **[ASSUMPTION]** Insights composer placement — start by trying to reuse `packages/dashboard/src/server/gather/*` directly from `packages/cli`. If gather modules require a booted server, promote a thin composer to `packages/core/src/insights/` (Task 17 spike) and import from there. Spec §"Risks" anticipates this.
- **[ASSUMPTION]** Token-budget approximation — `Math.ceil(text.length / 4)` for char-to-token. Sufficient for cap enforcement (we cap input, never strictly count). If a future phase wants real tokenization, swap in `@anthropic-ai/sdk` count primitives.
- **[ASSUMPTION]** FTS5 query is the raw user query — we do not pre-escape `"`, `(`, `*`, `OR`. We document FTS5 syntax in `docs/knowledge/core/session-search.md`. Pathological inputs (e.g., a literal `"`) get an FTS5 syntax error returned in the CLI surface.
- **[ASSUMPTION]** `archiveHooks` runs **after** the move and is best-effort; failure is logged but does not roll back the archive. Spec §"Risks" treats summary + index failure as non-fatal explicitly.
- **[DEFERRABLE]** Backfill of pre-existing archives — `harness search --reindex` covers index backfill; no summary backfill this phase.
- **[DEFERRABLE]** Cross-platform FTS5 sanity test as a separate test file — the CI matrix exercises it via the indexer test by virtue of the SQLite connection succeeding.
- **[BLOCKING — None.]** All blocking questions were resolved in the spec's "Decisions Made" section before this plan.

## Skill Annotations Active

- **Apply tier:** `ts-zod-integration` (Tasks 1, 6), `ts-testing-types` (Tasks 5, 9, 12, 16, 20)
- **Reference tier:** `gof-strategy` (search-index interface vs. concrete impl), `gof-template-method` (archive hook ordering: summary then index), `harness:architecture-advisor` (Task 17 placement decision)

## File Map

**CREATE (15):**

- `packages/types/src/hermes.ts` — Zod schemas + types: `HermesConfig`, `IndexedFileKind`, `SessionSummarySchema`, `SessionSummary`, `SearchMatch`, `SearchResult`, `InsightsReport`
- `packages/orchestrator/src/sessions/search-index.ts` — `SqliteSearchIndex` class, `openSearchIndex()`, `searchSessions()`, `reindexFromArchive()`
- `packages/orchestrator/src/sessions/search-index.test.ts`
- `packages/orchestrator/src/sessions/summarize.ts` — `summarizeArchivedSession()`, `writeLlmSummaryMarkdown()`, truncation helper
- `packages/orchestrator/src/sessions/summarize.test.ts`
- `packages/orchestrator/src/sessions/archive-hooks.ts` — `buildArchiveHooks({ projectPath, provider, config })` returns the hook bundle for the CLI/orchestrator entry to inject
- `packages/orchestrator/src/sessions/archive-hooks.test.ts`
- `packages/orchestrator/src/sessions/insights.ts` — `composeInsights({ projectPath, skip })` returns `InsightsReport`; reuses `packages/dashboard/src/server/gather/*` when importable
- `packages/orchestrator/src/sessions/insights.test.ts`
- `packages/cli/src/commands/search.ts` — `createSearchCommand()`
- `packages/cli/src/commands/search.test.ts`
- `packages/cli/src/commands/insights.ts` — `createInsightsCommand()`
- `packages/cli/src/commands/insights.test.ts`
- `packages/cli/src/mcp/tools/search-sessions.ts`
- `packages/cli/src/mcp/tools/summarize-session.ts`
- `packages/cli/src/mcp/tools/insights-summary.ts`
- `packages/cli/src/mcp/tools/hermes-tools.test.ts` — one file covering definitions for the three new tools
- `.changeset/hermes-phase-1-session-search.md` — minor bumps for `core` (archive hook signature), `types`, `orchestrator`, `cli`
- `docs/knowledge/core/session-search.md`
- `docs/knowledge/core/session-summarization.md`
- `docs/knowledge/decisions/hermes-phase-1-session-memory-architecture.md`

**MODIFY (10):**

- `packages/types/src/index.ts` — re-export from `./hermes`
- `packages/types/src/orchestrator.ts` — add `hermes?: HermesConfig` to `WorkflowConfig`
- `packages/core/src/state/session-archive.ts` — accept optional `{ hooks?: ArchiveHooks }` second arg; call `hooks.onArchived` after the move; preserve fatal-only semantics from the spec (hook failures non-fatal)
- `packages/core/src/state/index.ts` — re-export the `ArchiveHooks` interface alongside `archiveSession`
- `packages/cli/src/commands/_registry.ts` — register `createSearchCommand`, `createInsightsCommand` (auto-generated by `pnpm run generate-barrel-exports`; we run the script + commit the diff)
- `packages/cli/src/mcp/server.ts` — register the three tool definitions + handlers
- `packages/cli/src/mcp/tool-tiers.ts` — add tier assignments (search/insights → core, summarize → standard); update tier snapshot
- `packages/cli/src/mcp/tools/state.ts` — pass `archiveHooks` into `archiveSession` when running `archive_session` MCP action (we wire the orchestrator hook builder here)
- `AGENTS.md` — append a "## Session Search & Insights (Phase 1)" subsection in the appropriate place
- `README.md` — add one bullet under "Key Features" referencing `harness search` and `harness insights`
- `harness.config.json` — add commented `hermes` example block (existing convention is to demonstrate optional sections)
- `.gitignore` (root) — ignore `.harness/search-index.sqlite{,-wal,-shm}`
- `templates/<scaffold-template>/.gitignore` — same three entries (so newly-init'd projects inherit them); only modify if template exists for this purpose

**Evidence references:**

- `packages/orchestrator/src/gateway/webhooks/queue.ts:46-95` — better-sqlite3 + WAL pattern
- `packages/core/src/state/session-archive.ts:14-78` — existing `archiveSession()` flow
- `packages/intelligence/src/analysis-provider/interface.ts:18-19` — `analyze<T>()` shape
- `packages/orchestrator/src/agent/intelligence-factory.ts:33-60` — provider construction from config
- `packages/cli/src/mcp/tools/entropy.ts:35-39` — MCP tool definition pattern
- `packages/cli/src/mcp/tools/state.ts` — MCP-side caller of `archiveSession` (where we wire hooks)
- `packages/dashboard/src/server/gather/health.ts`, `gather/decay-trends.ts` — existing insights data sources
- `packages/cli/src/skill/health-snapshot.ts:8-32` — `HealthChecks` + `HealthMetrics` shape we surface in `InsightsReport.health`

---

## Task List (22 tasks)

### Checkpoint 1 — Types + Indexer foundation

**Task 1 — Add Hermes types.** Create `packages/types/src/hermes.ts` with the Zod schemas and inferred types listed in the file map. Re-export from `packages/types/src/index.ts`. Add `hermes?: HermesConfig` field to `WorkflowConfig` in `packages/types/src/orchestrator.ts`.

**Task 2 — Indexer skeleton.** Create `packages/orchestrator/src/sessions/search-index.ts` with `class SqliteSearchIndex`, the schema SQL (D1), `openSearchIndex(projectPath)`, `upsertSessionDoc(doc)`, `removeSession(sessionId)`. Use `better-sqlite3` directly, mirroring the WebhookQueue WAL + prepared-statement pattern.

**Task 3 — Search query implementation.** Add `searchSessions(idx, query, opts): SearchResult` to `search-index.ts`. Use the FTS5 `bm25()` ranking function. Honour `limit`, `archivedOnly`, `fileKinds` options. Generate a snippet via SQLite's `snippet()` function (32-char window, ellipsis markers).

**Task 4 — Reindex helper.** Add `reindexFromArchive(projectPath)` that drops all `archived=1` rows and re-walks `.harness/archive/sessions/`, reading each session's known file_kinds and upserting them. Return `{ sessionsIndexed, docsWritten, durationMs }`.

**Task 5 — Indexer tests.** Create `search-index.test.ts` using `:memory:` DBs and tmp-dir fixtures. Cases: empty index returns 0 matches; upsert + search returns row; multi-file_kind ranking; reindex idempotency; FTS5 syntax error surfaces as `Result.Err`.

### Checkpoint 2 — Summarizer + archive hook

**Task 6 — Summarizer module.** Create `packages/orchestrator/src/sessions/summarize.ts`. Functions: `summarizeArchivedSession({ archiveDir, provider, config, logger })` returning `Result<SessionSummary>`; `truncateForBudget(text, tokenCap)`; `writeLlmSummaryMarkdown(archiveDir, summary, meta)`. Concatenates the indexed file_kinds (`summary`, `learnings`, `failures`, `sections`) with `## FILE: <kind>` separators, truncates, calls `provider.analyze({ prompt, responseSchema: SessionSummarySchema, ... })`.

**Task 7 — Summarizer tests.** `summarize.test.ts` covers: provider returns valid payload → markdown written with frontmatter; provider throws → returns Err, no file written when `writeStubOnError=false`, stub file when `true`; truncation caps long inputs; empty archive dir → returns Err with descriptive message.

**Task 8 — Archive-hooks orchestration.** Create `packages/orchestrator/src/sessions/archive-hooks.ts`. Exports `buildArchiveHooks({ projectPath, provider, config, logger }): ArchiveHooks`. The returned object has one method, `onArchived({ sessionId, archiveDir })`, which: (a) calls `summarizeArchivedSession` if `config.hermes?.summary?.enabled` and provider present; (b) opens the search index, walks `archiveDir`, upserts rows for each present file_kind. Both steps individually try/catch'd and logged.

**Task 9 — Archive-hooks tests.** Cover the four matrix cases: (summary on, index on), (summary off, index on), (summary on, index off — should still try), (both throw — logged but onArchived resolves). Use stubs for provider and a real `:memory:` indexer.

**Task 10 — Core archive integration.** Modify `packages/core/src/state/session-archive.ts` to accept an optional second arg: `options?: { hooks?: ArchiveHooks }`. The `ArchiveHooks` interface is defined in core (no orchestrator dep) — concrete impls live in orchestrator. After the rename to archive succeeds, call `await options?.hooks?.onArchived?.(...)` inside a try/catch; failures call `console.warn` (or the existing logger pattern if any) but do not propagate. Update the `state/index.ts` barrel to export the interface.

**Task 11 — Wire from MCP state tool.** Modify `packages/cli/src/mcp/tools/state.ts` so the `archive_session` action constructs `buildArchiveHooks(...)` (lazy-init: pass nullable provider; falls back gracefully) and passes it to `archiveSession`. The CLI command that triggers archive (if any direct path exists) gets the same treatment.

### Checkpoint 3 — CLI search + MCP search/summarize

**Task 12 — CLI `harness search`.** Create `packages/cli/src/commands/search.ts`. Commander command with the options from the spec. Pretty renderer (chalk colours + bm25 + 1-line snippet). JSON mode pipes the typed `SearchResult`.

**Task 13 — CLI search test.** `search.test.ts` with `child_process` invocation against a fixture project containing one archived session; assert JSON contains the seeded term in the top match.

**Task 14 — MCP `search_sessions`.** Create `packages/cli/src/mcp/tools/search-sessions.ts` exporting `searchSessionsDefinition` and `handleSearchSessions(args)`. Wraps `searchSessions` from orchestrator. Register in `mcp/server.ts`. Add to `mcp/tool-tiers.ts` `core` tier.

**Task 15 — MCP `summarize_session`.** Create `packages/cli/src/mcp/tools/summarize-session.ts`. Re-summarize an already-archived session by id. Force flag overwrites existing `llm-summary.md`. Tier: `standard`.

**Task 16 — MCP tool tests.** Single `hermes-tools.test.ts` exercising the definitions and handler success paths for both. Update the existing tier snapshot fixture.

### Checkpoint 4 — Insights aggregator

**Task 17 — Composer placement spike + implementation.** First attempt: import `gatherHealth` etc. from `packages/dashboard/src/server/gather/*` directly. If type-check or runtime requires a booted server context, promote a thin composer to `packages/core/src/insights/index.ts` and re-import from there. Record the decision in a one-line comment at the top of the chosen file. Implement `composeInsights({ projectPath, skip }): Promise<InsightsReport>` either way.

**Task 18 — Insights tests.** Mock each sub-component once at a time; assert: all five keys present when all succeed; `warnings[]` entry + `null` value when one throws; `skip` removes the corresponding key entirely.

**Task 19 — CLI `harness insights`.** Create `packages/cli/src/commands/insights.ts`. Pretty renderer prints one section per top-level key with the existing chalk palette. `--json` and `--skip` flags. Register in `_registry.ts`.

**Task 20 — CLI insights test.** Smoke test with the same approach as Task 13.

**Task 21 — MCP `insights_summary`.** Create `packages/cli/src/mcp/tools/insights-summary.ts`. Tier: `core`. Update tier snapshot.

### Checkpoint 5 — Docs, gitignore, knowledge, validate

**Task 22 — Docs + knowledge + final wiring.**

- Author `docs/knowledge/core/session-search.md` (lifecycle, FTS5 query syntax, reindex, troubleshooting).
- Author `docs/knowledge/core/session-summarization.md` (trigger, schema, failure modes, opt-out).
- Author `docs/knowledge/decisions/hermes-phase-1-session-memory-architecture.md` (the ADR — D1 + D3 combined).
- Append the "Session Search & Insights (Phase 1)" subsection to `AGENTS.md`.
- Append a "Key Features" bullet to `README.md`.
- Add `.harness/search-index.sqlite*` to root `.gitignore`.
- Add a commented `hermes` example block to `harness.config.json`.
- Run `pnpm run generate-barrel-exports` to refresh the CLI `_registry.ts`.
- Create `.changeset/hermes-phase-1-session-search.md` describing minor bumps for `core`, `types`, `orchestrator`, `cli`.
- Run `harness validate` + `harness check-arch` + `harness check-deps`; fix anything that surfaces.
- Run the full test suite locally; fix anything that surfaces.

---

## Checkpoints

| Checkpoint | After Task | Exit criterion                                                                              |
| ---------- | ---------- | ------------------------------------------------------------------------------------------- |
| C1         | 5          | Indexer compiles, in-memory tests pass, no architecture violations introduced               |
| C2         | 11         | Archive integration works end-to-end against fixture; both summary + index paths exercised  |
| C3         | 16         | CLI search + 2 MCP tools registered; tier snapshot updated                                  |
| C4         | 21         | `harness insights` + `insights_summary` MCP tool registered; aggregator returns full report |
| C5         | 22         | Knowledge docs in place; `harness validate` clean; full local test suite green              |

## Risk-mitigation order

The first risky task is **#17 (insights composer placement)**. We do that early enough that if the spike forces promotion to core, we have time to handle it. Indexer (Task 2) is well-trodden via the WebhookQueue pattern. Archive hook (Task 10) is the riskiest core-side change because it touches a function many callers rely on — we keep the new param strictly optional and additive.

## Out-of-scope for this plan (deferred follow-ups)

- Dashboard Search page + Insights page → `hermes-phase-1.1-dashboard-ui` roadmap item
- Backfill summaries for sessions archived before merge
- `harness cleanup-sessions` learning to reset `.harness/search-index.sqlite` → Phase 2's A9 cleanup expansion
- Live-session real-time indexing
