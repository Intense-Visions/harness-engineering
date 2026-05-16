# Hermes Phase 1: Session Search + Insights

**Parent spec:** [docs/changes/hermes-adoption/proposal.md](../hermes-adoption/proposal.md)
**Roadmap item:** github:Intense-Visions/harness-engineering#311
**Keywords:** session-search, fts5, sqlite, auto-summarization, llm-summary, insights-aggregator, mcp-search-tool

## Overview

Phase 1 of the Hermes Adoption program. Ships a SQLite FTS5 full-text index over `.harness/sessions/` and `.harness/archive/sessions/`, automatic LLM-generated summaries on session archive, and an `insights` aggregator that composes existing entropy / decay / attention / impact / health views into a single status report. Three new user surfaces are added: `harness search <query>` CLI, `harness insights` CLI, and equivalent MCP tools (`search_sessions`, `summarize_session`, `insights_summary`).

The parent meta-spec ([Hermes Adoption: 6-Phase Decomposition](../hermes-adoption/proposal.md)) decomposed adoption into six phases. Phase 1 is independent of Phase 0 (Gateway API) and was deliberately picked as the fastest visible user-facing win: today, the only way to recall context from a past harness session is to `grep` the markdown by hand. After Phase 1 lands, the operator can ask "which session discussed the constraint-lock format?" and get a ranked, scoped answer in well under a second.

### Problem

Harness produces a dense per-session paper trail today — `.harness/sessions/<slug>/summary.md`, `learnings.md`, `failures.md`, `session-sections.md`, `events.jsonl`, and the new constraint-lock metadata — and archives the same content to `.harness/archive/sessions/<slug>-<date>/` when sessions complete. None of this content is indexed, searchable, or summarized after the fact:

1. **No retrieval primitive.** The closest existing surface is `harness skill search` (catalog text match over the skill marketplace, not session memory). Operators rely on filename guessing, `ripgrep`, or memory.
2. **No summary except what the agent wrote at the time.** `SessionSummaryData.keyContext` is a free-form field the agent fills _during_ the session; it's a working note, not a retrospective. There is no end-of-session pass that compresses the full corpus.
3. **No composite status view.** Entropy (`detect_entropy`), decay trends (`decay-trends.ts`), attention (`useAttentionSync` + dashboard `Attention.tsx`), impact (`get-impact`), and health (`health-snapshot.ts`) are five separate surfaces. Producing a "where are we right now?" snapshot requires walking all five by hand.

Without Phase 1, Phase 4 (Skill Proposal Loop) cannot offer "find similar skills" suggestions backed by session evidence, and the broader autopilot path cannot consult its own history for repeated-failure patterns. Phase 1 unblocks those by establishing the index + summary lifecycle once.

### Goals

1. **Full-text search over session memory.** SQLite FTS5 index over the relevant files inside both live sessions (`.harness/sessions/`) and archived sessions (`.harness/archive/sessions/`). p95 query latency < 200 ms over a corpus of 1000+ archived sessions.
2. **LLM-generated retrospective summary on archive.** Hook `archiveSession()` to invoke the existing `AnalysisProvider` interface (Anthropic / OpenAI-compatible / Claude CLI) and write a structured summary into the archive directory before the session is finalized. 100 % of cleanly-closed sessions get a summary; pathological cases (LLM unavailable, summary fails) degrade gracefully — the archive still completes, just without the LLM block.
3. **Operator-facing CLI + MCP surface.** `harness search "<query>"` and `harness insights` available from the terminal; equivalent MCP tools (`search_sessions`, `summarize_session`, `insights_summary`) available to in-IDE agents.
4. **Composite insights aggregator.** `harness insights` (and the matching MCP tool) returns one composite report — health + entropy + decay + attention + impact rolled into a single JSON payload, renderable as text or piped to a dashboard. p95 latency < 5 s over a typical project.
5. **No new runtime dependency.** Reuse `better-sqlite3` (already in `packages/orchestrator`) for FTS5; reuse the existing `IntelligencePipeline` / `AnalysisProvider` factory for summaries; reuse existing `gather/*` modules for insights composition.

### Non-goals

- **Cross-project / multi-repo search.** Index scope is `<project>/.harness/`. A federated search across multiple harness installs is out of scope.
- **Semantic / embeddings search.** FTS5 BM25 ranking is the only retrieval primitive this phase. Vector embeddings are watch-list material (W12 memory backend abstraction) — interesting, but adds a dependency surface that isn't justified by the current retrieval failure mode (operators can't find anything at all; ranking nuance is a later optimisation).
- **Mid-session indexing / live tail.** Indexing fires on session archive and via `harness search --reindex`. Real-time tailing of the live session into the index is out of scope (cost-per-edit too high; the agent already has the content in its own context window).
- **Replacing the agent-written `keyContext` field.** The LLM summary is **additive** — it writes new structured fields into a `llm-summary.md` (or equivalent) within the archive, but does not overwrite the operator-controllable summary fields. Spec note: the parent meta-spec said "`keyContext` becomes LLM-populated rather than hand-written" — Phase 1 walks that back to additive-only to preserve the existing operator/UX contract. Replacement is a watch item for Phase 4 follow-up if the LLM summary proves universally higher-quality.
- **Insights aggregator as a dashboard refactor.** The aggregator composes existing data sources read-only; it does not deprecate, replace, or re-host the existing Health / Attention / DecayTrends / Impact dashboard pages.
- **Dashboard Search page + Insights page UI.** Deferred to a follow-up roadmap item (`hermes-phase-1.1-dashboard-ui`) for the same reason Phase 0 deferred its reference Slack bridge: ship the foundation promptly, build UI on top once the data surface is stable. CLI + MCP cover 80 % of the user value on day one.

### Scope

**In-scope:**

- `packages/core/src/state/session-search.ts` module — FTS5 schema, indexer, query, reindex
- `packages/core/src/state/session-summary-llm.ts` module — structured LLM summary generator (consumes `AnalysisProvider`)
- Hook into `archiveSession()` to invoke summary + index update inside the archive transaction
- `harness search [--limit N] [--archived-only] [--reindex] "<query>"` CLI command
- `harness insights [--json]` CLI command
- `search_sessions`, `summarize_session`, `insights_summary` MCP tools (tier: `standard` for search/summary, `core` for insights)
- `hermes` config section in `WorkflowConfig` (enable/disable, summary on/off, indexed-file allowlist, budgets)
- Knowledge docs (`docs/knowledge/core/session-search.md`, `docs/knowledge/core/session-summarization.md`)
- ADR (`docs/knowledge/decisions/hermes-phase-1-session-memory-architecture.md`)

**Out-of-scope:**

- Dashboard Search page (`packages/dashboard/src/client/pages/Search.tsx`) — deferred to `hermes-phase-1.1-dashboard-ui`
- Dashboard Insights page — deferred to `hermes-phase-1.1-dashboard-ui`
- Vector / embedding store, mid-session indexing, cross-project federation, automatic summary regeneration when source files change post-archive
- Auto-reindex from `archive/sessions/` mutations (operator runs `harness search --reindex` after manual archive edits)
- LLM-based search query expansion or natural-language → BM25 translation
- Cleanup of the `.harness/search-index.sqlite` file inside `harness cleanup-sessions` (deferred to Phase 2 cleanup expansion, A9)

### Assumptions

- **Runtime:** Node.js ≥ 18.x. `better-sqlite3 ^12.10.0` is already pinned in `packages/orchestrator`; Phase 1 lifts the dep to `packages/core` (or shares via a thin wrapper) without bumping the version.
- **FTS5 availability:** the prebuilt `better-sqlite3` binaries ship with FTS5 compiled in on all platforms harness already supports (verified during S2 — see Decisions).
- **LLM provider:** the `IntelligencePipeline` factory at `packages/orchestrator/src/agent/intelligence-factory.ts` is the canonical entry point. Phase 1 wraps `AnalysisProvider.analyze()` with a Zod response schema; no new provider implementation.
- **Encoding:** UTF-8 for all on-disk files. FTS5 tokenizer = `unicode61` (default, case-insensitive, ASCII-folding).
- **Filesystem:** the harness process has read+write access under `.harness/`.
- **Insights data sources unchanged:** the aggregator imports existing `gather/health.ts`, `gather/decay-trends.ts`, and equivalents — no refactor required.

---

## Decisions Made

Six decisions surfaced during brainstorming. Each names the alternatives considered and the reason for the choice; references to the parent meta-spec preserve traceability.

### D1 — Index format = SQLite FTS5 (parent K2 / C1+C2)

The index is a single SQLite database at `.harness/search-index.sqlite` using one external-content FTS5 virtual table (`session_docs`) keyed by `(session_id, file_kind)`. Stored columns: `session_id`, `archived` (0/1), `file_kind` (one of `summary` | `learnings` | `failures` | `sections` | `llm_summary`), `path` (relative to project root), `mtime` (ms), `body`. FTS5 ranks via BM25; we sort by `bm25(session_docs) ASC`.

**Alternatives rejected:**

- _Tantivy / MeiliSearch_ — native binary + extra runtime; not justified for a corpus of < 10 k documents.
- _ripgrep-on-demand_ — already what operators do today; no ranking, no sub-second p95 at 1 k sessions.
- _Plain SQLite LIKE_ — no ranking, no tokenizer, only marginally better than `grep`.

**Evidence:** `packages/orchestrator/src/gateway/webhooks/queue.ts` shows the existing better-sqlite3 wrapper pattern (WAL, prepared statements, atomic transactions). Spec parent §"Phase 1 — Session Memory" line: "SQLite FTS5 index over `.harness/sessions/*/` content".

### D2 — Index trigger = archive-on-close + manual `--reindex` (parent K2 risk-mitigation)

The index is updated in three places:

1. **On `archiveSession()`** — synchronously, inside the archive flow, after the session directory moves to `archive/sessions/<slug>-<date>/`. The indexer reads the archived files and upserts rows. If this step fails, the archive still completes; an error event is emitted but the failure is non-fatal.
2. **On `harness search --reindex`** — full-scan re-build, used after manual archive edits or after a corrupted index file is detected.
3. **On `harness search`'s first run** if no index exists — auto-builds an empty index file (no rows; lazy population on next archive).

Real-time indexing of `live` sessions is deferred (Non-goals). Rationale: mid-session content churns rapidly, the agent already has the same content in-context, and the cost (write amplification on every `learnings.md` append) is not offset by user value (live-session search is rarely asked for in dogfooding signals).

**Alternatives rejected:**

- _Filesystem watcher for live sessions_ — adds a daemon surface; cross-platform-flaky (`fs.watch` on macOS has known gotchas); a write storm during a hot autopilot run could thrash the index.
- _Index only at `harness search`-time_ — defers cost but makes the first search after archive multi-second.

**Evidence:** parent spec line "updated on session close"; existing `archiveSession()` lifecycle at `packages/core/src/state/session-archive.ts`.

### D3 — Summary trigger = on archive, behind config flag, structured output (parent K2 C2)

The LLM summary fires inside `archiveSession()` immediately after the session move and before the index update. It reads `summary.md`, `learnings.md`, `failures.md`, `session-sections.md` (when present) from the archive directory; concatenates with file-kind labels; truncates to a configurable token budget (default 16 k input tokens); calls `AnalysisProvider.analyze({ prompt, responseSchema })` with a Zod schema that requires `headline` (string ≤ 120 chars), `keyOutcomes` (string[]), `openQuestions` (string[]), `relatedSessions` (string[], may be empty in v1), and `tokensUsed` metadata. The result is written to `<archive-dir>/llm-summary.md` as markdown rendered from the structured payload.

The flag `hermes.summary.enabled` defaults to `true` _when an `intelligence` provider is configured_ and `false` otherwise. If the provider call fails or times out (default 60 s), we log + emit a non-fatal warning event, write a stub `llm-summary.md` containing only `## Summary unavailable\n- reason: <error>` so the file's presence is a stable signal, and continue.

**Alternatives rejected:**

- _Free-form prose summary_ — harder to render; harder to evolve fields; can't dedupe across sessions later.
- _Replace `keyContext` field_ — would break the existing UX contract (agent-controlled mid-session note vs. retrospective summary). Walked back from parent spec wording — recorded in Non-goals.
- _Summarize mid-session_ — cost-per-token is wrong shape; the agent already compresses for itself.

**Evidence:** `packages/intelligence/src/analysis-provider/interface.ts` defines `analyze<T>` returning a typed response; `packages/orchestrator/src/agent/intelligence-factory.ts` constructs providers from config; existing `session-archive.ts` is the canonical lifecycle point.

### D4 — Insights aggregator = read-only composition over existing `gather/*` (parent A1 / L1)

`harness insights` calls into the existing gather modules (`packages/dashboard/src/server/gather/health.ts`, `gather/decay-trends.ts`, and equivalents) directly — or, where those modules are server-coupled, into the underlying core/cli helpers they wrap. The output is a single JSON object:

```ts
type InsightsReport = {
  generatedAt: string;
  project: { name?: string; root: string };
  health: { passed: boolean; signals: string[]; summary: string };
  entropy: { driftCount: number; deadFiles: number; deadExports: number };
  decay: { recentBumps: number; topAffected: string[] };
  attention: { activeThreadCount: number; staleThreadCount: number };
  impact: { recentBlastRadius: { node: string; affected: number }[] };
  warnings: string[]; // for any sub-component that failed to gather
};
```

When the CLI is invoked without `--json`, the report renders as a colourised, sectioned text block (one row per top-level key). When invoked with `--json`, it stdout-pipes JSON for tooling.

**Alternatives rejected:**

- _Build a new "insights" data store_ — duplicative; existing surfaces already produce these signals.
- _Run the dashboard server in-process to reuse routes_ — too heavy for a CLI invocation.

**Evidence:** existing `gather/health.ts`, `gather/decay-trends.ts`; `health-snapshot.ts` already exposes structured signals; parent A1 description "compose existing entropy/decay/attention/impact/health views into one summary view".

### D5 — Index file lives at `.harness/search-index.sqlite`, ignored by git (parent K2)

Path: `<project>/.harness/search-index.sqlite` plus the FTS5 sidecar files SQLite creates (`-wal`, `-shm`). All three added to `.gitignore` via the project's existing harness-ignore patterns. The file is durable across runs; corruption recovery = `harness search --reindex` rebuilds from `.harness/archive/sessions/`.

**Alternatives rejected:**

- _Per-session sqlite files_ — query fan-out cost defeats the point of a global ranked search.
- _Index in `.harness/cache/`_ — `cache/` is operator-cleanable; the index needs durability across `cleanup-sessions` runs. Treating it as data, not cache, is the cleaner model. Phase 2's cleanup expansion (A9) can add an explicit `--reset-index` flag if needed.

**Evidence:** existing `.harness/` layout (sessions, archive, knowledge, hooks, security all live there as durable data).

### D6 — MCP tier assignment (parent integration §"Registrations Required")

- `search_sessions` → tier `core` (always available; pure read-only; no token spend).
- `summarize_session` → tier `standard` (manual re-summary mode; LLM-spend implication).
- `insights_summary` → tier `core` (read-only composition over existing surfaces).

Rationale: agents need search-by-default for context recall; explicit summarization is a deliberate ask; insights is cheap and aggregating.

**Alternatives rejected:**

- _All three at `full` tier_ — gates too much value behind the highest tier.
- _`search_sessions` at `standard`_ — drops it from `core`-tier installs, which is the audience that benefits most.

**Evidence:** existing `packages/cli/src/mcp/tool-tiers.ts` tier definitions.

---

## Technical Design

### Module layout

```
packages/core/src/state/
├── session-search.ts             # NEW: FTS5 index lifecycle (open, upsert, search, reindex)
├── session-search.test.ts        # NEW
├── session-summary-llm.ts        # NEW: structured LLM summary generator
├── session-summary-llm.test.ts   # NEW
├── session-archive.ts            # MODIFY: invoke summary + index hook
└── (no other changes)

packages/cli/src/
├── commands/search.ts            # NEW: `harness search` command
├── commands/search.test.ts       # NEW
├── commands/insights.ts          # NEW: `harness insights` command
├── commands/insights.test.ts     # NEW
├── commands/_registry.ts         # MODIFY: register both
├── mcp/tools/search-sessions.ts  # NEW
├── mcp/tools/summarize-session.ts# NEW
├── mcp/tools/insights-summary.ts # NEW
├── mcp/tools/*.test.ts           # NEW (one per tool)
├── mcp/server.ts                 # MODIFY: register tools
└── mcp/tool-tiers.ts             # MODIFY: tier assignments

packages/types/src/
└── hermes.ts                     # NEW: HermesConfig, InsightsReport, SessionSummary types

packages/orchestrator/src/agent/
└── intelligence-factory.ts       # READ-ONLY (consumed by session-summary-llm)

packages/dashboard/src/server/
└── gather/insights.ts            # NEW: composer for the InsightsReport shape (reused by CLI)
```

### Data flow

```
                  ┌────────────────────────────────┐
                  │   archiveSession(slug)         │
                  │   (existing — session-archive) │
                  └─────────┬──────────────────────┘
                            │ move sessions/<slug> → archive/sessions/<slug>-<date>
                            ▼
              ┌─────────────────────────────────────┐
              │ summarizeArchivedSession()          │
              │ - load: summary.md / learnings.md / │
              │   failures.md / session-sections.md │
              │ - truncate to inputBudgetTokens      │
              │ - AnalysisProvider.analyze<Summary>  │
              │ - write llm-summary.md               │
              └─────────────┬───────────────────────┘
                            ▼
              ┌─────────────────────────────────────┐
              │ indexArchivedSession()              │
              │ - open .harness/search-index.sqlite │
              │ - upsert rows for each file_kind     │
              │ - mark `archived = 1`                │
              └─────────────────────────────────────┘

  harness search "<q>"           harness insights
        │                              │
        ▼                              ▼
  queryIndex(q, opts)        composeInsights({ ... })
  → bm25-ranked rows         → InsightsReport JSON
                             → renders as text or --json
```

### FTS5 schema (D1)

```sql
-- Container table holds metadata + body; FTS table is content-mirrored.
CREATE TABLE IF NOT EXISTS session_docs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL,
  archived     INTEGER NOT NULL,            -- 0 | 1
  file_kind    TEXT NOT NULL,               -- summary | learnings | failures | sections | llm_summary
  path         TEXT NOT NULL,
  mtime_ms     INTEGER NOT NULL,
  body         TEXT NOT NULL,
  UNIQUE (session_id, archived, file_kind)
);

CREATE VIRTUAL TABLE IF NOT EXISTS session_docs_fts USING fts5 (
  body,
  content='session_docs',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

-- Triggers keep FTS in sync with the container table.
CREATE TRIGGER IF NOT EXISTS session_docs_ai
  AFTER INSERT ON session_docs
  BEGIN INSERT INTO session_docs_fts(rowid, body) VALUES (new.id, new.body); END;
CREATE TRIGGER IF NOT EXISTS session_docs_ad
  AFTER DELETE ON session_docs
  BEGIN INSERT INTO session_docs_fts(session_docs_fts, rowid, body) VALUES('delete', old.id, old.body); END;
CREATE TRIGGER IF NOT EXISTS session_docs_au
  AFTER UPDATE ON session_docs
  BEGIN
    INSERT INTO session_docs_fts(session_docs_fts, rowid, body) VALUES('delete', old.id, old.body);
    INSERT INTO session_docs_fts(rowid, body) VALUES (new.id, new.body);
  END;

PRAGMA journal_mode = WAL;
```

### LLM summary Zod schema (D3)

```ts
export const SessionSummarySchema = z.object({
  headline: z.string().min(1).max(120),
  keyOutcomes: z.array(z.string()).max(20),
  openQuestions: z.array(z.string()).max(20),
  relatedSessions: z.array(z.string()).default([]),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
```

Persisted as `llm-summary.md` with frontmatter:

```markdown
---
generatedAt: 2026-05-17T10:32:11Z
model: claude-sonnet-4-6
inputTokens: 6132
outputTokens: 421
schemaVersion: 1
---

## Headline

<headline>

## Key outcomes

- <outcome 1>
- ...

## Open questions

- <question 1>
- ...

## Related sessions

- <slug>
- ...
```

### `harness search` CLI shape

```
Usage: harness search [options] <query>

Search archived and live session content using SQLite FTS5.

Options:
  -n, --limit <n>        Max results (default 20)
  --archived-only        Skip live sessions
  --json                 Output JSON instead of pretty text
  --reindex              Drop and rebuild the index before searching
  --file-kinds <list>    Comma-separated subset of {summary,learnings,failures,sections,llm_summary}
  -h, --help

Examples:
  harness search "constraint lock format"
  harness search --archived-only "false positive INJ-REROL"
  harness search --json --limit 5 webhook
```

Output (pretty mode):

```
Results for "constraint lock"  (3 matches, 27 ms)

  1.  hermes-phase-0-gateway-api-2026-05-14   [archived, llm_summary]
      …implemented hashed constraint lock with audit log…
  2.  inj-rerol-003-false-positive-2026-05-12  [archived, learnings]
      …constraint lock skipped reroll on docs paths…
  3.  framework-bootstrap-2026-03-22            [archived, summary]
      …constraint lock format reached convergence…
```

### `harness insights` CLI shape

```
Usage: harness insights [options]

Composite report combining health, entropy, decay, attention, and impact.

Options:
  --json               Emit JSON
  --skip <list>        Comma-separated keys to skip {health,entropy,decay,attention,impact}
  -h, --help
```

### MCP tool shapes

```ts
// search_sessions
inputSchema: {
  query: string;
  limit?: number; // default 20
  archivedOnly?: boolean;
  fileKinds?: ('summary'|'learnings'|'failures'|'sections'|'llm_summary')[];
}
output: { matches: Array<{ sessionId, archived, fileKind, path, bm25, snippet }>; durationMs; totalIndexed }

// summarize_session
inputSchema: { sessionId: string; force?: boolean }
output: { headline; keyOutcomes; openQuestions; relatedSessions; model; tokenUsage }

// insights_summary
inputSchema: { skip?: ('health'|'entropy'|'decay'|'attention'|'impact')[] }
output: InsightsReport // see D4
```

### Config schema additions

`packages/types/src/orchestrator.ts` — extend `WorkflowConfig` with:

```ts
hermes?: {
  enabled?: boolean;          // default true
  summary?: {
    enabled?: boolean;        // default: true if intelligence.enabled else false
    inputBudgetTokens?: number; // default 16000
    timeoutMs?: number;       // default 60000
    model?: string;           // optional override; falls back to agent.model
  };
  search?: {
    indexedFileKinds?: ('summary'|'learnings'|'failures'|'sections'|'llm_summary')[];
                              // default: all five
    maxIndexBytesPerFile?: number; // default 256 KiB; larger files truncated with marker
  };
};
```

The schema lives in `packages/types/src/hermes.ts` and is re-exported from `packages/types/src/index.ts`. Validation is centralised in the existing config loader (no new validator binary).

---

## Integration Points

### Entry Points

**CLI:**

- `harness search [options] <query>` (new)
- `harness insights [options]` (new)

**MCP tools:**

- `search_sessions` (tier: `core`)
- `summarize_session` (tier: `standard`)
- `insights_summary` (tier: `core`)

**Lifecycle hooks:**

- `archiveSession()` → `summarizeArchivedSession()` → `indexArchivedSession()` (sequential, all best-effort after the move succeeds)

**No new API routes.** Dashboard pages are deferred (see "Out-of-scope"); when they ship in Phase 1.1, they reuse Phase 0's `/api/v1/` infra.

### Registrations Required

| Registry                                           | Update                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `packages/cli/src/commands/_registry.ts`           | Add `createSearchCommand`, `createInsightsCommand`                   |
| `packages/cli/src/mcp/server.ts`                   | Register `search_sessions`, `summarize_session`, `insights_summary`  |
| `packages/cli/src/mcp/tool-tiers.ts`               | Tier assignments per D6                                              |
| `packages/types/src/index.ts`                      | Re-export `./hermes`                                                 |
| `packages/types/src/orchestrator.ts`               | Add `hermes?: HermesConfig` to `WorkflowConfig`                      |
| `harness.config.json` (example/schema)             | Add commented `hermes` example block                                 |
| `.gitignore` (project + template)                  | Ignore `.harness/search-index.sqlite*` (3 files: db, wal, shm)       |
| Plugin manifests (claude/cursor/codex/gemini/etc.) | Re-run `harness generate-slash-commands`; surface new MCP tool names |

### Documentation Updates

- `docs/knowledge/core/session-search.md` — index lifecycle, FTS5 query semantics, reindex procedure
- `docs/knowledge/core/session-summarization.md` — summary trigger, schema, failure mode, opt-out
- `docs/knowledge/decisions/hermes-phase-1-session-memory-architecture.md` — the ADR
- `AGENTS.md` — append a "Session Search & Insights (Phase 1)" subsection under existing harness command/tool listings
- `CHANGELOG.md` — entry under the next release (the changeset file lives at `.changeset/hermes-phase-1-session-search.md`)
- `README.md` — append one bullet under "Key Features" listing the new `harness search` / `harness insights` commands
- `examples/` — no new example required this phase (CLI is self-describing)

### Architectural Decisions (ADR)

One ADR — covered by D1+D3 combined:

- **ADR — Session memory architecture (Phase 1).** SQLite FTS5 + LLM auto-summary on archive. Index at `.harness/search-index.sqlite`, structured Zod-validated summary at `<archive>/llm-summary.md`. Rationale: cheapest viable index with no new runtime dep; provider-agnostic summary via existing `AnalysisProvider`; degrades gracefully when provider unavailable.

Lives at `docs/knowledge/decisions/hermes-phase-1-session-memory-architecture.md`.

### Knowledge Impact

**New `business_concept` nodes (ingested via `harness:knowledge-pipeline` after merge):**

- Session search index
- Session LLM summary
- Insights aggregator report

**New `business_process` nodes:**

- Session archive → summary → index flow
- Search query → BM25 ranking → results

**New `business_rule` nodes:**

- Summary failure is non-fatal; archive must still complete.
- Index update is non-fatal; archive must still complete.
- Search index re-build is idempotent; `--reindex` drops & rebuilds from `.harness/archive/sessions/`.
- `keyContext` is operator/agent-controlled; `llm-summary.md` is retrospective and additive.

**New relationships:**

- `archiveSession` _triggers_ Session summary
- `archiveSession` _triggers_ Session indexing
- Insights aggregator _composes_ {Health, Entropy, Decay, Attention, Impact}
- Search index _shares storage layer with_ Webhook queue (both `better-sqlite3` WAL)

---

## Success Criteria

### Acceptance criteria (mechanical)

1. **Index round-trip.** Archiving a session writes the expected rows; querying with a known term returns that session ranked first. Verified by integration test that archives a fixture, queries, asserts ranking.
2. **Summary degradation.** With no `intelligence` provider configured, archive completes; no `llm-summary.md` written; no error thrown. Verified by integration test.
3. **Summary success path.** With a mocked `AnalysisProvider` returning a valid Zod payload, archive writes a well-formed `llm-summary.md` with frontmatter. Verified by integration test.
4. **CLI `harness search` returns results within 200 ms** over a fixture of 100 archived sessions (we calibrate with a generated corpus in the test). Verified by perf test gated in CI.
5. **CLI `harness insights` returns a structured report.** All five top-level keys present even if a sub-component fails (the failed key carries a `warnings[]` entry). Verified by integration test that mocks one sub-component to throw.
6. **MCP tools registered and discoverable.** `harness setup-mcp --list` shows the three new tools at the expected tiers. Verified by snapshot test.
7. **No new runtime deps.** `pnpm install --frozen-lockfile` after the merge does not pull in any package not present today. Verified by lockfile-diff CI step.
8. **Cross-platform CI green.** `better-sqlite3` FTS5 binary is exercised on Linux + macOS + Windows in CI. Verified by existing matrix.
9. **No backwards-incompatible config changes.** Existing `harness.config.json` files without a `hermes` section continue to work; `harness validate` passes. Verified by regression suite.

### Observable outcome (parent meta-spec headline)

- p95 search latency < 200 ms over corpus of 1000+ archived sessions.
- Session summary auto-generated for 100 % of cleanly-closed sessions (when intelligence enabled).
- `harness insights` returns composite report in < 5 s.

### Phase-readiness gates

| Gate                                                             | Required |
| ---------------------------------------------------------------- | -------- |
| `harness validate` passes                                        | ✓        |
| `harness:verification` three-tier (EXISTS / SUBSTANTIVE / WIRED) | ✓        |
| `harness check-arch` clean                                       | ✓        |
| `harness check-deps` clean                                       | ✓        |
| ADR merged to `docs/knowledge/decisions/`                        | ✓        |
| Knowledge nodes ingested via `harness:knowledge-pipeline`        | ✓        |
| `AGENTS.md` updated                                              | ✓        |
| CHANGELOG entry                                                  | ✓        |
| `harness:soundness-review` passed on this spec                   | ✓        |

---

## Implementation Order

Five execution sub-phases, each landing as a checkpoint inside the single phase delivery. Sub-phase 5 (dashboard UI) is deferred to a follow-up roadmap item (`hermes-phase-1.1-dashboard-ui`).

### Sub-phase 1 — Storage & indexer (~2 days)

- Add `packages/types/src/hermes.ts` with `HermesConfig`, `IndexedFileKind`, `InsightsReport`, `SessionSummary` types.
- Wire `WorkflowConfig.hermes?: HermesConfig`.
- Implement `packages/core/src/state/session-search.ts`:
  - `openSearchIndex(projectPath): SearchIndex` (idempotent open + migration)
  - `upsertSessionDoc(idx, doc): void`
  - `removeSession(idx, sessionId): void`
  - `searchSessions(idx, query, opts): { matches; durationMs; totalIndexed }`
  - `reindexFromArchive(projectPath): ReindexStats`
- Unit tests against in-memory SQLite (`:memory:`).
- `.gitignore` entries for the index files.

### Sub-phase 2 — LLM summary + archive hook (~1.5 days)

- Implement `packages/core/src/state/session-summary-llm.ts`:
  - `summarizeArchivedSession({ archiveDir, provider, config }): Result<SessionSummary, Error>`
  - Truncation helper that respects `inputBudgetTokens` (approximate via 4 chars/token).
  - `writeLlmSummaryMarkdown(archiveDir, summary, meta): void`
- Modify `packages/core/src/state/session-archive.ts`: call summary + index hook after a successful move. Both calls wrapped in try/catch; failures logged but non-fatal. Provider + config injected via a thin `SessionArchiveContext` interface so tests can pass a stub.
- Integration tests: provider success, provider missing, provider throws, schema validation fails.

### Sub-phase 3 — CLI `harness search` + MCP `search_sessions` / `summarize_session` (~1 day)

- `packages/cli/src/commands/search.ts` — Commander command, calls into `searchSessions`.
- Register in `packages/cli/src/commands/_registry.ts`.
- `packages/cli/src/mcp/tools/search-sessions.ts` + `summarize-session.ts` — wrap core helpers.
- Register in `mcp/server.ts` + `mcp/tool-tiers.ts`.
- Integration tests; snapshot test for `setup-mcp --list` output.

### Sub-phase 4 — `harness insights` + MCP `insights_summary` (~1 day)

- Implement `packages/dashboard/src/server/gather/insights.ts` (composer over existing `gather/health.ts`, `gather/decay-trends.ts`, etc.). The composer is moved into a path importable from `packages/cli` without booting the dashboard server — likely promoted to a new `packages/core/src/insights/` module if the existing gather modules cannot be imported cleanly. Spike during sub-phase 4.
- `packages/cli/src/commands/insights.ts` — Commander command + pretty renderer.
- `packages/cli/src/mcp/tools/insights-summary.ts`.
- Register in `_registry.ts`, `mcp/server.ts`, `mcp/tool-tiers.ts`.
- Integration tests with sub-component failure injection.

### Sub-phase 5 — Documentation, plugin regen, knowledge docs, ADR, changeset (~0.5 days)

- Author `docs/knowledge/core/session-search.md`, `session-summarization.md`, the ADR.
- Update `AGENTS.md`, `README.md`, `CHANGELOG.md` (via changeset).
- Run `harness generate-slash-commands` to refresh plugin manifests.
- Run `harness validate`, `harness check-arch`, `harness check-deps`.
- Run `harness:knowledge-pipeline` to ingest new nodes; verify graph picks up the new business_concept/process/rule entries.

### Deferred to follow-up roadmap item (`hermes-phase-1.1-dashboard-ui`)

- `packages/dashboard/src/client/pages/Search.tsx` + `Insights.tsx`
- `SYSTEM_PAGES` + `SYSTEM_PAGE_COMPONENTS` registrations
- Dashboard route additions

### Estimated effort

Sub-phases 1–5: ~5–6 working days. Below the parent spec's 3–4 week ceiling because the UI piece is deferred and SQLite/FTS5 are well-trodden territory in harness already.

---

## Risks & Mitigations

| Risk                                                     | Mitigation                                                                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `better-sqlite3` FTS5 not compiled in on some platform   | Existing matrix CI runs Linux + macOS + Windows; add explicit FTS5 sanity test at index open                                                   |
| LLM summary cost runaway on archive of huge sessions     | `inputBudgetTokens` cap + truncation marker; `hermes.summary.enabled = false` is the operator escape hatch                                     |
| Index staleness across parallel sessions                 | Archive is the only writer; live sessions never index; reindex is idempotent. Multiple parallel archives serialize via WAL                     |
| Adopting K2 mid-flight breaks the existing summary UX    | Walked back parent spec's "`keyContext` becomes LLM-populated" — summary is additive only (see Non-goals)                                      |
| Provider misconfig leaves summary silently disabled      | `harness doctor` extension (Phase 3, A7) will detect "summary expected but provider not reachable"; for now, `harness search --diagnose` warns |
| Index file corruption                                    | `harness search --reindex` rebuilds from `.harness/archive/sessions/`; deletion of the file is safe (recreated on next archive)                |
| Insights aggregator hard-couples to dashboard `gather/*` | If clean import fails, promote the composer to `packages/core/src/insights/` during sub-phase 4 spike (decision recorded in plan)              |
| `keyContext` confusion (operator vs LLM summary)         | Non-goal #3 + knowledge doc explicitly contrasts the two surfaces                                                                              |

---

## Open Questions (resolved before plan approval)

- **Where does the insights composer live?** — Sub-phase 4 spike decides between `packages/dashboard/src/server/gather/insights.ts` (if importable from CLI without booting the server) vs. `packages/core/src/insights/index.ts` (if a clean lift is needed). Default: try gather first; promote if needed.
- **Which file_kinds index by default?** — All five (`summary`, `learnings`, `failures`, `sections`, `llm_summary`). Operator overrides via `hermes.search.indexedFileKinds`.
- **Pre-existing archives — do we backfill summaries?** — No. Only sessions archived after merge get summaries. `harness search --reindex` covers index backfill; summary backfill is a watch item.
- **Should the summary be the same model as the agent?** — Default yes (`config.agent.model`); operator can override via `hermes.summary.model`. Rationale: summaries are short, latency-sensitive, and benefit from being colocated on the same provider for cost telemetry consistency.

---

## Traceability

- Parent meta-spec: `docs/changes/hermes-adoption/proposal.md` — Phase 1 section
- Roadmap item: `hermes-phase-1-session-search` (github:Intense-Visions/harness-engineering#311)
- Items covered by this spec: **K2** (FTS5 session search + auto-summarization), **A1** (insights aggregator)
- Items deferred to follow-up: dashboard UI pages → new roadmap item `hermes-phase-1.1-dashboard-ui`
- No reject-list items re-enter scope.
