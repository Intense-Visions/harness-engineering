# Plan: Analysis Tracker Sync -- Phase 2 Adapter + Rendering

**Date:** 2026-04-15 | **Spec:** docs/changes/analysis-tracker-sync/proposal.md | **Tasks:** 7 | **Time:** ~30 min

## Goal

Implement the GitHub `fetchComments` adapter, rework `renderAnalysisComment()` to the spec's structured format with discriminator JSON, and wire `externalId` from the roadmap through the `Issue` type into `AnalysisRecord` at analysis time.

## Observable Truths (Acceptance Criteria)

1. When `fetchComments("github:owner/repo#42")` is called on `GitHubIssuesSyncAdapter`, the system shall call `GET /repos/owner/repo/issues/42/comments` with pagination (`per_page=100`, advancing `page` until fewer than 100 results) and return `Ok(TrackerComment[])` with `id` stringified, `body`, `createdAt` from `created_at`, `updatedAt` from `updated_at`, and `author` from `user.login`.
2. When `fetchComments` is called with an invalid `externalId`, the system shall return `Err` with a message matching `/Invalid externalId/`.
3. When `fetchComments` encounters a non-ok HTTP response, the system shall return `Err` with the status code in the error message.
4. `renderAnalysisComment(record)` shall produce markdown containing: a `## Harness Analysis:` header, `**Risk:**`, `**Route:**`, `**Analyzed:**` fields, reasoning bullets, and a `<details>` block with a JSON code fence whose parsed content includes `"_harness_analysis": true` and `"_version": 1` alongside all `AnalysisRecord` fields.
5. The `Issue` interface in `packages/types/src/orchestrator.ts` shall include `externalId: string | null`.
6. When the orchestrator archives analysis results, the system shall populate `externalId` from `issue.externalId ?? null` (not hardcoded `null`).
7. When `AnalysisArchive.get()` or `.list()` reads a record that lacks `externalId` (pre-existing file), the system shall backfill `record.externalId ??= null` so callers always see the field.
8. `npx vitest run` in `packages/core` passes with all existing tests plus new `fetchComments` tests.
9. `npx vitest run` in `packages/cli` passes with new `renderAnalysisComment` tests.
10. TypeScript type-check passes for `packages/types`, `packages/core`, `packages/orchestrator`, and `packages/cli`.

## File Map

- MODIFY `packages/types/src/orchestrator.ts` (add `externalId: string | null` to `Issue` interface)
- MODIFY `packages/orchestrator/src/tracker/adapters/roadmap.ts` (propagate `feature.externalId` in `mapFeatureToIssue`)
- MODIFY `packages/orchestrator/src/server/routes/dispatch-actions.ts` (add `externalId: null` to Issue literal)
- MODIFY `packages/orchestrator/src/orchestrator.ts` (change `externalId: null` to `externalId: issue.externalId ?? null`)
- MODIFY `packages/orchestrator/src/core/analysis-archive.ts` (backfill `externalId` in `get()` and `list()`)
- MODIFY `packages/orchestrator/tests/core/reconciliation.test.ts` (add `externalId: null` to `makeIssue`)
- MODIFY `packages/orchestrator/tests/core/model-router.test.ts` (add `externalId: null` to `makeIssue`)
- MODIFY `packages/orchestrator/tests/core/state-machine.test.ts` (add `externalId: null` to `makeIssue`)
- MODIFY `packages/orchestrator/tests/core/candidate-selection.test.ts` (add `externalId: null` to `makeIssue`)
- MODIFY `packages/orchestrator/tests/integration/orchestrator.test.ts` (add `externalId: null` to `mockIssue`)
- MODIFY `packages/orchestrator/tests/integration/orchestrator-sentinel.test.ts` (add `externalId: null` to `mockIssue`)
- MODIFY `packages/intelligence/tests/adapter.test.ts` (add `externalId: null` to `makeIssue`)
- MODIFY `packages/intelligence/tests/pipeline.test.ts` (add `externalId: null` to `makeIssue`)
- MODIFY `packages/core/src/roadmap/adapters/github-issues.ts` (replace `fetchComments` stub with real implementation)
- MODIFY `packages/core/tests/roadmap/github-issues.test.ts` (replace stub test with full `fetchComments` tests)
- MODIFY `packages/cli/src/commands/publish-analyses.ts` (rework `renderAnalysisComment`)
- CREATE `packages/cli/tests/commands/publish-analyses.test.ts` (tests for `renderAnalysisComment`)

## Tasks

### Task 1: Add `externalId` to `Issue` type and propagate through production code

**Depends on:** none | **Files:** `packages/types/src/orchestrator.ts`, `packages/orchestrator/src/tracker/adapters/roadmap.ts`, `packages/orchestrator/src/server/routes/dispatch-actions.ts`

1. In `packages/types/src/orchestrator.ts`, add `externalId` to the `Issue` interface after the `updatedAt` field (line 66):

   Change:

   ```typescript
     /** ISO timestamp of last update */
     updatedAt: string | null;
   }
   ```

   To:

   ```typescript
     /** ISO timestamp of last update */
     updatedAt: string | null;
     /** External tracker ID (e.g., "github:owner/repo#42"), null if not synced */
     externalId: string | null;
   }
   ```

2. In `packages/orchestrator/src/tracker/adapters/roadmap.ts`, update `mapFeatureToIssue` (line 102-124) to include `externalId`:

   Change:

   ```typescript
       createdAt: null,
       updatedAt: null,
     };
   ```

   To:

   ```typescript
       createdAt: null,
       updatedAt: null,
       externalId: feature.externalId ?? null,
     };
   ```

3. In `packages/orchestrator/src/server/routes/dispatch-actions.ts`, update the Issue literal (line 59-74) to include `externalId`:

   Change:

   ```typescript
         createdAt: new Date().toISOString(),
         updatedAt: new Date().toISOString(),
       };
   ```

   To:

   ```typescript
         createdAt: new Date().toISOString(),
         updatedAt: new Date().toISOString(),
         externalId: null,
       };
   ```

4. Do NOT commit yet -- Task 2 must follow to fix test compilation.

### Task 2: Update all `makeIssue` / `mockIssue` test helpers to include `externalId`

**Depends on:** Task 1 | **Files:** 8 test files

In each of the following files, add `externalId: null,` after the `updatedAt` line in the Issue literal:

1. `packages/orchestrator/tests/core/reconciliation.test.ts` -- in `makeIssue` (line 22), after `updatedAt: null,` add `externalId: null,`
2. `packages/orchestrator/tests/core/model-router.test.ts` -- in `makeIssue` (line 20), after `updatedAt: null,` add `externalId: null,`
3. `packages/orchestrator/tests/core/state-machine.test.ts` -- in `makeIssue` (line 60), after `updatedAt: null,` add `externalId: null,`
4. `packages/orchestrator/tests/core/candidate-selection.test.ts` -- in `makeIssue` (line 21), after `updatedAt: null,` add `externalId: null,`
5. `packages/orchestrator/tests/integration/orchestrator.test.ts` -- in `mockIssue` (after `updatedAt: null,`), add `externalId: null,`
6. `packages/orchestrator/tests/integration/orchestrator-sentinel.test.ts` -- in `mockIssue` (after `updatedAt: null,`), add `externalId: null,`
7. `packages/intelligence/tests/adapter.test.ts` -- in `makeIssue` (after `updatedAt:`), add `externalId: null,`
8. `packages/intelligence/tests/pipeline.test.ts` -- in `makeIssue` (after `updatedAt:`), add `externalId: null,`

After all edits:

9. Run: `cd packages/types && npx tsc --noEmit` -- must pass.
10. Run: `cd packages/orchestrator && npx tsc --noEmit` -- expect pass (pre-existing analyze.ts:51 failure is unrelated).
11. Run: `cd packages/intelligence && npx tsc --noEmit` -- must pass.
12. Run: `cd packages/orchestrator && npx vitest run tests/core/reconciliation.test.ts tests/core/model-router.test.ts tests/core/state-machine.test.ts tests/core/candidate-selection.test.ts` -- must pass.
13. Commit (covers Tasks 1+2 together): `feat(types): add externalId to Issue interface and propagate through adapters`

### Task 3: Wire `externalId` into `archiveAnalysisResults` and backfill in `AnalysisArchive`

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/src/core/analysis-archive.ts`

1. In `packages/orchestrator/src/orchestrator.ts`, at line 349, change:

   ```typescript
           externalId: null, // TODO(analysis-tracker-sync): populate from issue.externalId in Phase 2
   ```

   To:

   ```typescript
           externalId: issue.externalId ?? null,
   ```

2. In `packages/orchestrator/src/core/analysis-archive.ts`, update the `get()` method (line 53-61) to backfill `externalId`:

   Change:

   ```typescript
     async get(issueId: string): Promise<AnalysisRecord | null> {
       const filePath = path.join(this.dir, `${issueId}.json`);
       try {
         const raw = await fs.readFile(filePath, 'utf-8');
         return JSON.parse(raw) as AnalysisRecord;
       } catch (err) {
         if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
         throw err;
       }
     }
   ```

   To:

   ```typescript
     async get(issueId: string): Promise<AnalysisRecord | null> {
       const filePath = path.join(this.dir, `${issueId}.json`);
       try {
         const raw = await fs.readFile(filePath, 'utf-8');
         const record = JSON.parse(raw) as AnalysisRecord;
         record.externalId ??= null;
         return record;
       } catch (err) {
         if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
         throw err;
       }
     }
   ```

3. In the same file, update `list()` (line 67-84) to backfill `externalId`:

   Change:

   ```typescript
   const raw = await fs.readFile(filePath, 'utf-8');
   records.push(JSON.parse(raw) as AnalysisRecord);
   ```

   To:

   ```typescript
   const raw = await fs.readFile(filePath, 'utf-8');
   const record = JSON.parse(raw) as AnalysisRecord;
   record.externalId ??= null;
   records.push(record);
   ```

4. Run: `cd packages/orchestrator && npx tsc --noEmit` -- expect pass (pre-existing analyze.ts:51 failure is unrelated).
5. Run: `cd packages/orchestrator && npx vitest run` -- must pass (190/194, same 4 pre-existing failures).
6. Commit: `feat(orchestrator): wire externalId from Issue into AnalysisRecord and backfill on read`

### Task 4: Write tests for `fetchComments` on `GitHubIssuesSyncAdapter`

**Depends on:** none (parallelizable with Tasks 1-3) | **Files:** `packages/core/tests/roadmap/github-issues.test.ts`

1. In `packages/core/tests/roadmap/github-issues.test.ts`, replace the existing `fetchComments` describe block (lines 476-490) with the following comprehensive tests:

   ```typescript
   describe('fetchComments', () => {
     it('fetches and maps comments from a single page', async () => {
       const fetchFn = mockFetch(200, [
         {
           id: 101,
           body: 'First comment',
           created_at: '2026-01-01T00:00:00Z',
           updated_at: '2026-01-02T00:00:00Z',
           user: { login: 'alice' },
         },
         {
           id: 102,
           body: 'Second comment',
           created_at: '2026-01-03T00:00:00Z',
           updated_at: null,
           user: { login: 'bob' },
         },
       ]);
       const adapter = new GitHubIssuesSyncAdapter({
         token: 'tok',
         config: DEFAULT_CONFIG,
         fetchFn,
       });

       const result = await adapter.fetchComments('github:owner/repo#42');
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value).toHaveLength(2);
       expect(result.value[0]).toEqual({
         id: '101',
         body: 'First comment',
         createdAt: '2026-01-01T00:00:00Z',
         updatedAt: '2026-01-02T00:00:00Z',
         author: 'alice',
       });
       expect(result.value[1]).toEqual({
         id: '102',
         body: 'Second comment',
         createdAt: '2026-01-03T00:00:00Z',
         updatedAt: null,
         author: 'bob',
       });

       const [url, opts] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]!;
       expect(url).toBe(
         'https://api.github.com/repos/owner/repo/issues/42/comments?per_page=100&page=1'
       );
       expect(opts.method).toBe('GET');
     });

     it('paginates when first page returns 100 results', async () => {
       const page1 = Array.from({ length: 100 }, (_, i) => ({
         id: i + 1,
         body: `Comment ${i + 1}`,
         created_at: '2026-01-01T00:00:00Z',
         updated_at: null,
         user: { login: 'user' },
       }));
       const page2 = [
         {
           id: 101,
           body: 'Last comment',
           created_at: '2026-01-02T00:00:00Z',
           updated_at: null,
           user: { login: 'user' },
         },
       ];
       const fetchFn = mockFetchSequence(
         { status: 200, body: page1 },
         { status: 200, body: page2 }
       );
       const adapter = new GitHubIssuesSyncAdapter({
         token: 'tok',
         config: DEFAULT_CONFIG,
         fetchFn,
       });

       const result = await adapter.fetchComments('github:owner/repo#42');
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value).toHaveLength(101);
       expect(result.value[100]!.id).toBe('101');

       expect(fetchFn).toHaveBeenCalledTimes(2);
       const [url2] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[1]!;
       expect(url2).toContain('page=2');
     });

     it('returns empty array when issue has no comments', async () => {
       const fetchFn = mockFetch(200, []);
       const adapter = new GitHubIssuesSyncAdapter({
         token: 'tok',
         config: DEFAULT_CONFIG,
         fetchFn,
       });

       const result = await adapter.fetchComments('github:owner/repo#42');
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value).toEqual([]);
     });

     it('returns Err for invalid externalId', async () => {
       const fetchFn = mockFetch(200, []);
       const adapter = new GitHubIssuesSyncAdapter({
         token: 'tok',
         config: DEFAULT_CONFIG,
         fetchFn,
       });

       const result = await adapter.fetchComments('invalid-id');
       expect(result.ok).toBe(false);
       if (result.ok) return;
       expect(result.error.message).toMatch(/Invalid externalId/);
     });

     it('returns Err on API failure', async () => {
       const fetchFn = mockFetch(404, { message: 'Not Found' });
       const adapter = new GitHubIssuesSyncAdapter({
         token: 'tok',
         config: DEFAULT_CONFIG,
         fetchFn,
         maxRetries: 0,
       });

       const result = await adapter.fetchComments('github:owner/repo#42');
       expect(result.ok).toBe(false);
       if (result.ok) return;
       expect(result.error.message).toMatch(/404/);
     });
   });
   ```

2. Run: `cd packages/core && npx vitest run tests/roadmap/github-issues.test.ts` -- the new tests should FAIL (stub still returns Err). The stub test and the new "fetches and maps" test should both fail. This confirms TDD red phase.
3. Do NOT commit yet -- Task 5 implements the production code.

### Task 5: Implement `fetchComments` on `GitHubIssuesSyncAdapter`

**Depends on:** Task 4 | **Files:** `packages/core/src/roadmap/adapters/github-issues.ts`

1. In `packages/core/src/roadmap/adapters/github-issues.ts`, replace the stub `fetchComments` method (lines 499-501) with the real implementation:

   Change:

   ```typescript
     async fetchComments(_externalId: string): Promise<Result<TrackerComment[]>> {
       return Err(new Error('fetchComments not implemented — see Phase 2 of analysis-tracker-sync'));
     }
   ```

   To:

   ```typescript
     async fetchComments(externalId: string): Promise<Result<TrackerComment[]>> {
       try {
         const parsed = parseExternalId(externalId);
         if (!parsed) return Err(new Error(`Invalid externalId format: "${externalId}"`));

         const comments: TrackerComment[] = [];
         const perPage = 100;
         let page = 1;

         while (true) {
           const response = await fetchWithRetry(
             this.fetchFn,
             `${this.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}/comments?per_page=${perPage}&page=${page}`,
             { method: 'GET', headers: this.headers() },
             this.retryOpts
           );

           if (!response.ok) {
             const text = await response.text();
             return Err(new Error(`GitHub API error ${response.status}: ${text}`));
           }

           const data = (await response.json()) as Array<{
             id: number;
             body: string;
             created_at: string;
             updated_at: string | null;
             user: { login: string };
           }>;

           for (const comment of data) {
             comments.push({
               id: String(comment.id),
               body: comment.body,
               createdAt: comment.created_at,
               updatedAt: comment.updated_at ?? null,
               author: comment.user.login,
             });
           }

           if (data.length < perPage) break;
           page++;
         }

         return Ok(comments);
       } catch (error) {
         return Err(error instanceof Error ? error : new Error(String(error)));
       }
     }
   ```

2. Run: `cd packages/core && npx vitest run tests/roadmap/github-issues.test.ts` -- ALL tests should pass, including the new `fetchComments` tests from Task 4.
3. Run: `cd packages/core && npx tsc --noEmit` -- must pass.
4. Commit: `feat(core): implement fetchComments on GitHubIssuesSyncAdapter with pagination`

### Task 6: Write tests for reworked `renderAnalysisComment`

**Depends on:** none (parallelizable with Tasks 1-5) | **Files:** `packages/cli/tests/commands/publish-analyses.test.ts`

First, export `renderAnalysisComment` from the publish-analyses module so it can be tested directly.

1. In `packages/cli/src/commands/publish-analyses.ts`, change the `renderAnalysisComment` function declaration (line 33) from:

   ```typescript
   function renderAnalysisComment(record: AnalysisRecord): string {
   ```

   To:

   ```typescript
   export function renderAnalysisComment(record: AnalysisRecord): string {
   ```

2. Create `packages/cli/tests/commands/publish-analyses.test.ts`:

   ````typescript
   import { describe, it, expect } from 'vitest';
   import { renderAnalysisComment } from '../../src/commands/publish-analyses';
   import type { AnalysisRecord } from '@harness-engineering/orchestrator';

   function makeRecord(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
     return {
       issueId: 'test-issue-1',
       identifier: 'test-feature-abc123',
       spec: null,
       score: {
         overall: 0.65,
         confidence: 0.82,
         riskLevel: 'medium',
         blastRadius: { filesEstimated: 5, modules: 2, services: 1 },
         dimensions: { structural: 0.5, semantic: 0.7, historical: 0.6 },
         reasoning: ['Touches shared utility module', 'No prior changes in this area'],
         recommendedRoute: 'human',
       },
       simulation: null,
       analyzedAt: '2026-04-15T12:00:00Z',
       externalId: 'github:owner/repo#42',
       ...overrides,
     };
   }

   describe('renderAnalysisComment', () => {
     it('includes the summary header with risk, route, confidence, and analyzedAt', () => {
       const result = renderAnalysisComment(makeRecord());
       expect(result).toContain('## Harness Analysis: test-feature-abc123');
       expect(result).toContain('**Risk:** medium (82% confidence)');
       expect(result).toContain('**Route:** human');
       expect(result).toContain('**Analyzed:** 2026-04-15T12:00:00Z');
     });

     it('includes reasoning bullets', () => {
       const result = renderAnalysisComment(makeRecord());
       expect(result).toContain('- Touches shared utility module');
       expect(result).toContain('- No prior changes in this area');
     });

     it('includes a <details> block with discriminator JSON', () => {
       const record = makeRecord();
       const result = renderAnalysisComment(record);
       expect(result).toContain('<details>');
       expect(result).toContain('<summary>Full Analysis Data</summary>');
       expect(result).toContain('```json');
       expect(result).toContain('</details>');

       // Extract and parse the JSON from the code fence
       const jsonMatch = result.match(/```json\n([\s\S]*?)\n```/);
       expect(jsonMatch).not.toBeNull();
       const parsed = JSON.parse(jsonMatch![1]!);
       expect(parsed._harness_analysis).toBe(true);
       expect(parsed._version).toBe(1);
       expect(parsed.issueId).toBe('test-issue-1');
       expect(parsed.identifier).toBe('test-feature-abc123');
       expect(parsed.score.riskLevel).toBe('medium');
     });

     it('handles record with no score gracefully', () => {
       const result = renderAnalysisComment(makeRecord({ score: null }));
       expect(result).toContain('## Harness Analysis: test-feature-abc123');
       // Should still have the details block with JSON
       expect(result).toContain('_harness_analysis');
       // Risk/Route/Confidence lines should not appear
       expect(result).not.toContain('**Risk:**');
     });

     it('renders high risk level correctly', () => {
       const record = makeRecord({
         score: {
           overall: 0.9,
           confidence: 0.95,
           riskLevel: 'high',
           blastRadius: { filesEstimated: 20, modules: 5, services: 3 },
           dimensions: { structural: 0.9, semantic: 0.8, historical: 0.85 },
           reasoning: ['Major cross-cutting change'],
           recommendedRoute: 'simulation-required',
         },
       });
       const result = renderAnalysisComment(record);
       expect(result).toContain('**Risk:** high (95% confidence)');
       expect(result).toContain('**Route:** simulation-required');
     });
   });
   ````

3. Run: `cd packages/cli && npx vitest run tests/commands/publish-analyses.test.ts` -- tests should FAIL because the old `renderAnalysisComment` does not match the new format. This is the TDD red phase.
4. Do NOT commit yet -- Task 7 implements the rework.

### Task 7: Rework `renderAnalysisComment` to spec format

**Depends on:** Task 6 | **Files:** `packages/cli/src/commands/publish-analyses.ts`

1. In `packages/cli/src/commands/publish-analyses.ts`, replace the entire `renderAnalysisComment` function (lines 33-81) with:

   ````typescript
   /**
    * Renders an AnalysisRecord as a structured markdown comment.
    * Format: summary header + reasoning bullets + collapsible JSON with discriminator.
    */
   export function renderAnalysisComment(record: AnalysisRecord): string {
     const lines: string[] = [];

     lines.push(`## Harness Analysis: ${record.identifier}`);
     lines.push('');

     if (record.score) {
       lines.push(
         `**Risk:** ${record.score.riskLevel} (${(record.score.confidence * 100).toFixed(0)}% confidence)`
       );
       lines.push(`**Route:** ${record.score.recommendedRoute}`);
     }
     lines.push(`**Analyzed:** ${record.analyzedAt}`);
     lines.push('');

     if (record.score && record.score.reasoning.length > 0) {
       for (const r of record.score.reasoning) {
         lines.push(`- ${r}`);
       }
       lines.push('');
     }

     // Collapsible details block with full AnalysisRecord + discriminator fields
     const jsonPayload = {
       _harness_analysis: true,
       _version: 1,
       ...record,
     };

     lines.push('<details>');
     lines.push('<summary>Full Analysis Data</summary>');
     lines.push('');
     lines.push('```json');
     lines.push(JSON.stringify(jsonPayload, null, 2));
     lines.push('```');
     lines.push('');
     lines.push('</details>');

     return lines.join('\n');
   }
   ````

2. Run: `cd packages/cli && npx vitest run tests/commands/publish-analyses.test.ts` -- ALL tests should now pass.
3. Run: `cd packages/cli && npx tsc --noEmit` -- must pass.
4. Commit: `feat(cli): rework renderAnalysisComment to structured format with discriminator JSON`

## Parallel Opportunities

- Tasks 1-3 (Issue type + externalId wiring) are sequential: type -> test helpers -> archiver.
- Tasks 4-5 (fetchComments tests + implementation) are sequential (TDD): test -> implement.
- Tasks 6-7 (renderAnalysisComment tests + implementation) are sequential (TDD): test -> implement.
- The three chains (1-3, 4-5, 6-7) are parallelizable with each other.

## Verification Checklist

After all tasks complete:

1. `cd packages/types && npx tsc --noEmit` passes
2. `cd packages/core && npx tsc --noEmit` passes
3. `cd packages/core && npx vitest run tests/roadmap/github-issues.test.ts` passes (all existing + new fetchComments tests)
4. `cd packages/orchestrator && npx tsc --noEmit` passes (pre-existing analyze.ts:51 failure is unrelated)
5. `cd packages/orchestrator && npx vitest run` passes (190/194, same 4 pre-existing failures)
6. `cd packages/intelligence && npx tsc --noEmit` passes
7. `cd packages/cli && npx vitest run tests/commands/publish-analyses.test.ts` passes
8. `Issue.externalId` is `string | null`
9. `archiveAnalysisResults` uses `issue.externalId ?? null`
10. `AnalysisArchive.get()` and `.list()` backfill `externalId ??= null`
11. `fetchComments` returns paginated `TrackerComment[]` from GitHub API
12. `renderAnalysisComment` produces markdown with `<details>` block containing `_harness_analysis: true` and `_version: 1`
