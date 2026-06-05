# Storage Conventions — Claude-Mem Pattern Adoption

**Parent:** [Claude-Mem Pattern Adoption](../proposal.md)

This document describes the storage patterns, access characteristics, and future migration path for all data stores introduced by the claude-mem pattern adoption project. It is documentation, not code — no runtime interface exists yet.

## 1. File Inventory

| Pattern                | File                  | Constant              | Format                                                          | Write                | Read                         | Scope                             |
| ---------------------- | --------------------- | --------------------- | --------------------------------------------------------------- | -------------------- | ---------------------------- | --------------------------------- |
| Progressive Disclosure | `learnings.md`        | `LEARNINGS_FILE`      | Markdown with `<!-- hash:XXX tags:a,b -->` frontmatter comments | Append-only (locked) | Full scan + index extraction | Global + session                  |
| Content Deduplication  | `content-hashes.json` | `CONTENT_HASHES_FILE` | JSON object (`ContentHashIndex`)                                | Read-modify-write    | Key lookup by hash           | Global + session (learnings only) |
| Structured Event Log   | `events.jsonl`        | `EVENTS_FILE`         | JSONL (one `SkillEvent` JSON object per line)                   | Append-only          | Tail-read (most recent N)    | Global + session                  |
| AST Code Navigation    | (none)                | —                     | In-memory tree-sitter parser cache                              | —                    | Read-only (source files)     | Process lifetime                  |

> **Note:** `content-hashes.json` backs **learnings dedup only**. Event dedup uses an in-memory hash set rebuilt from `events.jsonl` on first access — see §3 for the split.

### File Locations

```
.harness/
├── learnings.md              # Global learnings (append-only, with frontmatter)
├── content-hashes.json       # Global content hash index
├── events.jsonl              # Global event log
└── sessions/
    └── <slug>/
        ├── learnings.md      # Session-scoped learnings
        ├── content-hashes.json   # Session-scoped hash index
        └── events.jsonl      # Session-scoped event log
```

All paths resolve through the state module constants in `packages/core/src/state/constants.ts`. Some call sites (`learnings.ts`) import `LEARNINGS_FILE` via the re-export in `state-shared.ts` rather than directly from `constants.ts`; both routes are equivalent.

## 2. Access Patterns

### learnings.md

- **Write:** `appendLearning()` appends a dated markdown bullet with `<!-- hash:XXX tags:a,b -->` frontmatter comment preceding the entry. Each write first checks `content-hashes.json` for duplicates.
- **Read (index scan):** `loadIndexEntries()` extracts `LearningsIndexEntry` objects (hash, tags, first-line summary, full text, optional `rootCause` / `triedAndFailed`) without invoking the relevance scorer. Used when `depth: "index"`.
- **Read (full):** `loadBudgetedLearnings()` loads entries with relevance scoring against an intent string, within a token budget. Used when `depth: "summary"` (default) or `depth: "full"`.
- **Concurrency:** Protected by a file-based lock (`learnings.md.lock` opened with `O_CREAT | O_EXCL | O_WRONLY`, with bounded exponential backoff — 3 retries at 50/100/200 ms). The lock spans the dedup-check + append + `content-hashes.json` update so concurrent writers serialize cleanly. Single-process workloads pay one extra `open`/`unlink` per append; multi-process workloads serialize correctly.
- **Corruption recovery:** Entries without frontmatter are treated as valid (backward compatible). `parseFrontmatter()` returns `null` for malformed frontmatter — the entry is included but not indexed.

### content-hashes.json

- **Write:** `saveContentHashes()` writes the entire `ContentHashIndex` object. This is a read-modify-write pattern — the file is loaded, modified in memory, and written back.
- **Read:** `loadContentHashes()` reads the full file, returns `{}` if missing or invalid.
- **Concurrency:** NOT safe for concurrent writes. Two writers will race, and the last write wins. Acceptable because harness sessions are single-writer.
- **Corruption recovery:** If the file is missing, corrupted, or has invalid JSON, `rebuildContentHashes()` scans `learnings.md` to reconstruct the index. This is triggered automatically on first access when the sidecar is absent.

### events.jsonl

- **Write:** `emitEvent()` appends a single JSON line with `\n` terminator. Content hash computed from `{skill}|{type}|{summary}|{session}` to prevent duplicates within a session.
- **Read:** `loadEvents()` reads the file, parses each line as JSON, filters by type/session, and returns the most recent N events. `formatEventTimeline()` renders events as a compact markdown timeline.
- **Dedup store:** Events do **not** share `content-hashes.json` with learnings. Instead, `emitEvent` maintains an in-memory `Map<eventsPath, Set<contentHash>>` (`knownHashesCache`), populated lazily from `events.jsonl` on first access per process. The JSONL file is self-describing — each line carries its own `contentHash` — so no sidecar is needed for recovery.
- **Concurrency:** Append-only JSONL is safe for concurrent writers at the OS level (each write is a single `appendFile` call) — no file lock is taken. Partial writes result in an incomplete final line, which is skipped during parsing. The deliberate asymmetry vs `learnings.md` (which does lock) reflects that events have no read-modify-write step and that the dedup cache is per-process, so cross-process duplicates are tolerated.
- **Corruption recovery:** Lines that fail `JSON.parse()` are silently skipped. No self-healing rebuild needed — the format is inherently corruption-tolerant.

### AST Parser Cache

- **Storage:** In-memory only. `ParserCache` in `packages/core/src/code-nav/parser.ts` holds initialized tree-sitter `Parser` instances keyed by language.
- **Lifecycle:** Created on first use, persists for process lifetime. No file I/O.
- **Concurrency:** Singleton pattern. Multiple callers share the same cache instance.
- **Recovery:** If WASM loading fails for a language, the parser is not cached and fallback to raw file content is used.

## 3. Shared Utilities

### Content Hashing

Hashing utilities live in `packages/core/src/state/learnings-content.ts` (split out of `learnings.ts` to keep the blast radius small). Two distinct hash schemes coexist by design — both are slices of SHA-256:

```typescript
// packages/core/src/state/learnings-content.ts

// 16-char hex hash of NORMALIZED content. Used for cross-entry dedup
// (learnings: in content-hashes.json; events: in the in-memory cache).
export function computeContentHash(text: string): string;

// 8-char hex hash of RAW entry text. Used only for the per-entry
// `<!-- hash:XXX -->` frontmatter comment in learnings.md.
export function computeEntryHash(text: string): string;

export function normalizeLearningContent(text: string): string;
// Strips date prefixes, skill/outcome/root_cause/tried tags, list/bold markers;
// lowercases; collapses whitespace. Applied only to learnings dedup, not events.
```

| Use site                              | Function             | Input                                                               | Width  |
| ------------------------------------- | -------------------- | ------------------------------------------------------------------- | ------ |
| Learnings dedup (cross-entry)         | `computeContentHash` | normalized learning text                                            | 16 hex |
| Events dedup (cross-entry)            | `computeContentHash` | `${skill}\|${type}\|${summary}\|${session}` (raw, no normalization) | 16 hex |
| Learnings frontmatter (per-entry tag) | `computeEntryHash`   | full bullet line, as-emitted                                        | 8 hex  |

Both dedup paths funnel into `computeContentHash`, so the _function_ is shared — but the _persistence story_ is not (learnings persists hashes to `content-hashes.json`; events caches them in-memory and re-derives from JSONL on cold start).

### Token Estimation

```typescript
// packages/core/src/state/learnings.ts (internal)
function estimateTokens(text: string): number;
// Math.ceil(text.length / 4) — fast approximation, no tokenizer dependency
```

Used by `loadBudgetedLearnings()` and `gather_context` to respect token budgets.

## 4. StorageBackend Interface Sketch

A conceptual interface for future unification. Not implemented — exists here as a design target.

```typescript
import type { Result } from '@harness-engineering/types';

type Depth = 'index' | 'summary' | 'full';

interface LearningEntry {
  content: string;
  skill?: string;
  outcome?: string;
  tags?: string[];
}

interface LearningsIndexEntry {
  hash: string; // 8-char entry hash (computeEntryHash on full bullet)
  tags: string[]; // skill + outcome tags extracted from [skill:X]/[outcome:Y]
  summary: string; // first line of the entry
  fullText: string; // full entry text — needed by the relevance scorer
  rootCause?: string; // optional [root_cause:X] tag
  triedAndFailed?: string[]; // optional [tried:a,b,c] tag, split on comma
}

interface StorageBackend {
  // --- Learnings ---
  appendLearning(entry: LearningEntry): Promise<Result<{ written: boolean; reason?: string }>>;
  queryLearnings(
    intent: string,
    options: {
      depth: Depth;
      budget: number;
      skill?: string;
      session?: string;
    }
  ): Promise<Result<string[]>>;
  loadIndex(): Promise<Result<LearningsIndexEntry[]>>;

  // --- Events ---
  emitEvent(
    event: EmitEventInput,
    options?: {
      session?: string;
      stream?: string;
    }
  ): Promise<Result<{ written: boolean; reason?: string }>>;
  queryEvents(options: {
    session?: string;
    limit?: number;
    types?: EventType[];
    since?: string;
  }): Promise<Result<SkillEvent[]>>;

  // --- Dedup ---
  hasContent(hash: string): Promise<boolean>;
  registerContent(hash: string, metadata: ContentHashEntry): Promise<void>;
  rebuildIndex(): Promise<void>;
}
```

### Implementation Notes

- A `FlatFileBackend` would be a thin wrapper around the existing functions in `learnings.ts` and `events.ts`.
- A `SQLiteBackend` would replace file I/O with prepared statements against a local `.harness/harness.db` file.
- The `Result<T, E>` pattern is already the project standard — all backend methods should return `Result` types.
- Session scoping is handled by the caller (passing `session` option), not by the backend. The backend writes to whichever path it's configured with.

## 5. SQLite Migration Notes

### Table Mappings

| Flat File             | SQLite Table              | Schema                                                                                                                                                                                                             | Notes                                                                                                                                                                                                                                                        |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `learnings.md`        | `learnings`               | `id INTEGER PRIMARY KEY, content TEXT NOT NULL, content_hash TEXT UNIQUE NOT NULL, entry_hash TEXT NOT NULL, tags TEXT, skill TEXT, outcome TEXT, root_cause TEXT, tried_and_failed TEXT, timestamp TEXT NOT NULL` | FTS5 virtual table on `content` for full-text search. `content_hash` (16-hex, normalized) replaces `content-hashes.json`. `entry_hash` (8-hex, raw) preserves the frontmatter tag for migration round-trips. `tried_and_failed` stored as JSON array string. |
| `content-hashes.json` | (merged into `learnings`) | —                                                                                                                                                                                                                  | The `content_hash` UNIQUE constraint on `learnings` table handles learnings dedup. No separate table needed.                                                                                                                                                 |
| `events.jsonl`        | `events`                  | `id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, skill TEXT NOT NULL, session TEXT, type TEXT NOT NULL, summary TEXT NOT NULL, data TEXT, refs TEXT, content_hash TEXT UNIQUE`                                    | Index on `(session, timestamp)`. `data` and `refs` stored as JSON strings. The `content_hash UNIQUE` constraint replaces the in-memory `knownHashesCache` and the JSONL cold-load scan.                                                                      |

### Migration Steps

1. **Implement `StorageBackend` interface** with a `SQLiteBackend` class using `better-sqlite3` (synchronous, no async overhead for local DB).
2. **Write migration script** that:
   - Reads `learnings.md`, parses entries with frontmatter, inserts into `learnings` table
   - Reads `events.jsonl`, parses each line, inserts into `events` table
   - Skips entries where `hash`/`content_hash` already exists (idempotent)
3. **Add backend selection** to `packages/core/src/state/constants.ts` — environment variable or `.harness/config.json` flag to choose `flat-file` vs `sqlite`.
4. **Swap callers** — `appendLearning()`, `loadBudgetedLearnings()`, `emitEvent()`, `loadEvents()` delegate to the configured backend.
5. **Keep flat files as fallback** — if `better-sqlite3` is not installed or the DB file can't be opened, fall back to flat files silently.
6. **Deprecation timeline** — flat files remain the default until SQLite backend is proven stable. No removal planned.

### What SQLite Enables

- **Full-text search** on learnings content (FTS5) — replaces keyword matching with proper relevance ranking
- **Efficient range queries** on events by timestamp — no need to parse entire JSONL
- **Atomic transactions** — dedup check + insert in a single transaction, eliminating race conditions
- **Structured queries** — `SELECT * FROM events WHERE type = 'gate_result' AND session = ?` vs JSONL line scanning

### What SQLite Does NOT Enable (Yet)

- **Vector search / embeddings** — requires a separate extension (e.g., sqlite-vss) or external service. Out of scope for initial migration.
- **Cross-project queries** — each project has its own `.harness/` directory. Federated queries require a higher-level orchestrator.

## 6. Data Lifecycle

| Store                 | Retention                    | Pruning                                          | Archival                                           |
| --------------------- | ---------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| `learnings.md`        | Indefinite (pruned manually) | `pruneLearnings()` archives entries >14 days old | `archiveLearnings()` moves to `learnings-archive/` |
| `content-hashes.json` | Mirrors `learnings.md`       | Rebuilt on demand                                | No separate archival                               |
| `events.jsonl`        | Indefinite                   | Not yet implemented                              | Planned: archive events older than N days          |
| Parser cache          | Process lifetime             | Garbage collected on process exit                | N/A                                                |

### Recommended Future Work

1. **Event pruning** — Add `pruneEvents(projectPath, { olderThan: days })` to archive old events, similar to `pruneLearnings()`.
2. **Index compaction** — If `content-hashes.json` grows beyond 10K entries, consider switching to a more efficient lookup (sorted array with binary search, or SQLite migration).
3. **Event aggregation** — Summarize old events into daily/weekly rollups to reduce storage while preserving timeline visibility.
