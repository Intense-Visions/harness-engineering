# Plan: NLQ ResponseFormatter (Phase 5)

**Date:** 2026-03-23
**Spec:** docs/changes/natural-language-graph-queries/proposal.md
**Estimated tasks:** 3
**Estimated time:** 15 minutes

## Goal

Implement template-based response formatter that generates human-readable summaries from graph operation results, one template per intent.

## Observable Truths (Acceptance Criteria)

1. Impact formatting produces: `Changing **{entity}** affects {code} code files, {tests} tests, and {docs} docs.`
2. Find formatting produces: `Found {count} matches for "{query}".`
3. Relationships formatting produces: `**{entity}** has {outbound} outbound and {inbound} inbound relationships.`
4. Explain formatting produces: `**{entity}** is a {nodeType} at {path}. Connected to {neighborCount} nodes.`
5. Anomaly formatting produces: `Found {count} anomalies: {topAnomalies}.`
6. Empty/missing data produces graceful fallback messages, not errors.
7. `npx vitest run tests/nlq/ResponseFormatter.test.ts` passes.
8. `tsc --noEmit` passes.
9. `harness validate` passes.

## File Map

- CREATE `packages/graph/src/nlq/ResponseFormatter.ts`
- CREATE `packages/graph/tests/nlq/ResponseFormatter.test.ts`
- MODIFY `packages/graph/src/nlq/index.ts` (add ResponseFormatter export)

## Tasks

### Task 1: Create ResponseFormatter test file

**Depends on:** none
**Files:** `packages/graph/tests/nlq/ResponseFormatter.test.ts`

1. Create test file with tests for all 5 intent formatters plus edge cases.
2. Run test — observe failure (module not found).

### Task 2: Implement ResponseFormatter

**Depends on:** Task 1
**Files:** `packages/graph/src/nlq/ResponseFormatter.ts`

1. Create ResponseFormatter class with a `format(intent, entities, data, query)` method.
2. Implement per-intent template formatting.
3. Handle empty/missing data gracefully.
4. Run tests — all pass.
5. Run `tsc --noEmit` — clean.

### Task 3: Export and verify

**Depends on:** Task 2
**Files:** `packages/graph/src/nlq/index.ts`

1. Add `export { ResponseFormatter } from './ResponseFormatter.js';` to index.ts.
2. Run all NLQ tests.
3. Run `harness validate`.
