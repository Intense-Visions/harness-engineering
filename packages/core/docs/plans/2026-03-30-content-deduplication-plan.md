# Plan: Content Deduplication for Learnings

**Spec:** docs/changes/claude-mem-patterns/content-deduplication/proposal.md
**Complexity:** LOW
**Tasks:** 3

## Task 1: Add content normalization and hash-based dedup to appendLearning

**Files:**

- `src/state/learnings.ts` — add `normalizeLearningContent()`, `CONTENT_HASHES_FILE` constant, `loadContentHashes()`, `saveContentHashes()`, and `rebuildContentHashes()`. Modify `appendLearning()` to check content hash before writing.
- `src/state/constants.ts` — add `CONTENT_HASHES_FILE` constant
- `tests/state/learnings.test.ts` — add deduplication tests

**Implementation:**

1. Add `CONTENT_HASHES_FILE = 'content-hashes.json'` to constants.ts
2. In learnings.ts, add:
   - `normalizeLearningContent(text: string): string` — strips date prefix (`YYYY-MM-DD`), skill/outcome tags (`[skill:X]`, `[outcome:Y]`), list markers (`- `, `* `), bold markers (`**`), colons after tags; lowercases; collapses whitespace; trims
   - `computeContentHash(text: string): string` — SHA-256 of normalized content, 16-char hex
   - `ContentHashIndex` interface: `Record<string, { date: string; line: number }>`
   - `loadContentHashes(stateDir: string): ContentHashIndex` — reads sidecar JSON, returns empty object on missing/corrupt
   - `saveContentHashes(stateDir: string, index: ContentHashIndex): void` — writes sidecar JSON
   - `rebuildContentHashes(stateDir: string): ContentHashIndex` — parses learnings.md, rebuilds index from entries
3. Modify `appendLearning()`:
   - After building `bulletLine`, compute content hash via `normalizeLearningContent(learning)` then `computeContentHash()`
   - Load content hash index (with self-healing: if file missing, rebuild from learnings.md)
   - If hash exists in index, return `Ok(undefined)` early (skip duplicate)
   - After writing, add hash to index and save

**Tests (TDD):**

- `normalizeLearningContent` strips dates, tags, markers, collapses whitespace
- Appending identical learning twice results in one entry
- Appending same content with different dates/tags still deduplicates
- Appending different content writes both entries
- Session-scoped: independent hash indexes per session

**Commit:** `feat(learnings): add hash-based content deduplication to appendLearning`

## Task 2: Self-healing content hash index

**Files:**

- `src/state/learnings.ts` — already has `rebuildContentHashes()` from Task 1
- `tests/state/learnings.test.ts` — add self-healing tests

**Tests (TDD):**

- Deleting content-hashes.json and appending a new (non-duplicate) entry rebuilds the index
- Deleting content-hashes.json and appending a duplicate entry still deduplicates (rebuild detects existing entries)
- Corrupted JSON in content-hashes.json triggers rebuild

**Commit:** `test(learnings): verify self-healing content hash index`

## Task 3: Export new functions and verify no latency regression

**Files:**

- `src/state/state-manager.ts` — export `normalizeLearningContent`, `computeContentHash` if useful for consumers
- `tests/state/learnings.test.ts` — add performance sanity test

**Tests:**

- Appending 100 learnings completes in under 2 seconds (sanity check, not a micro-benchmark)
- All existing 35 tests still pass (regression check)

**Commit:** `feat(learnings): export dedup utilities and add performance sanity test`
