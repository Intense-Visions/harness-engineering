# Plan: Paged MCP Tool Responses — Phase 1: Shared Foundation

**Date:** 2026-04-11
**Spec:** docs/changes/paged-mcp-tool-responses/proposal.md
**Estimated tasks:** 3
**Estimated time:** 12 minutes

## Goal

Define the `PaginationMeta`, `PaginatedSlice<T>` types and the pure `paginate<T>()` utility in `packages/core`, with full unit test coverage and barrel export.

## Observable Truths (Acceptance Criteria)

1. `packages/core/src/compaction/pagination.ts` exports `PaginationMeta`, `PaginatedSlice<T>`, and `paginate<T>()`.
2. When `paginate([1,2,3,4,5], 0, 3)` is called, the system shall return `{ items: [1,2,3], pagination: { offset: 0, limit: 3, total: 5, hasMore: true } }`.
3. When `paginate([1,2,3], 0, 10)` is called, the system shall return `{ items: [1,2,3], pagination: { offset: 0, limit: 10, total: 3, hasMore: false } }`.
4. When `paginate([], 0, 10)` is called, the system shall return `{ items: [], pagination: { offset: 0, limit: 10, total: 0, hasMore: false } }`.
5. When `paginate([1,2,3], 5, 10)` is called (offset beyond length), the system shall return `{ items: [], pagination: { offset: 5, limit: 10, total: 3, hasMore: false } }`.
6. When `paginate([1,2,3,4,5], 2, 2)` is called, the system shall return `{ items: [3,4], pagination: { offset: 2, limit: 2, total: 5, hasMore: true } }`.
7. When `paginate([1,2,3,4,5], 3, 2)` is called (last page exact), the system shall return `{ items: [4,5], pagination: { offset: 3, limit: 2, total: 5, hasMore: false } }`.
8. `packages/core/src/compaction/index.ts` re-exports `PaginationMeta`, `PaginatedSlice`, and `paginate` from `./pagination`.
9. `npx vitest run packages/core/tests/compaction/pagination.test.ts` passes with all tests green.
10. `harness validate` passes.

## File Map

- CREATE `packages/core/src/compaction/pagination.ts`
- CREATE `packages/core/tests/compaction/pagination.test.ts`
- MODIFY `packages/core/src/compaction/index.ts` (add re-exports for pagination types and function)

## Tasks

### Task 1: Create pagination types and paginate() function with TDD tests

**Depends on:** none
**Files:** `packages/core/tests/compaction/pagination.test.ts`, `packages/core/src/compaction/pagination.ts`

1. Create test file `packages/core/tests/compaction/pagination.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  paginate,
  type PaginationMeta,
  type PaginatedSlice,
} from '../../src/compaction/pagination';

describe('paginate', () => {
  it('returns the first page with hasMore true when more items exist', () => {
    const result = paginate([1, 2, 3, 4, 5], 0, 3);
    expect(result).toEqual({
      items: [1, 2, 3],
      pagination: { offset: 0, limit: 3, total: 5, hasMore: true },
    });
  });

  it('returns all items with hasMore false when limit exceeds length', () => {
    const result = paginate([1, 2, 3], 0, 10);
    expect(result).toEqual({
      items: [1, 2, 3],
      pagination: { offset: 0, limit: 10, total: 3, hasMore: false },
    });
  });

  it('returns empty items for an empty array', () => {
    const result = paginate([], 0, 10);
    expect(result).toEqual({
      items: [],
      pagination: { offset: 0, limit: 10, total: 0, hasMore: false },
    });
  });

  it('returns empty items when offset is beyond array length', () => {
    const result = paginate([1, 2, 3], 5, 10);
    expect(result).toEqual({
      items: [],
      pagination: { offset: 5, limit: 10, total: 3, hasMore: false },
    });
  });

  it('returns a middle page with correct hasMore', () => {
    const result = paginate([1, 2, 3, 4, 5], 2, 2);
    expect(result).toEqual({
      items: [3, 4],
      pagination: { offset: 2, limit: 2, total: 5, hasMore: true },
    });
  });

  it('returns the last page with hasMore false when offset + limit equals length', () => {
    const result = paginate([1, 2, 3, 4, 5], 3, 2);
    expect(result).toEqual({
      items: [4, 5],
      pagination: { offset: 3, limit: 2, total: 5, hasMore: false },
    });
  });

  it('works with non-numeric item types', () => {
    const result = paginate(['a', 'b', 'c', 'd'], 1, 2);
    expect(result).toEqual({
      items: ['b', 'c'],
      pagination: { offset: 1, limit: 2, total: 4, hasMore: true },
    });
  });

  it('handles offset at exactly the last item', () => {
    const result = paginate([10, 20, 30], 2, 5);
    expect(result).toEqual({
      items: [30],
      pagination: { offset: 2, limit: 5, total: 3, hasMore: false },
    });
  });

  it('handles limit of 1 for single-item pages', () => {
    const result = paginate([10, 20, 30], 0, 1);
    expect(result).toEqual({
      items: [10],
      pagination: { offset: 0, limit: 1, total: 3, hasMore: true },
    });
  });
});
```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/compaction/pagination.test.ts`
3. Observe failure: module `../../src/compaction/pagination` not found.

4. Create implementation `packages/core/src/compaction/pagination.ts`:

```typescript
/**
 * Pagination types and utility for MCP tool responses.
 *
 * Tools call `paginate()` after sorting results by relevance.
 * The returned `PaginatedSlice` includes metadata that lets agents
 * request subsequent pages on demand via offset/limit params.
 */

export interface PaginationMeta {
  /** Number of items skipped. */
  offset: number;
  /** Maximum items in this page. */
  limit: number;
  /** Total items available (null if expensive to compute). */
  total: number | null;
  /** True if more pages exist beyond this slice. */
  hasMore: boolean;
}

export interface PaginatedSlice<T> {
  items: T[];
  pagination: PaginationMeta;
}

/**
 * Pure pagination utility — slices an array and computes pagination metadata.
 *
 * @param items  - The full, relevance-sorted array to paginate.
 * @param offset - Number of items to skip from the start.
 * @param limit  - Maximum number of items to return.
 * @returns A `PaginatedSlice` with the requested page and metadata.
 */
export function paginate<T>(items: T[], offset: number, limit: number): PaginatedSlice<T> {
  const sliced = items.slice(offset, offset + limit);
  return {
    items: sliced,
    pagination: {
      offset,
      limit,
      total: items.length,
      hasMore: offset + limit < items.length,
    },
  };
}
```

5. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/compaction/pagination.test.ts`
6. Observe: all 9 tests pass.
7. Run: `harness validate`
8. Commit: `feat(core): add paginate() utility and PaginationMeta types`

---

### Task 2: Export pagination from compaction barrel

**Depends on:** Task 1
**Files:** `packages/core/src/compaction/index.ts`

1. Open `packages/core/src/compaction/index.ts` and add the following exports after the existing `serializeEnvelope` export line:

```typescript
export type { PaginationMeta, PaginatedSlice } from './pagination';
export { paginate } from './pagination';
```

The full file should read:

```typescript
/**
 * Compaction module — strategies, pipeline, and envelope types for
 * reducing MCP tool response token consumption.
 */
export type { CompactionStrategy } from './strategies/structural';
export { StructuralStrategy } from './strategies/structural';

export { TruncationStrategy, DEFAULT_TOKEN_BUDGET } from './strategies/truncation';

export { CompactionPipeline } from './pipeline';

export type { PackedEnvelope } from './envelope';
export { serializeEnvelope, estimateTokens } from './envelope';

export type { PaginationMeta, PaginatedSlice } from './pagination';
export { paginate } from './pagination';
```

2. Run all compaction tests to verify nothing is broken: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/compaction/`
3. Observe: all tests pass (pagination, envelope, pipeline, structural, truncation).
4. Verify the export is reachable from the core package entry point (core `src/index.ts` already has `export * from './compaction'` at line 164, so no changes needed there).
5. Run: `harness validate`
6. Commit: `feat(core): export pagination types from compaction barrel`

---

### Task 3: Verify end-to-end import from @harness-engineering/core

**Depends on:** Task 2
**Files:** `packages/core/tests/compaction/pagination.test.ts` (add one verification test)

1. Add the following test to the end of the `describe('paginate', ...)` block in `packages/core/tests/compaction/pagination.test.ts`:

```typescript
it('is re-exported from the compaction barrel', async () => {
  const barrel = await import('../../src/compaction/index');
  expect(barrel.paginate).toBe(paginate);
});
```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/compaction/pagination.test.ts`
3. Observe: all 10 tests pass.
4. Run: `harness validate`
5. Commit: `test(core): verify paginate barrel re-export`

## Traceability

| Observable Truth                            | Delivered By                      |
| ------------------------------------------- | --------------------------------- |
| 1. pagination.ts exports types and function | Task 1                            |
| 2-7. paginate() correctness cases           | Task 1 (tests)                    |
| 8. Barrel re-export                         | Task 2, Task 3                    |
| 9. All tests pass                           | Task 1, Task 3                    |
| 10. harness validate passes                 | Task 1, 2, 3 (each runs validate) |
