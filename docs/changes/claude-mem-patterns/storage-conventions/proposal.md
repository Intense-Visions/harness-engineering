# Storage Conventions

**Parent:** [Claude-Mem Pattern Adoption](../proposal.md)
**Keywords:** storage, conventions, flat-file, sqlite, migration, backend-interface

## Overview

A conventions document describing the storage patterns used by all claude-mem pattern sub-specs and how they would map to a future unified storage backend (e.g., SQLite). This is documentation, not code — no runtime cost, no abstraction layer.

## Problem

Four sub-specs each introduce their own file-based storage (learnings with frontmatter, content hash indexes, event logs, AST caches). Without documentation, a future unification effort would require reverse-engineering each pattern's storage assumptions, access patterns, and consistency guarantees.

## Design

### Document Structure

The conventions document covers:

#### 1. File Inventory

| Pattern                | File                    | Format                             | Access             | Scope            |
| ---------------------- | ----------------------- | ---------------------------------- | ------------------ | ---------------- |
| Progressive Disclosure | `learnings.md`          | Markdown with frontmatter comments | Append + read      | Global + session |
| Content Deduplication  | `content-hashes.json`   | JSON object (hash → metadata)      | Read-modify-write  | Global + session |
| Structured Event Log   | `events.jsonl`          | JSONL (one object per line)        | Append + tail-read | Global + session |
| AST Code Navigation    | (no persistent storage) | In-memory parser cache             | Read-only          | Process lifetime |

#### 2. Access Patterns

For each file, document:

- **Write pattern:** Append-only vs read-modify-write
- **Read pattern:** Full scan, tail, index lookup, or streaming
- **Concurrency safety:** What happens if two processes write simultaneously
- **Corruption recovery:** How the system self-heals from partial writes or invalid data

#### 3. StorageBackend Interface Sketch

A conceptual interface (not implemented) showing what unification would look like:

```typescript
interface StorageBackend {
  // Learnings
  appendLearning(entry: LearningEntry): Promise<Result<{ written: boolean }>>;
  queryLearnings(
    intent: string,
    options: { depth: Depth; budget: number }
  ): Promise<Result<LearningResult[]>>;

  // Events
  emitEvent(event: SkillEvent): Promise<Result<{ written: boolean }>>;
  queryEvents(options: {
    session?: string;
    limit?: number;
    types?: EventType[];
  }): Promise<Result<SkillEvent[]>>;

  // Dedup
  hasContent(hash: string): Promise<boolean>;
  registerContent(hash: string, metadata: HashMetadata): Promise<void>;
}
```

#### 4. SQLite Migration Notes

For each pattern, describe how the flat-file storage maps to tables:

| Flat File             | SQLite Table     | Key Columns                                        | Notes                             |
| --------------------- | ---------------- | -------------------------------------------------- | --------------------------------- |
| `learnings.md`        | `learnings`      | id, content, hash, tags, skill, timestamp          | Full-text search index on content |
| `content-hashes.json` | `content_hashes` | hash (PK), line, timestamp, skill                  | Replaces JSON sidecar entirely    |
| `events.jsonl`        | `events`         | id, timestamp, skill, session, type, summary, data | Index on (session, timestamp)     |

#### 5. Migration Path

Step-by-step description of how to migrate from flat files to SQLite:

1. Implement `StorageBackend` interface with SQLite adapter
2. Write migration script that reads existing flat files and populates SQLite tables
3. Swap `gather_context` and `appendLearning` to use the backend interface
4. Keep flat files as fallback for environments where SQLite isn't available
5. Deprecate direct file access over time

## Success Criteria

1. Conventions document exists and covers all four sub-specs' storage patterns
2. Document includes a concrete `StorageBackend` interface sketch with method signatures for each pattern
3. Document includes migration notes describing how each flat-file pattern maps to SQLite tables

## Implementation Order

1. Document all file formats, locations, and access patterns
2. Sketch `StorageBackend` interface with method signatures
3. Write SQLite migration notes per pattern
