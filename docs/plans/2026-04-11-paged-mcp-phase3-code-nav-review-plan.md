# Plan: Paged MCP Tool Responses -- Phase 3: Code Navigation & Review

**Date:** 2026-04-11
**Spec:** docs/changes/paged-mcp-tool-responses/proposal.md
**Estimated tasks:** 6
**Estimated time:** 30 minutes

## Goal

Add offset/limit pagination to `code_outline`, `review_changes`, and `run_code_review`, using the `paginate()` utility from `@harness-engineering/core` (delivered in Phase 1). Replace the hard `MAX_FILES = 50` cap in `code_outline` with proper pagination. Sort results by relevance (modification time for outlines, severity for review findings) before slicing.

## Observable Truths (Acceptance Criteria)

1. When `code_outline` is called on a directory with 5 files and `offset: 1, limit: 2`, the system shall return 2 file outlines starting from position 1 (zero-indexed), sorted by modification time desc, with `pagination: { offset: 1, limit: 2, total: 5, hasMore: true }`.
2. When `code_outline` is called on a directory without `offset`/`limit`, the system shall return up to 30 files (replacing the old `MAX_FILES = 50` cap) with `pagination` metadata.
3. When `code_outline` is called on a single file (not a directory), the system shall NOT include a `pagination` field (single-file outline is not paginated).
4. When `review_changes` is called with `offset: 0, limit: 1` on a result with 3 findings, the system shall return 1 finding sorted by severity desc (error > warning > info), with `pagination: { offset: 0, limit: 1, total: 3, hasMore: true }`.
5. When `review_changes` is called without `offset`/`limit`, the system shall return up to 20 findings with `pagination` metadata.
6. When `run_code_review` is called with `offset: 0, limit: 1`, the system shall return the top finding by severity desc (critical > important > suggestion) in a `findings` array, with `pagination: { offset: 0, limit: 1, total: <count>, hasMore: true }`.
7. When `run_code_review` is called without `offset`/`limit`, the system shall return up to 20 findings with `pagination` metadata and continue to include `findingCount` reflecting the total.
8. All 3 tool input schemas include `offset` (number, optional) and `limit` (number, optional) property definitions with descriptions documenting the default and sort key.
9. `npx vitest run packages/cli/tests/mcp/tools/code-nav.test.ts` passes.
10. `npx vitest run packages/cli/tests/mcp/tools/review-changes.test.ts` passes.
11. `npx vitest run packages/cli/tests/mcp/tools/review-pipeline.test.ts` passes.
12. `harness validate` passes.

## File Map

- MODIFY `packages/cli/src/mcp/tools/code-nav.ts` (add offset/limit to `codeOutlineDefinition` schema and `handleCodeOutline` handler; replace `MAX_FILES` cap with pagination; sort files by mtime desc)
- CREATE `packages/cli/tests/mcp/tools/code-nav.test.ts` (pagination tests for code_outline)
- MODIFY `packages/cli/src/mcp/tools/review-changes.ts` (add offset/limit to schema and all three depth handlers; sort findings by severity before paginating)
- MODIFY `packages/cli/tests/mcp/tools/review-changes.test.ts` (add pagination tests)
- MODIFY `packages/cli/src/mcp/tools/review-pipeline.ts` (add offset/limit to schema and handler; include `findings` array in response; sort by severity; paginate)
- CREATE `packages/cli/tests/mcp/tools/review-pipeline.test.ts` (pagination tests for run_code_review)

## Tasks

### Task 1: Add pagination to code_outline definition and handler

**Depends on:** none (Phase 1 complete, paginate() available in @harness-engineering/core)
**Files:** `packages/cli/src/mcp/tools/code-nav.ts`

1. Add `offset` and `limit` to `codeOutlineDefinition.inputSchema.properties`:

   ```typescript
   offset: {
     type: 'number',
     description:
       'Number of file entries to skip (pagination, directory mode only). Default: 0. Files are sorted by modification time desc.',
   },
   limit: {
     type: 'number',
     description:
       'Max file entries to return (pagination, directory mode only). Default: 30.',
   },
   ```

2. Add `offset?: number` and `limit?: number` to the `handleCodeOutline` input type parameter.

3. In `handleCodeOutline`, replace the directory branch (lines 55-71) with pagination logic. The new directory branch should:
   - Import `paginate` from `@harness-engineering/core` (add to the existing dynamic import on line 44)
   - Import `stat` for per-file mtime lookup (already imported on line 45)
   - After globbing files, stat each file to get `mtimeMs`
   - Sort files by `mtimeMs` descending
   - Call `paginate(sortedFiles, offset ?? 0, limit ?? 30)` instead of `files.slice(0, MAX_FILES)`
   - Generate outlines only for the paginated slice (not the full list)
   - Build a structured JSON response (not just concatenated text) when paginating:

     ```typescript
     const paginatedFiles = paginate(sortedFiles, input.offset ?? 0, input.limit ?? 30);

     const results: string[] = [];
     for (const file of paginatedFiles.items) {
       const outline = await getOutline(file.path);
       results.push(formatOutline(outline));
     }

     const responseObj = {
       outlines: results.join('\n\n'),
       pagination: paginatedFiles.pagination,
     };
     return { content: [{ type: 'text' as const, text: JSON.stringify(responseObj) }] };
     ```

   - Remove the `MAX_FILES` constant (line 61) and the old "... and N more files" truncation message (lines 66-69)

4. Full replacement for the directory branch (lines 55-71 currently). Replace:

   ```typescript
   const results: string[] = [];
   const MAX_FILES = 50;
   for (const file of files.slice(0, MAX_FILES)) {
     const outline = await getOutline(file);
     results.push(formatOutline(outline));
   }
   if (files.length > MAX_FILES) {
     results.push(
       `\n... and ${files.length - MAX_FILES} more files (use a narrower glob to see them)`
     );
   }
   return { content: [{ type: 'text' as const, text: results.join('\n\n') }] };
   ```

   With:

   ```typescript
   // Sort files by modification time desc for relevance-based pagination
   const fileStats = await Promise.all(
     files.map(async (f) => {
       const fStat = await stat(f).catch(() => null);
       return { path: f, mtimeMs: fStat?.mtimeMs ?? 0 };
     })
   );
   fileStats.sort((a, b) => b.mtimeMs - a.mtimeMs);

   const { paginate } = await import('@harness-engineering/core');
   const paged = paginate(fileStats, input.offset ?? 0, input.limit ?? 30);

   const results: string[] = [];
   for (const entry of paged.items) {
     const outline = await getOutline(entry.path);
     results.push(formatOutline(outline));
   }

   return {
     content: [
       {
         type: 'text' as const,
         text: JSON.stringify({
           outlines: results.join('\n\n'),
           pagination: paged.pagination,
         }),
       },
     ],
   };
   ```

5. Run: `harness validate`
6. Commit: `feat(code-nav): add offset/limit pagination to code_outline, replace MAX_FILES cap`

### Task 2: Add code_outline pagination tests

**Depends on:** Task 1
**Files:** `packages/cli/tests/mcp/tools/code-nav.test.ts`

1. Create test file `packages/cli/tests/mcp/tools/code-nav.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { codeOutlineDefinition, handleCodeOutline } from '../../../src/mcp/tools/code-nav';
   import { join } from 'path';

   describe('code_outline tool', () => {
     describe('definition', () => {
       it('has correct name', () => {
         expect(codeOutlineDefinition.name).toBe('code_outline');
       });

       it('has offset and limit properties in schema', () => {
         const props = codeOutlineDefinition.inputSchema.properties;
         expect(props).toHaveProperty('offset');
         expect(props).toHaveProperty('limit');
         expect(props.offset.type).toBe('number');
         expect(props.limit.type).toBe('number');
       });
     });

     describe('directory pagination', () => {
       // Use packages/core/src/code-nav as a test directory (contains known .ts files)
       const testDir = join(__dirname, '..', '..', '..', '..', '..', 'core', 'src', 'code-nav');

       it('returns pagination metadata with default offset/limit', async () => {
         const result = await handleCodeOutline({ path: testDir });
         expect(result.isError).toBeFalsy();
         const parsed = JSON.parse(result.content[0].text);
         expect(parsed).toHaveProperty('pagination');
         expect(parsed.pagination).toHaveProperty('offset', 0);
         expect(parsed.pagination).toHaveProperty('limit', 30);
         expect(parsed.pagination).toHaveProperty('total');
         expect(typeof parsed.pagination.total).toBe('number');
         expect(parsed.pagination).toHaveProperty('hasMore');
       });

       it('respects offset and limit params', async () => {
         const fullResult = await handleCodeOutline({ path: testDir });
         const fullParsed = JSON.parse(fullResult.content[0].text);
         const total = fullParsed.pagination.total;

         if (total >= 2) {
           const pagedResult = await handleCodeOutline({
             path: testDir,
             offset: 1,
             limit: 1,
           });
           const pagedParsed = JSON.parse(pagedResult.content[0].text);
           expect(pagedParsed.pagination.offset).toBe(1);
           expect(pagedParsed.pagination.limit).toBe(1);
           expect(pagedParsed.pagination.total).toBe(total);
           expect(pagedParsed.pagination.hasMore).toBe(total > 2);
         }
       });

       it('returns hasMore false when all items fit', async () => {
         const result = await handleCodeOutline({
           path: testDir,
           offset: 0,
           limit: 100,
         });
         const parsed = JSON.parse(result.content[0].text);
         expect(parsed.pagination.hasMore).toBe(false);
       });
     });

     describe('single file mode', () => {
       it('does not include pagination for single file', async () => {
         const testFile = join(
           __dirname,
           '..',
           '..',
           '..',
           '..',
           '..',
           'core',
           'src',
           'code-nav',
           'types.ts'
         );
         const result = await handleCodeOutline({ path: testFile });
         expect(result.isError).toBeFalsy();
         // Single file returns plain text, not JSON with pagination
         const text = result.content[0].text;
         expect(() => {
           const parsed = JSON.parse(text);
           expect(parsed).not.toHaveProperty('pagination');
         }).toThrow(); // Single file is plain text, not JSON
       });
     });
   });
   ```

2. Run test: `npx vitest run packages/cli/tests/mcp/tools/code-nav.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(code-nav): add pagination tests for code_outline`

### Task 3: Add pagination to review_changes definition and handler

**Depends on:** none (parallel with Task 1)
**Files:** `packages/cli/src/mcp/tools/review-changes.ts`

1. Add `offset` and `limit` to `reviewChangesDefinition.inputSchema.properties`:

   ```typescript
   offset: {
     type: 'number',
     description:
       'Number of findings to skip (pagination). Default: 0. Findings are sorted by severity desc (error > warning > info).',
   },
   limit: {
     type: 'number',
     description: 'Max findings to return (pagination). Default: 20.',
   },
   ```

2. Add `offset?: number` and `limit?: number` to the `handleReviewChanges` input type.

3. Thread `offset` and `limit` through to the depth handlers. Change the handler call (line 111) from:

   ```typescript
   const reviewFn = DEPTH_HANDLERS[effectiveDepth];
   return await reviewFn(projectPath, diff, diffLines, downgraded);
   ```

   To:

   ```typescript
   const reviewFn = DEPTH_HANDLERS[effectiveDepth];
   return await reviewFn(projectPath, diff, diffLines, downgraded, input.offset, input.limit);
   ```

4. Update the `ReviewHandler` type (line 240) to include offset/limit:

   ```typescript
   type ReviewHandler = (
     projectPath: string,
     diff: string,
     diffLines: number,
     downgraded: boolean,
     offset?: number,
     limit?: number
   ) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
   ```

5. Define a severity sort order constant and a helper at the top of the file (after the `SIZE_GATE_LINES` constant):

   ```typescript
   const SEVERITY_ORDER: Record<string, number> = {
     error: 0,
     critical: 0,
     warning: 1,
     important: 1,
     info: 2,
     suggestion: 2,
   };

   function sortFindingsBySeverity(findings: unknown[]): unknown[] {
     return [...findings].sort((a, b) => {
       const aObj = a as Record<string, unknown>;
       const bObj = b as Record<string, unknown>;
       const aSev = SEVERITY_ORDER[String(aObj.severity ?? '')] ?? 99;
       const bSev = SEVERITY_ORDER[String(bObj.severity ?? '')] ?? 99;
       return aSev - bSev;
     });
   }
   ```

6. Update `runQuickReview` signature and body to paginate findings. Add `offset?: number, limit?: number` params. After extracting `parsed.findings`, sort and paginate:

   ```typescript
   async function runQuickReview(
     projectPath: string,
     diff: string,
     diffLines: number,
     downgraded: boolean,
     offset?: number,
     limit?: number
   ) {
     const { handleAnalyzeDiff } = await import('./feedback.js');
     const { paginate } = await import('@harness-engineering/core');
     const result = await handleAnalyzeDiff({ diff, path: projectPath });
     const firstContent = result.content[0];
     if (!firstContent) throw new Error('Empty analyze_diff response');
     const parsed = JSON.parse(firstContent.text);

     const rawFindings = parsed.findings ?? parsed.warnings ?? [];
     const sorted = sortFindingsBySeverity(rawFindings);
     const paged = paginate(sorted, offset ?? 0, limit ?? 20);

     return {
       content: [
         {
           type: 'text' as const,
           text: JSON.stringify({
             depth: 'quick',
             downgraded,
             findings: paged.items,
             pagination: paged.pagination,
             fileCount: parsed.summary?.filesChanged ?? parsed.files?.length ?? 0,
             lineCount: diffLines,
             ...(result.isError ? { error: parsed } : {}),
           }),
         },
       ],
     };
   }
   ```

7. Apply the same pattern to `runStandardReview` -- add `offset?: number, limit?: number` params, sort combined findings, paginate:

   ```typescript
   async function runStandardReview(
     projectPath: string,
     diff: string,
     diffLines: number,
     downgraded: boolean,
     offset?: number,
     limit?: number
   ) {
     const { handleAnalyzeDiff, handleCreateSelfReview } = await import('./feedback.js');
     const { paginate } = await import('@harness-engineering/core');
     const [diffResult, reviewResult] = await Promise.all([
       handleAnalyzeDiff({ diff, path: projectPath }),
       handleCreateSelfReview({ path: projectPath, diff }),
     ]);

     const diffContent = diffResult.content[0];
     const reviewContent = reviewResult.content[0];
     if (!diffContent || !reviewContent) throw new Error('Empty review response');
     const diffParsed = JSON.parse(diffContent.text);
     const reviewParsed = JSON.parse(reviewContent.text);

     const findings = [
       ...extractFindings(diffParsed, 'findings', 'warnings'),
       ...extractFindings(reviewParsed, 'findings', 'items'),
     ];
     const sorted = sortFindingsBySeverity(findings);
     const paged = paginate(sorted, offset ?? 0, limit ?? 20);

     return {
       content: [
         {
           type: 'text' as const,
           text: JSON.stringify({
             depth: 'standard',
             downgraded,
             findings: paged.items,
             pagination: paged.pagination,
             diffAnalysis: diffParsed,
             selfReview: reviewParsed,
             fileCount: extractFileCount(diffParsed),
             lineCount: diffLines,
           }),
         },
       ],
     };
   }
   ```

8. Apply the same pattern to `runDeepReview` -- add `offset?: number, limit?: number` params. Note: deep review delegates to `handleRunCodeReview` which will get its own pagination in Task 5. For deep mode, paginate the `parsed.findings` from the pipeline result:

   ```typescript
   async function runDeepReview(
     projectPath: string,
     diff: string,
     diffLines: number,
     _downgraded: boolean,
     offset?: number,
     limit?: number
   ) {
     const { handleRunCodeReview } = await import('./review-pipeline.js');
     const { paginate } = await import('@harness-engineering/core');
     const result = await handleRunCodeReview({ path: projectPath, diff });
     const deepContent = result.content[0];
     if (!deepContent) throw new Error('Empty code review response');
     const parsed = JSON.parse(deepContent.text);

     const rawFindings = parsed.findings ?? [];
     const sorted = sortFindingsBySeverity(rawFindings);
     const paged = paginate(sorted, offset ?? 0, limit ?? 20);

     return {
       content: [
         {
           type: 'text' as const,
           text: JSON.stringify({
             depth: 'deep',
             downgraded: false,
             findings: paged.items,
             pagination: paged.pagination,
             assessment: parsed.assessment,
             findingCount: parsed.findingCount,
             lineCount: diffLines,
             pipeline: parsed,
           }),
         },
       ],
     };
   }
   ```

9. Run: `harness validate`
10. Commit: `feat(review): add offset/limit pagination to review_changes, sort findings by severity`

### Task 4: Add review_changes pagination tests

**Depends on:** Task 3
**Files:** `packages/cli/tests/mcp/tools/review-changes.test.ts`

1. Add pagination tests to the existing test file. Append the following describe block after the existing `review_changes snapshot parity` describe:

   ```typescript
   describe('pagination', () => {
     const minimalDiff = [
       'diff --git a/test.ts b/test.ts',
       'index 1234567..abcdefg 100644',
       '--- a/test.ts',
       '+++ b/test.ts',
       '@@ -1,3 +1,4 @@',
       ' const a = 1;',
       '+const b = 2;',
       ' const c = 3;',
     ].join('\n');

     it('quick depth includes pagination metadata with defaults', async () => {
       const response = await handleReviewChanges({
         path: '/nonexistent/project-pagination',
         depth: 'quick',
         diff: minimalDiff,
       });
       expect(response.isError).toBeFalsy();
       const parsed = JSON.parse(response.content[0].text);
       expect(parsed).toHaveProperty('pagination');
       expect(parsed.pagination).toHaveProperty('offset', 0);
       expect(parsed.pagination).toHaveProperty('limit', 20);
       expect(parsed.pagination).toHaveProperty('total');
       expect(typeof parsed.pagination.total).toBe('number');
       expect(parsed.pagination).toHaveProperty('hasMore');
     });

     it('standard depth includes pagination metadata', async () => {
       const response = await handleReviewChanges({
         path: '/nonexistent/project-pagination',
         depth: 'standard',
         diff: minimalDiff,
       });
       expect(response.isError).toBeFalsy();
       const parsed = JSON.parse(response.content[0].text);
       expect(parsed).toHaveProperty('pagination');
       expect(parsed.pagination.offset).toBe(0);
       expect(parsed.pagination.limit).toBe(20);
     });

     it('respects offset and limit params', async () => {
       const response = await handleReviewChanges({
         path: '/nonexistent/project-pagination',
         depth: 'quick',
         diff: minimalDiff,
         offset: 0,
         limit: 1,
       });
       expect(response.isError).toBeFalsy();
       const parsed = JSON.parse(response.content[0].text);
       expect(parsed.pagination.offset).toBe(0);
       expect(parsed.pagination.limit).toBe(1);
     });

     it('offset beyond findings returns empty with hasMore false', async () => {
       const response = await handleReviewChanges({
         path: '/nonexistent/project-pagination',
         depth: 'quick',
         diff: minimalDiff,
         offset: 1000,
         limit: 20,
       });
       expect(response.isError).toBeFalsy();
       const parsed = JSON.parse(response.content[0].text);
       expect(parsed.findings).toHaveLength(0);
       expect(parsed.pagination.hasMore).toBe(false);
       expect(parsed.pagination.offset).toBe(1000);
     });
   });
   ```

2. Also add `offset` and `limit` schema property tests to the existing `definition` describe block:

   ```typescript
   it('has optional offset and limit properties', () => {
     const props = reviewChangesDefinition.inputSchema.properties;
     expect(props).toHaveProperty('offset');
     expect(props).toHaveProperty('limit');
     expect(props.offset.type).toBe('number');
     expect(props.limit.type).toBe('number');
   });
   ```

3. Run test: `npx vitest run packages/cli/tests/mcp/tools/review-changes.test.ts`
4. Observe: all tests pass
5. Run: `harness validate`
6. Commit: `test(review): add pagination tests for review_changes`

### Task 5: Add pagination to run_code_review definition and handler

**Depends on:** none (parallel with Tasks 1-4)
**Files:** `packages/cli/src/mcp/tools/review-pipeline.ts`

1. Add `offset` and `limit` to `runCodeReviewDefinition.inputSchema.properties`:

   ```typescript
   offset: {
     type: 'number',
     description:
       'Number of findings to skip (pagination). Default: 0. Findings are sorted by severity desc (critical > important > suggestion).',
   },
   limit: {
     type: 'number',
     description: 'Max findings to return (pagination). Default: 20.',
   },
   ```

2. Add `offset?: number` and `limit?: number` to the `handleRunCodeReview` input type.

3. Define severity sort order at the top of the file (after imports):

   ```typescript
   const FINDING_SEVERITY_ORDER: Record<string, number> = {
     critical: 0,
     important: 1,
     suggestion: 2,
   };
   ```

4. In the success path of `handleRunCodeReview` (after `runReviewPipeline` returns `result`), sort findings by severity and paginate. Replace the current response construction (lines 105-126) with:

   ```typescript
   const { paginate } = await import('@harness-engineering/core');

   // Sort findings by severity desc before pagination
   const sortedFindings = [...result.findings].sort(
     (a, b) =>
       (FINDING_SEVERITY_ORDER[a.severity] ?? 99) - (FINDING_SEVERITY_ORDER[b.severity] ?? 99)
   );

   const paged = paginate(sortedFindings, input.offset ?? 0, input.limit ?? 20);

   return {
     content: [
       {
         type: 'text' as const,
         text: JSON.stringify(
           {
             skipped: result.skipped,
             skipReason: result.skipReason,
             stoppedByMechanical: result.stoppedByMechanical,
             assessment: result.assessment,
             findings: paged.items,
             findingCount: result.findings.length,
             pagination: paged.pagination,
             terminalOutput: result.terminalOutput,
             githubCommentCount: result.githubComments.length,
             exitCode: result.exitCode,
           },
           null,
           2
         ),
       },
     ],
     isError: false,
   };
   ```

   Key changes from the original:
   - [ADDED] `findings` array (paginated slice) in the response
   - [ADDED] `pagination` field with PaginationMeta
   - [MODIFIED] `findingCount` remains as total count (unchanged semantics)

5. Run: `harness validate`
6. Commit: `feat(review-pipeline): add offset/limit pagination to run_code_review, include findings in response`

### Task 6: Add run_code_review pagination tests

**Depends on:** Task 5
**Files:** `packages/cli/tests/mcp/tools/review-pipeline.test.ts`

1. Create test file `packages/cli/tests/mcp/tools/review-pipeline.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import {
     runCodeReviewDefinition,
     handleRunCodeReview,
   } from '../../../src/mcp/tools/review-pipeline';

   describe('run_code_review tool', () => {
     describe('definition', () => {
       it('has correct name', () => {
         expect(runCodeReviewDefinition.name).toBe('run_code_review');
       });

       it('requires path and diff', () => {
         expect(runCodeReviewDefinition.inputSchema.required).toContain('path');
         expect(runCodeReviewDefinition.inputSchema.required).toContain('diff');
       });

       it('has offset and limit properties in schema', () => {
         const props = runCodeReviewDefinition.inputSchema.properties;
         expect(props).toHaveProperty('offset');
         expect(props).toHaveProperty('limit');
         expect(props.offset.type).toBe('number');
         expect(props.limit.type).toBe('number');
       });
     });

     describe('pagination', () => {
       const minimalDiff = [
         'diff --git a/test.ts b/test.ts',
         'index 1234567..abcdefg 100644',
         '--- a/test.ts',
         '+++ b/test.ts',
         '@@ -1,3 +1,4 @@',
         ' const a = 1;',
         '+const b = 2;',
         ' const c = 3;',
       ].join('\n');

       it('includes pagination metadata with defaults', async () => {
         const response = await handleRunCodeReview({
           path: '/nonexistent/project-pipeline-test',
           diff: minimalDiff,
         });
         // Pipeline may error on nonexistent path but should still parse
         if (!response.isError) {
           const parsed = JSON.parse(response.content[0].text);
           expect(parsed).toHaveProperty('pagination');
           expect(parsed.pagination).toHaveProperty('offset', 0);
           expect(parsed.pagination).toHaveProperty('limit', 20);
           expect(parsed.pagination).toHaveProperty('total');
           expect(parsed.pagination).toHaveProperty('hasMore');
           expect(parsed).toHaveProperty('findings');
           expect(Array.isArray(parsed.findings)).toBe(true);
           // findingCount should reflect total, not page size
           expect(parsed.findingCount).toBe(parsed.pagination.total);
         }
       });

       it('respects offset and limit params', async () => {
         const response = await handleRunCodeReview({
           path: '/nonexistent/project-pipeline-test',
           diff: minimalDiff,
           offset: 0,
           limit: 1,
         });
         if (!response.isError) {
           const parsed = JSON.parse(response.content[0].text);
           expect(parsed.pagination.offset).toBe(0);
           expect(parsed.pagination.limit).toBe(1);
           expect(parsed.findings.length).toBeLessThanOrEqual(1);
         }
       });

       it('offset beyond findings returns empty page', async () => {
         const response = await handleRunCodeReview({
           path: '/nonexistent/project-pipeline-test',
           diff: minimalDiff,
           offset: 10000,
           limit: 20,
         });
         if (!response.isError) {
           const parsed = JSON.parse(response.content[0].text);
           expect(parsed.findings).toHaveLength(0);
           expect(parsed.pagination.hasMore).toBe(false);
         }
       });
     });
   });
   ```

2. Run test: `npx vitest run packages/cli/tests/mcp/tools/review-pipeline.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(review-pipeline): add pagination tests for run_code_review`
