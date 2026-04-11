# Plan: Paged MCP Tool Responses -- Phase 4 (Context & Trends)

**Date:** 2026-04-11
**Spec:** docs/changes/paged-mcp-tool-responses/proposal.md
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

Add offset/limit pagination to `gather_context` (section-aware) and `get_decay_trends` so agents can retrieve complete results across multiple requests instead of losing data to truncation.

## Observable Truths (Acceptance Criteria)

1. When `get_decay_trends` is called without `offset`/`limit`, the system shall return all category trends with `pagination: { offset: 0, limit: 20, total, hasMore }` in the response.
2. When `get_decay_trends` is called with `offset: 2, limit: 1`, the system shall return at most 1 category trend entry starting from the 3rd entry, sorted by decay magnitude (absolute delta) descending.
3. When `gather_context` is called without `section`/`offset`/`limit`, the system shall return the same response shape as today plus `pagination` metadata per section (backward compatible).
4. When `gather_context` is called with `section: 'graphContext'` and `offset`/`limit`, the system shall paginate only the graph context blocks, sorted by relevance score descending.
5. When `gather_context` is called with `section: 'learnings'`, the system shall paginate learning entries sorted by recency.
6. When `gather_context` is called with `section: 'sessionSections'`, the system shall paginate session section entries.
7. `npx vitest run packages/cli/tests/mcp/tools/decay-trends.test.ts` passes with pagination tests.
8. `npx vitest run packages/cli/tests/mcp/tools/gather-context.test.ts` passes with pagination tests.
9. The system shall include `offset`, `limit`, and `section` (gather_context only) in the tool input schema definitions.
10. `harness validate` passes.

## File Map

- MODIFY `packages/cli/src/mcp/tools/decay-trends.ts` (add offset/limit params, paginate categories)
- CREATE `packages/cli/tests/mcp/tools/decay-trends.test.ts` (pagination tests)
- MODIFY `packages/cli/src/mcp/tools/gather-context.ts` (add section/offset/limit params, section-aware pagination)
- MODIFY `packages/cli/tests/mcp/tools/gather-context.test.ts` (add pagination tests)

## Tasks

### Task 1: Add pagination to `get_decay_trends` -- schema and handler

**Depends on:** none
**Files:** `packages/cli/src/mcp/tools/decay-trends.ts`

1. Open `packages/cli/src/mcp/tools/decay-trends.ts`.

2. Add `offset` and `limit` to `getDecayTrendsDefinition.inputSchema.properties`:

   ```typescript
   offset: {
     type: 'number',
     description:
       'Number of trend entries to skip (pagination). Default: 0. Trends are sorted by decay magnitude (absolute delta) desc.',
   },
   limit: {
     type: 'number',
     description: 'Max trend entries to return (pagination). Default: 20.',
   },
   ```

3. Add `offset?: number; limit?: number;` to the `handleGetDecayTrends` input type.

4. Add `import { paginate } from '@harness-engineering/core';` at the top (line 1, alongside existing import).

5. In the handler, after `const trends = manager.trends(trendOptions);` (line 79), convert `trends.categories` to a sorted array and paginate. Replace the category-filter and default return logic (lines 81-121) with:

   ```typescript
   // Convert categories record to sorted array for pagination
   const categoryEntries = Object.entries(trends.categories).map(([name, trend]) => ({
     category: name,
     ...trend,
   }));
   // Sort by decay magnitude (absolute delta) descending
   categoryEntries.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

   // If category filter, find it in the sorted array
   if (input.category) {
     const match = categoryEntries.find((e) => e.category === input.category);
     if (!match) {
       return {
         content: [
           {
             type: 'text' as const,
             text: `No trend data for category "${input.category}".`,
           },
         ],
       };
     }

     return {
       content: [
         {
           type: 'text' as const,
           text: JSON.stringify(
             {
               category: input.category,
               trend: {
                 current: match.current,
                 previous: match.previous,
                 delta: match.delta,
                 direction: match.direction,
               },
               snapshotCount: trends.snapshotCount,
               from: trends.from,
               to: trends.to,
             },
             null,
             2
           ),
         },
       ],
     };
   }

   const paged = paginate(categoryEntries, input.offset ?? 0, input.limit ?? 20);

   return {
     content: [
       {
         type: 'text' as const,
         text: JSON.stringify(
           {
             stability: trends.stability,
             categories: paged.items,
             snapshotCount: trends.snapshotCount,
             from: trends.from,
             to: trends.to,
             pagination: paged.pagination,
           },
           null,
           2
         ),
       },
     ],
   };
   ```

6. Run: `harness validate`
7. Commit: `feat(mcp): add offset/limit pagination to get_decay_trends`

---

### Task 2: Test pagination for `get_decay_trends`

**Depends on:** Task 1
**Files:** `packages/cli/tests/mcp/tools/decay-trends.test.ts`

1. Create `packages/cli/tests/mcp/tools/decay-trends.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import {
     getDecayTrendsDefinition,
     handleGetDecayTrends,
   } from '../../../src/mcp/tools/decay-trends';

   describe('get_decay_trends tool', () => {
     describe('definition', () => {
       it('has correct name', () => {
         expect(getDecayTrendsDefinition.name).toBe('get_decay_trends');
       });

       it('has offset and limit properties in schema', () => {
         const props = getDecayTrendsDefinition.inputSchema.properties;
         expect(props).toHaveProperty('offset');
         expect(props).toHaveProperty('limit');
         expect(props.offset.type).toBe('number');
         expect(props.limit.type).toBe('number');
       });
     });

     describe('pagination', () => {
       let tmpDir: string;

       beforeEach(() => {
         tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decay-trends-'));
         // Create timeline with 2 snapshots so trends have deltas
         const archDir = path.join(tmpDir, '.harness', 'arch');
         fs.mkdirSync(archDir, { recursive: true });
         const timeline = {
           version: 1,
           snapshots: [
             {
               id: 'snap-1',
               capturedAt: '2026-01-01T00:00:00Z',
               commitHash: 'aaa',
               stabilityScore: 80,
               metrics: {
                 'circular-deps': { value: 2, files: [] },
                 'layer-violations': { value: 5, files: [] },
                 complexity: { value: 10, files: [] },
                 coupling: { value: 3, files: [] },
                 'forbidden-imports': { value: 0, files: [] },
                 'module-size': { value: 1, files: [] },
                 'dependency-depth': { value: 4, files: [] },
               },
             },
             {
               id: 'snap-2',
               capturedAt: '2026-02-01T00:00:00Z',
               commitHash: 'bbb',
               stabilityScore: 70,
               metrics: {
                 'circular-deps': { value: 5, files: [] },
                 'layer-violations': { value: 3, files: [] },
                 complexity: { value: 15, files: [] },
                 coupling: { value: 3, files: [] },
                 'forbidden-imports': { value: 1, files: [] },
                 'module-size': { value: 1, files: [] },
                 'dependency-depth': { value: 6, files: [] },
               },
             },
           ],
         };
         fs.writeFileSync(path.join(archDir, 'timeline.json'), JSON.stringify(timeline));
       });

       afterEach(() => {
         fs.rmSync(tmpDir, { recursive: true, force: true });
       });

       it('includes pagination metadata with defaults', async () => {
         const response = await handleGetDecayTrends({ path: tmpDir });
         expect(response.isError).toBeUndefined();
         const parsed = JSON.parse(response.content[0].text);
         expect(parsed).toHaveProperty('pagination');
         expect(parsed.pagination).toHaveProperty('offset', 0);
         expect(parsed.pagination).toHaveProperty('limit', 20);
         expect(parsed.pagination).toHaveProperty('total');
         expect(parsed.pagination).toHaveProperty('hasMore');
         expect(Array.isArray(parsed.categories)).toBe(true);
       });

       it('categories are sorted by absolute delta descending', async () => {
         const response = await handleGetDecayTrends({ path: tmpDir });
         const parsed = JSON.parse(response.content[0].text);
         const deltas = parsed.categories.map((c: { delta: number }) => Math.abs(c.delta));
         for (let i = 1; i < deltas.length; i++) {
           expect(deltas[i]).toBeLessThanOrEqual(deltas[i - 1]);
         }
       });

       it('respects offset and limit params', async () => {
         const response = await handleGetDecayTrends({
           path: tmpDir,
           offset: 2,
           limit: 1,
         });
         const parsed = JSON.parse(response.content[0].text);
         expect(parsed.pagination.offset).toBe(2);
         expect(parsed.pagination.limit).toBe(1);
         expect(parsed.categories.length).toBeLessThanOrEqual(1);
       });

       it('offset beyond entries returns empty page', async () => {
         const response = await handleGetDecayTrends({
           path: tmpDir,
           offset: 100,
           limit: 20,
         });
         const parsed = JSON.parse(response.content[0].text);
         expect(parsed.categories).toHaveLength(0);
         expect(parsed.pagination.hasMore).toBe(false);
       });

       it('category filter still works (no pagination)', async () => {
         const response = await handleGetDecayTrends({
           path: tmpDir,
           category: 'complexity',
         });
         const parsed = JSON.parse(response.content[0].text);
         expect(parsed.category).toBe('complexity');
         expect(parsed).toHaveProperty('trend');
         // Category filter returns single trend, no pagination wrapper
         expect(parsed).not.toHaveProperty('pagination');
       });
     });

     describe('no snapshots', () => {
       it('returns informational message when no snapshots exist', async () => {
         const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decay-empty-'));
         try {
           const response = await handleGetDecayTrends({ path: tmpDir });
           expect(response.content[0].text).toContain('No architecture snapshots');
         } finally {
           fs.rmSync(tmpDir, { recursive: true, force: true });
         }
       });
     });
   });
   ```

2. Run test: `npx vitest run packages/cli/tests/mcp/tools/decay-trends.test.ts`
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `test(mcp): add pagination tests for get_decay_trends`

---

### Task 3: Add `section`, `offset`, `limit` params to `gather_context` schema

**Depends on:** none
**Files:** `packages/cli/src/mcp/tools/gather-context.ts`

1. Add three new properties to `gatherContextDefinition.inputSchema.properties` (after `depth`):

   ```typescript
   section: {
     type: 'string',
     enum: ['graphContext', 'learnings', 'sessionSections'],
     description:
       'Section to paginate. When provided, offset/limit apply within this section only. When omitted, returns first page of each section (current behavior).',
   },
   offset: {
     type: 'number',
     description:
       'Number of items to skip within the section (pagination). Default: 0. Requires section param.',
   },
   limit: {
     type: 'number',
     description:
       'Max items to return within the section (pagination). Default: 20. Requires section param.',
   },
   ```

2. Add `section?: 'graphContext' | 'learnings' | 'sessionSections'; offset?: number; limit?: number;` to the `handleGatherContext` input type.

3. Run: `harness validate`
4. Commit: `feat(mcp): add section/offset/limit params to gather_context schema`

---

### Task 4: Implement section-aware pagination in `gather_context` handler

**Depends on:** Task 3
**Files:** `packages/cli/src/mcp/tools/gather-context.ts`

1. Add import at the top of the file (line 1):

   ```typescript
   import { paginate } from '@harness-engineering/core';
   ```

2. After the output object is assembled (after line 353, `output.meta.tokenEstimate = tokenEstimate;` block), but before the `return` statement, add section-aware pagination logic. Replace the final return block (lines 370-382) with:

   ```typescript
   // Compute token estimate from final output (avoid double serialization)
   const outputText = JSON.stringify(output);
   const tokenEstimate = Math.ceil(outputText.length / 4);
   output.meta.tokenEstimate = tokenEstimate;

   // Section-aware pagination
   if (input.section) {
     const sectionLimit = input.limit ?? 20;
     const sectionOffset = input.offset ?? 0;

     let paginationResult;

     if (input.section === 'graphContext') {
       // Paginate graph context blocks by relevance score (already sorted by fusion search)
       const blocks = (graphContext as GraphContextResult | null)?.context ?? [];
       // Sort by score desc (should already be sorted, but enforce)
       const sorted = [...blocks].sort((a, b) => b.score - a.score);
       paginationResult = paginate(sorted, sectionOffset, sectionLimit);
       return {
         content: [
           {
             type: 'text' as const,
             text: JSON.stringify({
               section: 'graphContext',
               items: paginationResult.items,
               pagination: paginationResult.pagination,
               meta: output.meta,
             }),
           },
         ],
       };
     }

     if (input.section === 'learnings') {
       // Paginate learnings — already sorted by recency from core
       const items = Array.isArray(outputLearnings) ? outputLearnings : [];
       paginationResult = paginate(items, sectionOffset, sectionLimit);
       return {
         content: [
           {
             type: 'text' as const,
             text: JSON.stringify({
               section: 'learnings',
               items: paginationResult.items,
               pagination: paginationResult.pagination,
               meta: output.meta,
             }),
           },
         ],
       };
     }

     if (input.section === 'sessionSections') {
       // Flatten all session section entries into a single array, sort by timestamp desc
       const sections = sessionSections as Record<
         string,
         Array<{ timestamp?: string; content: string; authorSkill?: string }>
       > | null;
       const entries: Array<{
         sectionName: string;
         timestamp?: string;
         content: string;
         authorSkill?: string;
       }> = [];
       if (sections) {
         for (const [sectionName, sectionEntries] of Object.entries(sections)) {
           if (Array.isArray(sectionEntries)) {
             for (const entry of sectionEntries) {
               entries.push({ sectionName, ...entry });
             }
           }
         }
       }
       // Sort by timestamp desc (most recent first)
       entries.sort((a, b) => {
         const ta = a.timestamp ?? '';
         const tb = b.timestamp ?? '';
         return tb.localeCompare(ta);
       });
       paginationResult = paginate(entries, sectionOffset, sectionLimit);
       return {
         content: [
           {
             type: 'text' as const,
             text: JSON.stringify({
               section: 'sessionSections',
               items: paginationResult.items,
               pagination: paginationResult.pagination,
               meta: output.meta,
             }),
           },
         ],
       };
     }
   }

   return {
     content: [
       {
         type: 'text' as const,
         text: JSON.stringify(output),
       },
     ],
   };
   ```

   Note: The `GraphContextResult` interface is already defined earlier in the file (around line 314). The `sessionSections` variable is already in scope from line 285.

3. Run: `harness validate`
4. Commit: `feat(mcp): implement section-aware pagination in gather_context`

---

### Task 5: Add pagination tests for `gather_context`

**Depends on:** Task 4
**Files:** `packages/cli/tests/mcp/tools/gather-context.test.ts`

1. Append the following `describe` blocks to the existing test file, before the final closing `});`:

   ```typescript
   describe('pagination schema', () => {
     it('has section, offset, and limit properties in schema', () => {
       const props = gatherContextDefinition.inputSchema.properties;
       expect(props).toHaveProperty('section');
       expect(props).toHaveProperty('offset');
       expect(props).toHaveProperty('limit');
       expect((props as Record<string, { type: string }>).offset.type).toBe('number');
       expect((props as Record<string, { type: string }>).limit.type).toBe('number');
     });

     it('section enum has correct values', () => {
       const sectionProp = (
         gatherContextDefinition.inputSchema.properties as Record<string, { enum?: string[] }>
       ).section;
       expect(sectionProp.enum).toEqual(['graphContext', 'learnings', 'sessionSections']);
     });
   });

   describe('section-aware pagination', () => {
     it('returns learnings section with pagination when section=learnings', async () => {
       const response = await handleGatherContext({
         path: '/nonexistent/project-gc-pagination',
         intent: 'test pagination',
         include: ['learnings'],
         section: 'learnings',
       });
       expect(response.isError).toBeUndefined();
       const parsed = JSON.parse(response.content[0].text);
       expect(parsed.section).toBe('learnings');
       expect(parsed).toHaveProperty('items');
       expect(parsed).toHaveProperty('pagination');
       expect(parsed.pagination).toHaveProperty('offset', 0);
       expect(parsed.pagination).toHaveProperty('limit', 20);
       expect(parsed.pagination).toHaveProperty('total');
       expect(parsed.pagination).toHaveProperty('hasMore');
     });

     it('returns graphContext section with pagination when section=graphContext', async () => {
       const response = await handleGatherContext({
         path: '/nonexistent/project-gc-pagination',
         intent: 'test pagination',
         include: ['graph'],
         section: 'graphContext',
       });
       expect(response.isError).toBeUndefined();
       const parsed = JSON.parse(response.content[0].text);
       expect(parsed.section).toBe('graphContext');
       expect(parsed).toHaveProperty('items');
       expect(parsed).toHaveProperty('pagination');
       expect(parsed.pagination.offset).toBe(0);
       expect(parsed.pagination.limit).toBe(20);
     });

     it('returns sessionSections with pagination when section=sessionSections', async () => {
       const response = await handleGatherContext({
         path: '/nonexistent/project-gc-pagination',
         intent: 'test pagination',
         include: ['sessions'],
         session: 'test-session',
         section: 'sessionSections',
       });
       expect(response.isError).toBeUndefined();
       const parsed = JSON.parse(response.content[0].text);
       expect(parsed.section).toBe('sessionSections');
       expect(parsed).toHaveProperty('items');
       expect(parsed).toHaveProperty('pagination');
     });

     it('respects offset and limit for learnings section', async () => {
       const response = await handleGatherContext({
         path: '/nonexistent/project-gc-pagination',
         intent: 'test pagination',
         include: ['learnings'],
         section: 'learnings',
         offset: 5,
         limit: 2,
       });
       const parsed = JSON.parse(response.content[0].text);
       expect(parsed.pagination.offset).toBe(5);
       expect(parsed.pagination.limit).toBe(2);
     });

     it('without section param returns full output with no pagination wrapper', async () => {
       const response = await handleGatherContext({
         path: '/nonexistent/project-gc-pagination',
         intent: 'test no section',
       });
       const parsed = JSON.parse(response.content[0].text);
       // Should have the standard shape, not the paginated shape
       expect(parsed).toHaveProperty('state');
       expect(parsed).toHaveProperty('learnings');
       expect(parsed).toHaveProperty('graphContext');
       expect(parsed).toHaveProperty('meta');
       expect(parsed).not.toHaveProperty('section');
       expect(parsed).not.toHaveProperty('items');
     });
   });

   describe('section pagination with real session data', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-pagination-'));
       fs.writeFileSync(
         path.join(tmpDir, 'harness.config.json'),
         JSON.stringify({ name: 'test-project' })
       );
       fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     it('paginates session section entries across all sections', async () => {
       const { appendSessionEntry } = await import('@harness-engineering/core');
       const sessionSlug = 'pagination-test';
       const sessionDir = path.join(tmpDir, '.harness', 'sessions', sessionSlug);
       fs.mkdirSync(sessionDir, { recursive: true });

       // Add multiple entries across sections
       await appendSessionEntry(tmpDir, sessionSlug, 'decisions', 'skill-a', 'Decision 1');
       await appendSessionEntry(tmpDir, sessionSlug, 'decisions', 'skill-a', 'Decision 2');
       await appendSessionEntry(tmpDir, sessionSlug, 'constraints', 'skill-b', 'Constraint 1');

       const response = await handleGatherContext({
         path: tmpDir,
         intent: 'test session pagination',
         session: sessionSlug,
         include: ['sessions'],
         section: 'sessionSections',
         offset: 0,
         limit: 2,
       });
       const parsed = JSON.parse(response.content[0].text);
       expect(parsed.section).toBe('sessionSections');
       expect(parsed.items.length).toBeLessThanOrEqual(2);
       expect(parsed.pagination.total).toBe(3);
       expect(parsed.pagination.hasMore).toBe(true);
       // Each item should have sectionName
       for (const item of parsed.items) {
         expect(item).toHaveProperty('sectionName');
         expect(item).toHaveProperty('content');
       }
     });
   });
   ```

2. Run test: `npx vitest run packages/cli/tests/mcp/tools/gather-context.test.ts`
3. Observe: all tests pass (including existing tests).
4. Run: `harness validate`
5. Commit: `test(mcp): add section-aware pagination tests for gather_context`

---

### Task 6: Integration verification

**Depends on:** Tasks 1-5
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run full test suite for both tools:
   ```
   npx vitest run packages/cli/tests/mcp/tools/decay-trends.test.ts
   npx vitest run packages/cli/tests/mcp/tools/gather-context.test.ts
   ```
2. Verify no regressions in existing gather-context session tests:
   ```
   npx vitest run packages/cli/tests/mcp/tools/gather-context-session.test.ts
   ```
3. Run: `harness validate`
4. Run: `harness check-deps`
5. Verify backward compatibility: confirm that calling both tools without new params produces valid responses with the `pagination` field present (decay-trends) or absent (gather-context without `section`).

---

## Traceability

| Observable Truth                                           | Delivered by   |
| ---------------------------------------------------------- | -------------- |
| 1. decay-trends returns pagination metadata with defaults  | Task 1, Task 2 |
| 2. decay-trends respects offset/limit, sorted by magnitude | Task 1, Task 2 |
| 3. gather_context backward compatible without section      | Task 4, Task 5 |
| 4. gather_context paginates graphContext by score          | Task 4, Task 5 |
| 5. gather_context paginates learnings by recency           | Task 4, Task 5 |
| 6. gather_context paginates sessionSections                | Task 4, Task 5 |
| 7. decay-trends tests pass                                 | Task 2         |
| 8. gather-context tests pass                               | Task 5         |
| 9. schema definitions updated                              | Task 1, Task 3 |
| 10. harness validate passes                                | Task 6         |
