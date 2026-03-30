# Content Deduplication for Learnings

**Parent:** [Claude-Mem Pattern Adoption](../proposal.md)
**Keywords:** dedup, content-hash, sha256, learnings, append-only, normalization

## Overview

Hash-based content deduplication for `learnings.md`, inspired by claude-mem's `INSERT OR IGNORE` pattern with content hashing. Prevents the same insight from being recorded multiple times across sessions.

## Problem

`learnings.md` is append-only with no deduplication. The same insight gets recorded multiple times across sessions — the file is already 16K+ and growing. This inflates the file, dilutes relevance scoring, and increases the maintenance burden for pruning and archiving.

## Design

### Content Hash Index

New sidecar file: `.harness/content-hashes.json`

```json
{
  "schemaVersion": 1,
  "entries": {
    "a1b2c3d4e5f6...": {
      "line": 42,
      "timestamp": "2026-03-15T10:00:00Z",
      "skill": "harness-execution"
    },
    "f6e5d4c3b2a1...": {
      "line": 43,
      "timestamp": "2026-03-15T11:00:00Z",
      "skill": "harness-debugging"
    }
  }
}
```

### Normalization Rules

Before hashing, content is normalized to catch trivial variations:

1. Strip date prefix (e.g., `**2026-03-15`)
2. Strip skill/outcome tags (e.g., `[skill:harness-execution] [outcome:success]:`)
3. Strip leading `- ` list marker
4. Lowercase
5. Collapse whitespace (multiple spaces/newlines → single space)
6. Trim

SHA-256 of the normalized result becomes the content hash.

### Existing Infrastructure

SHA-256 hashing utilities already exist in `packages/core/src/architecture/collectors/hash.ts` (`violationId()`, `constraintRuleId()`). The dedup implementation should reuse this pattern — specifically the `sha256(normalizedInput)` approach — rather than introducing a separate hashing utility. Finding deduplication logic in `packages/core/tests/review/deduplicate-findings.ts` (`deduplicateFindings()`) provides a proven grouping/merge pattern that can inform the learnings dedup design.

### Write Path

`appendLearning` modified flow:

1. Normalize incoming content
2. Compute SHA-256
3. Check `.harness/content-hashes.json` for existing hash
4. If exists → skip write, return `{ skipped: true, reason: "duplicate" }`
5. If new → append to learnings.md with frontmatter comment (from sub-spec 1), update hash index

### Self-Healing

If `.harness/content-hashes.json` is missing or corrupted:

1. On first `appendLearning` call, detect missing/invalid index
2. Rebuild by scanning learnings.md, normalizing each entry, and computing hashes
3. Write rebuilt index
4. Continue with the append operation

This ensures the index is never a hard dependency — it accelerates dedup but the system works without it.

### Session Scoping

For session-scoped learnings (`.harness/sessions/<slug>/learnings.md`), the hash index lives alongside: `.harness/sessions/<slug>/content-hashes.json`. Global and session indexes are independent.

## Success Criteria

1. Appending an identical learning twice results in only one entry in learnings.md
2. Content hash index self-heals — deleting `.harness/content-hashes.json` and appending a learning rebuilds the index from learnings.md
3. Normalization ignores date prefixes, skill tags, and whitespace differences when computing hashes
4. No measurable latency impact on `appendLearning` (hash computation is sub-millisecond for typical entry sizes)

## Implementation Order

1. Implement content normalization and SHA-256 hashing utility
2. Add `.harness/content-hashes.json` sidecar with read/write functions
3. Integrate hash check into `appendLearning` write path
4. Implement self-healing index rebuild from learnings.md
5. Backfill hash index from existing learnings.md
