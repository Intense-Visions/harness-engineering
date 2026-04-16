# Plan: Analysis Tracker Sync -- Phase 5 (Test Coverage Gaps)

**Date:** 2026-04-15 | **Spec:** docs/changes/analysis-tracker-sync/proposal.md | **Tasks:** 5 | **Time:** ~20 min

## Goal

Close all test coverage gaps remaining after TDD in Phases 1-4 and verify the complete round-trip integration chain (addComment -> fetchComments -> extractAnalysisFromComments) produces an AnalysisRecord identical to the original.

## Observable Truths (Acceptance Criteria)

1. When a GitHub comment has `user: null`, fetchComments maps author to `'ghost'` (Event-driven)
2. When a comment body uses CRLF line endings in the JSON fence, extractAnalysisFromComments parses it correctly (Event-driven)
3. If the parsed JSON has an `issueId` containing `/` or `\`, extractAnalysisFromComments rejects it and returns null (Unwanted)
4. If the parsed JSON has a missing or empty `issueId`, `identifier`, or `analyzedAt`, extractAnalysisFromComments rejects it and returns null (Unwanted)
5. When a single comment contains multiple JSON fences where only the second has `_harness_analysis: true`, extractAnalysisFromComments finds and returns the analysis record (Event-driven)
6. The full chain -- renderAnalysisComment -> addComment (mock) -> fetchComments (mock) -> extractAnalysisFromComments -- produces a record matching the original on all AnalysisRecord fields (Event-driven)
7. All existing tests (65 across 5 files) continue to pass alongside the new tests
8. TypeScript compiles clean for all affected packages

## File Map

- MODIFY `packages/core/tests/roadmap/github-issues.test.ts` (add null-user fetchComments test)
- MODIFY `packages/cli/tests/commands/sync-analyses.test.ts` (add CRLF, path traversal, missing fields, multi-fence, full round-trip tests)

## Skeleton

_Not produced -- task count (5) below threshold (8)._

## Tasks

### Task 1: fetchComments -- null user maps to 'ghost'

**Depends on:** none | **Files:** `packages/core/tests/roadmap/github-issues.test.ts`

1. Open `packages/core/tests/roadmap/github-issues.test.ts`
2. Inside the `describe('fetchComments', ...)` block, after the existing "returns Err on API failure" test, add:

```typescript
it('maps user to "ghost" when comment has null user', async () => {
  const fetchFn = mockFetch(200, [
    {
      id: 200,
      body: 'Orphaned comment',
      created_at: '2026-01-05T00:00:00Z',
      updated_at: null,
      user: null,
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
  expect(result.value).toHaveLength(1);
  expect(result.value[0]!.author).toBe('ghost');
});
```

3. Run: `cd packages/core && npx vitest run tests/roadmap/github-issues.test.ts`
4. Observe: 33 tests pass (32 existing + 1 new)
5. Commit: `test(core): add fetchComments null-user edge case test`

### Task 2: extractAnalysisFromComments -- CRLF line endings

**Depends on:** none | **Files:** `packages/cli/tests/commands/sync-analyses.test.ts`

1. Open `packages/cli/tests/commands/sync-analyses.test.ts`
2. Inside the `describe('extractAnalysisFromComments', ...)` block, after the existing "strips \_harness_analysis and \_version" test, add:

````typescript
it('handles CRLF line endings in the JSON fence', () => {
  const record = {
    issueId: 'crlf-1',
    identifier: 'crlf-feature',
    spec: null,
    score: null,
    simulation: null,
    analyzedAt: '2026-04-15T12:00:00Z',
    externalId: 'github:owner/repo#50',
  };
  // Build body with \r\n line endings
  const body = [
    '## Harness Analysis: crlf-feature',
    '',
    '<details>',
    '<summary>Full Analysis Data</summary>',
    '',
    '```json',
    JSON.stringify({ _harness_analysis: true, _version: 1, ...record }, null, 2),
    '```',
    '',
    '</details>',
  ].join('\r\n');
  const comments = [makeComment({ body })];
  const result = extractAnalysisFromComments(comments);
  expect(result).not.toBeNull();
  expect(result!.issueId).toBe('crlf-1');
  expect(result!.identifier).toBe('crlf-feature');
});
````

3. Run: `cd packages/cli && npx vitest run tests/commands/sync-analyses.test.ts`
4. Observe: 9 tests pass (8 existing + 1 new)
5. Commit: `test(cli): add CRLF line endings edge case for extractAnalysisFromComments`

### Task 3: extractAnalysisFromComments -- path traversal and missing fields

**Depends on:** none | **Files:** `packages/cli/tests/commands/sync-analyses.test.ts`

1. Open `packages/cli/tests/commands/sync-analyses.test.ts`
2. After the test added in Task 2, add:

```typescript
it('rejects records where issueId contains path traversal characters', () => {
  const body = makeAnalysisBody({
    issueId: '../etc/passwd',
    identifier: 'traversal-feature',
    spec: null,
    score: null,
    simulation: null,
    analyzedAt: '2026-04-15T12:00:00Z',
    externalId: 'github:owner/repo#1',
  });
  const comments = [makeComment({ body })];
  expect(extractAnalysisFromComments(comments)).toBeNull();
});

it('rejects records where issueId contains backslash path traversal', () => {
  const body = makeAnalysisBody({
    issueId: '..\\windows\\system32',
    identifier: 'traversal-feature',
    spec: null,
    score: null,
    simulation: null,
    analyzedAt: '2026-04-15T12:00:00Z',
    externalId: 'github:owner/repo#1',
  });
  const comments = [makeComment({ body })];
  expect(extractAnalysisFromComments(comments)).toBeNull();
});

it('rejects records with empty issueId', () => {
  const body = makeAnalysisBody({
    issueId: '',
    identifier: 'missing-id-feature',
    spec: null,
    score: null,
    simulation: null,
    analyzedAt: '2026-04-15T12:00:00Z',
    externalId: 'github:owner/repo#1',
  });
  const comments = [makeComment({ body })];
  expect(extractAnalysisFromComments(comments)).toBeNull();
});

it('rejects records with missing identifier', () => {
  const body = makeAnalysisBody({
    issueId: 'issue-1',
    identifier: '',
    spec: null,
    score: null,
    simulation: null,
    analyzedAt: '2026-04-15T12:00:00Z',
    externalId: 'github:owner/repo#1',
  });
  const comments = [makeComment({ body })];
  expect(extractAnalysisFromComments(comments)).toBeNull();
});
```

3. Run: `cd packages/cli && npx vitest run tests/commands/sync-analyses.test.ts`
4. Observe: 13 tests pass (9 from Task 2 + 4 new)
5. Commit: `test(cli): add path traversal and missing field validation tests`

### Task 4: extractAnalysisFromComments -- multiple JSON fences in one comment

**Depends on:** none | **Files:** `packages/cli/tests/commands/sync-analyses.test.ts`

1. Open `packages/cli/tests/commands/sync-analyses.test.ts`
2. After the tests added in Task 3, add:

````typescript
it('finds analysis fence among multiple JSON fences in a single comment', () => {
  const body = [
    '## Status Update',
    '',
    '```json',
    JSON.stringify({ status: 'in-progress', estimate: 5 }),
    '```',
    '',
    'And here is the analysis:',
    '',
    '```json',
    JSON.stringify(
      {
        _harness_analysis: true,
        _version: 1,
        issueId: 'multi-fence-1',
        identifier: 'multi-fence-feature',
        spec: null,
        score: null,
        simulation: null,
        analyzedAt: '2026-04-15T12:00:00Z',
        externalId: 'github:owner/repo#77',
      },
      null,
      2
    ),
    '```',
  ].join('\n');
  const comments = [makeComment({ body })];
  const result = extractAnalysisFromComments(comments);
  expect(result).not.toBeNull();
  expect(result!.issueId).toBe('multi-fence-1');
  expect(result!.identifier).toBe('multi-fence-feature');
});
````

3. Run: `cd packages/cli && npx vitest run tests/commands/sync-analyses.test.ts`
4. Observe: 14 tests pass (13 from Task 3 + 1 new)
5. Commit: `test(cli): add multi-fence extraction test for extractAnalysisFromComments`

### Task 5: Full round-trip integration test (addComment -> fetchComments -> extract)

**Depends on:** none | **Files:** `packages/cli/tests/commands/sync-analyses.test.ts`

This is the key spec Wave 5 requirement: "publish -> fetchComments -> parse -> compare to original record". The existing round-trip test only covers renderAnalysisComment -> extractAnalysisFromComments directly. This test simulates the full adapter chain by mocking addComment to capture the body, then feeding it through a mock fetchComments response.

1. Open `packages/cli/tests/commands/sync-analyses.test.ts`
2. Add the following imports at the top (if not already present, verify `vi` is imported):

Change the import line from:

```typescript
import { describe, it, expect } from 'vitest';
```

to:

```typescript
import { describe, it, expect, vi } from 'vitest';
```

3. After the existing `describe('round-trip: renderAnalysisComment -> extractAnalysisFromComments', ...)` block, add a new describe block:

```typescript
describe('full round-trip: render -> addComment -> fetchComments -> extract', () => {
  it('publishes via addComment mock, fetches back, and extracts a matching record', async () => {
    const { GitHubIssuesSyncAdapter } = await import('@harness-engineering/core');

    const original: AnalysisRecord = {
      issueId: 'full-rt-1',
      identifier: 'full-roundtrip-feature',
      spec: null,
      score: {
        overall: 0.72,
        confidence: 0.88,
        riskLevel: 'medium',
        blastRadius: { filesEstimated: 4, modules: 2, services: 1 },
        dimensions: { structural: 0.6, semantic: 0.75, historical: 0.55 },
        reasoning: ['Modifies shared interface', 'Limited test coverage in target module'],
        recommendedRoute: 'human',
      },
      simulation: null,
      analyzedAt: '2026-04-15T16:00:00Z',
      externalId: 'github:owner/repo#88',
    };

    // Step 1: Render the comment as the publish flow would
    const commentBody = renderAnalysisComment(original);

    // Step 2: Simulate addComment capturing the body, then fetchComments returning it
    // We create one adapter for addComment (POST mock) and one for fetchComments (GET mock)
    let capturedBody = '';
    const addCommentFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers(),
      text: async () => '{}',
      json: async () => ({}),
    });

    const publishAdapter = new GitHubIssuesSyncAdapter({
      token: 'tok',
      config: {
        kind: 'github' as const,
        repo: 'owner/repo',
        labels: ['harness'],
        statusMap: {
          backlog: 'open',
          planned: 'open',
          'in-progress': 'open',
          done: 'closed',
          blocked: 'open',
        },
      },
      fetchFn: addCommentFetch,
    });

    const addResult = await publishAdapter.addComment(original.externalId!, commentBody);
    expect(addResult.ok).toBe(true);

    // Extract what was POSTed
    const postCall = addCommentFetch.mock.calls[0]!;
    capturedBody = JSON.parse(postCall[1].body as string).body;
    expect(capturedBody).toBe(commentBody);

    // Step 3: Simulate fetchComments returning the published comment
    const fetchCommentsFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () =>
        JSON.stringify([
          {
            id: 500,
            body: capturedBody,
            created_at: '2026-04-15T16:01:00Z',
            updated_at: null,
            user: { login: 'harness-bot' },
          },
        ]),
      json: async () => [
        {
          id: 500,
          body: capturedBody,
          created_at: '2026-04-15T16:01:00Z',
          updated_at: null,
          user: { login: 'harness-bot' },
        },
      ],
    });

    const pullAdapter = new GitHubIssuesSyncAdapter({
      token: 'tok',
      config: {
        kind: 'github' as const,
        repo: 'owner/repo',
        labels: ['harness'],
        statusMap: {
          backlog: 'open',
          planned: 'open',
          'in-progress': 'open',
          done: 'closed',
          blocked: 'open',
        },
      },
      fetchFn: fetchCommentsFetch,
    });

    const fetchResult = await pullAdapter.fetchComments(original.externalId!);
    expect(fetchResult.ok).toBe(true);
    if (!fetchResult.ok) return;

    // Step 4: Extract the analysis from the fetched comments
    const extracted = extractAnalysisFromComments(fetchResult.value);
    expect(extracted).not.toBeNull();

    // Step 5: Compare every AnalysisRecord field
    expect(extracted!.issueId).toBe(original.issueId);
    expect(extracted!.identifier).toBe(original.identifier);
    expect(extracted!.spec).toBe(original.spec);
    expect(extracted!.analyzedAt).toBe(original.analyzedAt);
    expect(extracted!.externalId).toBe(original.externalId);
    expect(extracted!.simulation).toBe(original.simulation);

    // Deep-compare score
    expect(extracted!.score).not.toBeNull();
    expect(extracted!.score!.overall).toBe(original.score!.overall);
    expect(extracted!.score!.confidence).toBe(original.score!.confidence);
    expect(extracted!.score!.riskLevel).toBe(original.score!.riskLevel);
    expect(extracted!.score!.recommendedRoute).toBe(original.score!.recommendedRoute);
    expect(extracted!.score!.reasoning).toEqual(original.score!.reasoning);
    expect(extracted!.score!.blastRadius).toEqual(original.score!.blastRadius);
    expect(extracted!.score!.dimensions).toEqual(original.score!.dimensions);

    // Ensure discriminator fields are stripped
    expect((extracted as any)._harness_analysis).toBeUndefined();
    expect((extracted as any)._version).toBeUndefined();
  });
});
```

3. Run: `cd packages/cli && npx vitest run tests/commands/sync-analyses.test.ts`
4. Observe: 15 tests pass (14 from Tasks 2-4 + 1 new)
5. Run: `cd packages/core && npx vitest run tests/roadmap/github-issues.test.ts` (verify Task 1 still passes)
6. Run: `cd packages/orchestrator && npx vitest run tests/core/analysis-comment.test.ts tests/core/published-index.test.ts tests/core/auto-publish.test.ts` (verify orchestrator still passes)
7. Commit: `test(cli): add full round-trip integration test (addComment -> fetchComments -> extract)`

[checkpoint:human-verify] -- Run all test suites together and confirm 73 total tests pass (65 existing + 8 new).
