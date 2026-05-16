# Session Search (Hermes Phase 1)

**Status:** shipped
**Spec:** [docs/changes/hermes-phase-1-session-search/proposal.md](../../changes/hermes-phase-1-session-search/proposal.md)
**ADR:** [0013-hermes-phase-1-session-memory-architecture.md](../decisions/0013-hermes-phase-1-session-memory-architecture.md)

## What it is

A SQLite FTS5 full-text index over the markdown content of every harness
session — both **live** (`.harness/sessions/<slug>/`) and **archived**
(`.harness/archive/sessions/<slug>-<date>/`). The index is read by the
`harness search "<query>"` CLI and the `search_sessions` MCP tool. It is
written by the archive lifecycle hook and rebuilt on demand via `harness
search --reindex`.

## Index lifecycle

```
┌────────────────────────────────┐
│   archiveSession(slug)         │  packages/core/src/state/session-archive.ts
└─────────┬──────────────────────┘
          │  rename(sessionDir → archiveDir)
          ▼
┌────────────────────────────────┐
│   buildArchiveHooks(...)       │  packages/orchestrator/src/sessions/archive-hooks.ts
│     → onArchived(...)          │
└─────────┬──────────────────────┘
          │  step 1 (best-effort): summarizeArchivedSession  → llm-summary.md
          │  step 2 (best-effort): indexSessionDirectory      → upsert rows
          ▼
┌────────────────────────────────┐
│   .harness/search-index.sqlite │
│     + -wal, -shm sidecars      │
└────────────────────────────────┘
```

Both steps inside the hook are individually `try/catch`-wrapped. Hook
failures are non-fatal: the archive itself has already succeeded by the
time the hook runs, so a flaky LLM provider or a corrupted index file can't
strand a session.

## FTS5 schema

One container table (`session_docs`) + one content-mirrored FTS5 virtual
table (`session_docs_fts`), kept in sync via three triggers (AI, AD, AU).
Tokenizer: `unicode61 remove_diacritics 2`. Ranking: `bm25()`. Snippet:
SQLite's `snippet()` with a 16-char window and `…` markers.

| Column       | Type    | Notes                                                                |
| ------------ | ------- | -------------------------------------------------------------------- |
| `id`         | INTEGER | autoincrement primary key                                            |
| `session_id` | TEXT    | session slug or `<slug>-<date>` for archived rows                    |
| `archived`   | INTEGER | `1` for archived sessions, `0` for live                              |
| `file_kind`  | TEXT    | one of `summary`, `learnings`, `failures`, `sections`, `llm_summary` |
| `path`       | TEXT    | path relative to project root, posix-style                           |
| `mtime_ms`   | INTEGER | `Math.floor(statSync(p).mtimeMs)`                                    |
| `body`       | TEXT    | file body, truncated to `maxBytesPerBody` (default 256 KiB)          |

`UNIQUE(session_id, archived, file_kind)` enforces one row per indexable
file inside a given session, so re-indexing the same session is idempotent
(upsert replaces the body in place).

## Query syntax

`harness search` and `search_sessions` accept the raw FTS5 query grammar.
For bare-word inputs the indexer auto-wraps each whitespace-separated token
as an FTS5 phrase, so hyphenated or punctuation-containing tokens
(`token-aleph`, `INJ-REROL-003`, `learnings.md`) are treated as content not
operators. Inputs that already contain advanced FTS5 syntax (any of `"`,
`(`, `)`, `*`, `^`, `+`, `AND`, `OR`, `NOT`, or a `column:` selector) are
passed through unchanged.

| Query                                                           | Meaning                                 |
| --------------------------------------------------------------- | --------------------------------------- |
| `harness search webhook delivery`                               | both terms (implicit AND)               |
| `harness search "constraint lock"`                              | exact phrase                            |
| `harness search "session" NOT "live"`                           | exact phrase minus another              |
| `harness search webhook OR signing`                             | either term                             |
| `harness search webhoo*`                                        | prefix match                            |
| `harness search webhook --archived-only --file-kinds learnings` | scope to one file kind on archived rows |

Pathological inputs (unmatched quote, syntax error) surface as `SqliteError`
in the CLI. Wrap your query in `"..."` if you want to be defensive.

## CLI

```
Usage: harness search [options] <query>

Options:
  -n, --limit <n>        Max results (default 20)
  --archived-only        Skip live sessions
  --json                 Emit JSON
  --reindex              Rebuild .harness/search-index.sqlite from archive before searching
  --file-kinds <list>    Comma-separated subset of {summary,learnings,failures,sections,llm_summary}
```

Examples:

```bash
harness search "INJ-REROL-003"                       # find that incident across all sessions
harness search --archived-only "constraint lock"     # historical retrievals only
harness search --json --limit 5 webhook              # machine-readable, top 5
harness search --reindex --json bm25                 # rebuild then query (recovery from corruption)
```

## MCP tool

`search_sessions` (tier: `core`). Input schema:

```json
{
  "path": "<project root>",
  "query": "<FTS5 query>",
  "limit": 20,
  "archivedOnly": false,
  "fileKinds": ["summary", "learnings", "failures", "sections", "llm_summary"]
}
```

Returns:

```json
{
  "matches": [
    {
      "sessionId": "...",
      "archived": true,
      "fileKind": "summary",
      "path": ".harness/archive/sessions/.../summary.md",
      "bm25": -3.42,
      "snippet": "…matched terms…"
    }
  ],
  "durationMs": 4,
  "totalIndexed": 137
}
```

Lower `bm25` = better match (SQLite's convention).

## Config

```jsonc
{
  "hermes": {
    "search": {
      "indexedFileKinds": ["summary", "learnings", "failures", "sections", "llm_summary"],
      "maxIndexBytesPerFile": 262144,
    },
  },
}
```

Defaults are sensible — omit the block entirely and search "just works"
after the next session archive.

## Recovery & troubleshooting

| Symptom                                 | Action                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `harness search` returns no results     | run with `--reindex` to rebuild from `.harness/archive/sessions`        |
| FTS5 syntax error                       | wrap your query in `"..."` to escape advanced FTS5 grammar              |
| Index file looks corrupted              | delete `.harness/search-index.sqlite*` — it'll be recreated             |
| Want to confirm the index is up-to-date | `harness search --reindex --json '*' --limit 1` and read `totalIndexed` |
| Process can't open the DB on Windows    | another harness/orchestrator process holds a writer lock                |

## Related

- [Session summarization](./session-summarization.md) — companion that
  writes `llm-summary.md` alongside the archive, which then participates in
  the index.
- [State management](./state-management.md) — the broader session
  lifecycle.
- [Phase 3 webhook queue](../orchestrator/webhook-fanout.md) — same
  `better-sqlite3` + WAL pattern at a different name.
