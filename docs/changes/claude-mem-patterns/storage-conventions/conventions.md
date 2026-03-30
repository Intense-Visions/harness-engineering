# Storage Conventions — Claude-Mem Pattern Adoption

**Parent:** [Claude-Mem Pattern Adoption](../proposal.md)

This document describes the storage patterns, access characteristics, and future migration path for all data stores introduced by the claude-mem pattern adoption project. It is documentation, not code — no runtime interface exists yet.

## 1. File Inventory

| Pattern                | File                  | Constant              | Format                                                          | Write             | Read                         | Scope            |
| ---------------------- | --------------------- | --------------------- | --------------------------------------------------------------- | ----------------- | ---------------------------- | ---------------- |
| Progressive Disclosure | `learnings.md`        | `LEARNINGS_FILE`      | Markdown with `<!-- hash:XXX tags:a,b -->` frontmatter comments | Append-only       | Full scan + index extraction | Global + session |
| Content Deduplication  | `content-hashes.json` | `CONTENT_HASHES_FILE` | JSON object (`ContentHashIndex`)                                | Read-modify-write | Key lookup by hash           | Global + session |
| Structured Event Log   | `events.jsonl`        | `EVENTS_FILE`         | JSONL (one `SkillEvent` JSON object per line)                   | Append-only       | Tail-read (most recent N)    | Global + session |
| AST Code Navigation    | (none)                | —                     | In-memory tree-sitter parser cache                              | —                 | Read-only (source files)     | Process lifetime |

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

All paths resolve through the state module constants in `packages/core/src/state/constants.ts`.

## 2. Access Patterns

### learnings.md

- **Write:** `appendLearning()` appends a dated markdown bullet with `<!-- hash:XXX tags:a,b -->` frontmatter comment preceding the entry. Each write first checks `content-hashes.json` for duplicates.
- **Read (index scan):** `loadIndexEntries()` extracts `LearningsIndexEntry` objects (hash, tags, first-line summary) without loading full entry text. Used when `depth: "index"`.
- **Read (full):** `loadBudgetedLearnings()` loads entries with relevance scoring against an intent string, within a token budget. Used when `depth: "summary"` (default) or `depth: "full"`.
- **Concurrency:** Append-only writes are safe for single-writer scenarios. Two concurrent appends may both succeed but could interleave. No file locking implemented.
- **Corruption recovery:** Entries without frontmatter are treated as valid (backward compatible). `parseFrontmatter()` returns `null` for malformed frontmatter — the entry is included but not indexed.

### content-hashes.json

- **Write:** `saveContentHashes()` writes the entire `ContentHashIndex` object. This is a read-modify-write pattern — the file is loaded, modified in memory, and written back.
- **Read:** `loadContentHashes()` reads the full file, returns `{}` if missing or invalid.
- **Concurrency:** NOT safe for concurrent writes. Two writers will race, and the last write wins. Acceptable because harness sessions are single-writer.
- **Corruption recovery:** If the file is missing, corrupted, or has invalid JSON, `rebuildContentHashes()` scans `learnings.md` to reconstruct the index. This is triggered automatically on first access when the sidecar is absent.

### events.jsonl

- **Write:** `emitEvent()` appends a single JSON line with `\n` terminator. Content hash computed from `{skill, type, summary, session}` to prevent duplicates within a session.
- **Read:** `loadEvents()` reads the file, parses each line as JSON, filters by type/session, and returns the most recent N events. `formatEventTimeline()` renders events as a compact markdown timeline.
- **Concurrency:** Append-only JSONL is safe for concurrent writers at the OS level (each write is a single `appendFile` call). Partial writes result in an incomplete final line, which is skipped during parsing.
- **Corruption recovery:** Lines that fail `JSON.parse()` are silently skipped. No self-healing rebuild needed — the format is inherently corruption-tolerant.

### AST Parser Cache

- **Storage:** In-memory only. `ParserCache` in `packages/core/src/code-nav/parser.ts` holds initialized tree-sitter `Parser` instances keyed by language.
- **Lifecycle:** Created on first use, persists for process lifetime. No file I/O.
- **Concurrency:** Singleton pattern. Multiple callers share the same cache instance.
- **Recovery:** If WASM loading fails for a language, the parser is not cached and fallback to raw file content is used.

## 3. Shared Utilities

### Content Hashing

Both learnings deduplication and event deduplication share the same hashing approach:

```typescript
// packages/core/src/state/learnings.ts
export function normalizeLearningContent(text: string): string;
// Strips date prefixes, skill/outcome tags, list markers; lowercases; collapses whitespace

export function computeContentHash(text: string): string;
// SHA-256 of normalized text, returned as hex string
```

Events compute their hash from a concatenated `{skill}:{type}:{summary}:{session}` string, passed through the same `computeContentHash()` function.

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
  hash: string;
  tags: string[];
  summary: string;
  line: number;
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

| Flat File             | SQLite Table              | Schema                                                                                                                                                                          | Notes                                                                                                        |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `learnings.md`        | `learnings`               | `id INTEGER PRIMARY KEY, content TEXT NOT NULL, hash TEXT UNIQUE NOT NULL, tags TEXT, skill TEXT, outcome TEXT, timestamp TEXT NOT NULL`                                        | FTS5 virtual table on `content` for full-text search. `hash` column replaces `content-hashes.json` entirely. |
| `content-hashes.json` | (merged into `learnings`) | —                                                                                                                                                                               | The `hash` UNIQUE constraint on `learnings` table handles dedup. No separate table needed.                   |
| `events.jsonl`        | `events`                  | `id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, skill TEXT NOT NULL, session TEXT, type TEXT NOT NULL, summary TEXT NOT NULL, data TEXT, refs TEXT, content_hash TEXT UNIQUE` | Index on `(session, timestamp)`. `data` and `refs` stored as JSON strings.                                   |

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
