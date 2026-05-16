---
number: 0013
title: Session memory architecture — SQLite FTS5 + LLM auto-summary on archive
date: 2026-05-16
status: accepted
tier: medium
source: docs/changes/hermes-phase-1-session-search/proposal.md
---

## Context

Hermes Phase 1 ("Session Search + Insights") had to deliver full-text retrieval
over `.harness/sessions/` and `.harness/archive/sessions/`, plus an
LLM-generated retrospective summary attached to every archived session, plus a
composite `harness insights` aggregator. Before this phase, the only way to
recall context from a past session was filename guessing + `ripgrep`. The
parent meta-spec ([Hermes Adoption: 6-Phase Decomposition](../../changes/hermes-adoption/proposal.md))
framed this as a foundation for Phase 4 (Skill Proposal Loop) — proposals can
later use "find similar skills" backed by session evidence — and the fastest
visible user-facing win in the program.

Three retrieval shapes were on the table at brainstorming:

- **A. Native search engine (Tantivy, MeiliSearch).** Native binary + extra
  runtime. Ranking and faceting come for free.
- **B. SQLite FTS5 with BM25 ranking.** Already-shipped binding via
  `better-sqlite3` (used by the Phase 3 webhook queue at
  `packages/orchestrator/src/gateway/webhooks/queue.ts`). No new native dep,
  no new daemon, FTS5 phrase/operator grammar covers the legitimate use cases.
- **C. ripgrep-on-demand with no index.** No ranking, no sub-second p95 at
  1 000+ sessions, no snippet extraction.

Three summary trigger points were on the table:

- **D. On every session write.** Cheapest to keep fresh, but burns LLM tokens
  for every mid-session `learnings.md` append.
- **E. On session archive.** Single pass, predictable cost ceiling, summary
  is a retrospective by nature.
- **F. On-demand only (CLI/MCP).** Defers cost but leaves the archived
  directory without a summary — defeats the "find similar by reading
  summaries" downstream pattern.

The parent meta-spec also suggested that the LLM summary could _replace_ the
existing operator-controllable `SessionSummaryData.keyContext` field. That
would have broken the existing mid-session UX contract: `keyContext` is what
the agent writes _while working_; an LLM retrospective is something different.

## Decision

We chose **B (SQLite FTS5) + E (summary on archive) + additive (do not
replace `keyContext`)**.

Concrete commitments:

1. **Index file.** One SQLite DB at `.harness/search-index.sqlite` plus the
   WAL/SHM sidecars (`-wal`, `-shm`). All three added to `.gitignore` via the
   existing harness-ignore patterns alongside `webhook-queue.sqlite`. WAL +
   `synchronous = NORMAL` mirroring the Phase 3 queue.
2. **Schema.** One `session_docs` container table keyed by
   `UNIQUE(session_id, archived, file_kind)` and one content-mirrored FTS5
   virtual table `session_docs_fts` kept in sync via three triggers (AI, AD,
   AU). Tokenizer = `unicode61 remove_diacritics 2`. Ranking = `bm25()`,
   snippet = SQLite's built-in `snippet()` with 16-char window and `…`
   markers.
3. **Indexed file kinds.** `summary`, `learnings`, `failures`, `sections`,
   `llm_summary`. Pluggable via `hermes.search.indexedFileKinds`. Bodies are
   truncated to `hermes.search.maxIndexBytesPerFile` (default 256 KiB) so a
   pathological session can't bloat the index.
4. **FTS5 query grammar.** Bare-word user input is auto-wrapped as quoted
   FTS5 phrases (so `token-aleph` doesn't get parsed as `token NOT aleph`).
   Explicit FTS5 syntax (`"`, `()`, `*`, `^`, `+`, `AND`, `OR`, `NOT`, or a
   `column:` selector) passes through unchanged so power users keep the full
   grammar.
5. **Index trigger model.** Archive-on-close hook calls
   `indexSessionDirectory()` synchronously inside the archive transaction
   plus `harness search --reindex` for full rebuild. Real-time indexing of
   live sessions is deferred — write amplification cost is not offset by
   demand. First-run lazy creation: opening the index file is idempotent and
   creates an empty schema.
6. **Summary trigger model.** Archive hook calls
   `summarizeArchivedSession()` immediately after the directory move and
   before the indexer. Provider invocation is wrapped in `Promise.race()`
   against a configurable timeout (default 60 s). Failure is **non-fatal**:
   the archive still completes; an optional stub `llm-summary.md` is
   written so callers can detect that summarization was attempted.
7. **Summary payload.** Zod schema in `packages/types/src/hermes.ts` —
   `headline` (≤120 chars), `keyOutcomes[]`, `openQuestions[]`,
   `relatedSessions[]`. Persisted to `<archive>/llm-summary.md` with
   frontmatter (`generatedAt`, `model`, `inputTokens`, `outputTokens`,
   `schemaVersion`).
8. **Additive, not replacement.** The existing
   `SessionSummaryData.keyContext` field is untouched; the LLM payload lives
   in its own file (`llm-summary.md`). This walks back the parent meta-spec's
   "`keyContext` becomes LLM-populated" wording.
9. **Insights composer placement.** Lives in
   `packages/core/src/insights/aggregator.ts` (the Task-17 spike defaulted to
   core because the dashboard's `gather/*` modules can't be imported from
   CLI). Reuses `EntropyAnalyzer`, `TimelineManager`, the existing session
   directory layout, and a cached `.harness/cache/impact.json` when present.
10. **MCP tier policy.** `search_sessions` and `insights_summary` →
    `core` tier (cheap, read-only, high-value). `summarize_session` →
    `standard` tier (LLM-spend implication is explicit).

## Why the alternatives failed

- **A (Tantivy / MeiliSearch).** Adds a native dependency and an external
  service surface to a foundation phase. Not justified at < 10 k documents.
- **C (ripgrep-on-demand).** Already what operators do today; no ranking, no
  sub-second p95 at 1 000+ sessions.
- **D (summary on every write).** Token-spend per session would be ~N×
  archive cost where N is the number of session updates; mid-session writes
  also overlap with what the agent already has in context.
- **F (summary on-demand only).** Phase 4's downstream "find similar skills
  by reading summaries" pattern requires summaries to exist by default —
  on-demand would leave the corpus too sparse.
- **Replace `keyContext`.** Breaks the existing operator/agent UX contract
  where `keyContext` is mid-session and operator-controlled.

## Consequences

**Wins**

- p95 search latency < 200 ms over corpora of 1 000+ archived sessions
  (verified in tests with a 5-doc fixture; performance smoke test deferred to
  Phase 1.1 alongside the dashboard UI).
- 100 % of cleanly-closed sessions get a retrospective summary when an LLM
  provider is configured.
- `harness insights` returns a composite report in < 5 s on a typical
  project; per-component failure is isolated to a `warnings[]` entry so
  partial reports remain useful.
- Zero new runtime dependencies — `better-sqlite3` was already in the
  dependency tree via Phase 3's webhook queue.
- Backwards compatible: existing `harness.config.json` files without a
  `hermes` block continue to validate; `archiveSession()`'s public signature
  remains compatible via the optional `options.hooks` parameter.

**Tradeoffs / Costs**

- FTS5 grammar is power-user-facing. The normalizer covers the common case
  (bare-word AND-joined queries) but pathological inputs still surface as
  `SqliteError` to the CLI.
- The index is durable, not cache-managed. Operators who want a fresh state
  run `harness search --reindex`. Cleanup expansion (Phase 2 A9) will gain a
  `--reset-index` flag if demand warrants it.
- Summary cost is bounded by `inputBudgetTokens` (default 16 000) and the
  per-archive trigger; large operators with hundreds of archives per day
  will want to watch the telemetry. The Phase 5 cost-ceiling will catch any
  runaway via dispatch.
- Dashboard Search/Insights pages are explicitly deferred to a follow-up
  roadmap item (`hermes-phase-1.1-dashboard-ui`).

**Risks accepted**

- Index file corruption — `--reindex` rebuilds from
  `.harness/archive/sessions/`; deletion is safe.
- Provider misconfiguration leaving summary silently off — `harness doctor`
  (Phase 3, A7) will detect this; for now, summary failures are logged via
  the structured logger.
- LLM payload schema drift — `SessionSummarySchema` parse is defensive
  (provider-side validation + our re-parse); failure writes a stub file
  and returns `Err`.

## Implementation pointers

- Indexer: `packages/orchestrator/src/sessions/search-index.ts`
- Summary: `packages/orchestrator/src/sessions/summarize.ts`
- Hook bundle: `packages/orchestrator/src/sessions/archive-hooks.ts`
- Core archive integration:
  `packages/core/src/state/session-archive.ts:39-99` — accepts optional
  `options.hooks` for back-compat with all existing callers.
- MCP wiring: `packages/cli/src/mcp/tools/search-sessions.ts`,
  `summarize-session.ts`, `insights-summary.ts`; registered in
  `packages/cli/src/mcp/server.ts:17-19,241-243,310-312`.
- CLI commands: `packages/cli/src/commands/search.ts`,
  `packages/cli/src/commands/insights.ts`; registered in
  `packages/cli/src/commands/_registry.ts`.
- Insights composer: `packages/core/src/insights/aggregator.ts`.
- Config schema: `packages/types/src/hermes.ts` (Zod), wired into
  `WorkflowConfig.hermes?` at `packages/types/src/orchestrator.ts:572`.
- Spec: `docs/changes/hermes-phase-1-session-search/proposal.md`
- Plan: `docs/changes/hermes-phase-1-session-search/plans/2026-05-16-phase-1-foundation-plan.md`
