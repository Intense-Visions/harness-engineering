# Plan: Phase 3 Gap-Filling Tests for Task Independence Detection

**Date:** 2026-03-23
**Spec:** docs/changes/task-independence-detection/proposal.md
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Fill 4 specific test gaps identified during code review so that the task-independence-detection feature has complete coverage of multi-group scenarios, depth > 1 expansion, `via` traceability content, and full JSON output shape validation.

## Observable Truths (Acceptance Criteria)

1. When `TaskIndependenceAnalyzer.analyze()` is called with a graph containing `a.ts -> b.ts -> c.ts` and depth 2, task A (`a.ts`) expands to include `c.ts` — verifying multi-hop transitive detection.
2. When a transitive overlap is detected, the `via` field contains the exact original file path that led to the expanded file (e.g., `via: 'src/a.ts'`).
3. When `handleCheckTaskIndependence` is called with 4 tasks where tasks 1-2 share a file and tasks 3-4 are independent, the response contains 2+ groups with correct pairwise results for all 6 pairs.
4. When `handleCheckTaskIndependence` returns detailed mode output, the JSON conforms to the full `IndependenceResult` shape: `tasks` (string[]), `analysisLevel` (string), `depth` (number), `pairs` (array of `{taskA, taskB, independent, overlaps}`), `groups` (string[][]), `verdict` (string).
5. `npx vitest run packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts` passes with all existing + new tests.
6. `npx vitest run packages/cli/tests/mcp/tools/task-independence.test.ts` passes with all existing + new tests.

## File Map

- MODIFY `packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts` (add 2 tests: depth > 1 expansion, via traceability content)
- MODIFY `packages/cli/tests/mcp/tools/task-independence.test.ts` (add 2 tests: multi-group 4-task scenario, full JSON shape validation)

## Tasks

### Task 1: Add depth > 1 expansion test to analyzer unit tests

**Depends on:** none
**Files:** `packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts`

1. Open `packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts`.
2. Inside the `describe('graph-expanded analysis')` block (after the existing `buildGraphWithImports` helper and its tests, around line 209), add a new helper and test:

```typescript
it('detects transitive overlap at depth 2 across two hops', () => {
  // Build chain: a.ts -> mid.ts -> deep.ts <- b.ts -> mid2.ts -> deep.ts
  // At depth 1, a.ts expands to {mid.ts} and b.ts expands to {mid2.ts, deep.ts} — no overlap
  // At depth 2, a.ts expands to {mid.ts, deep.ts} — overlaps with b.ts's expansion {mid2.ts, deep.ts}
  const store = new GraphStore();
  store.addNode({
    id: 'file:src/a.ts',
    type: 'file',
    name: 'a.ts',
    path: 'src/a.ts',
    metadata: {},
  });
  store.addNode({
    id: 'file:src/mid.ts',
    type: 'file',
    name: 'mid.ts',
    path: 'src/mid.ts',
    metadata: {},
  });
  store.addNode({
    id: 'file:src/deep.ts',
    type: 'file',
    name: 'deep.ts',
    path: 'src/deep.ts',
    metadata: {},
  });
  store.addNode({
    id: 'file:src/b.ts',
    type: 'file',
    name: 'b.ts',
    path: 'src/b.ts',
    metadata: {},
  });
  store.addNode({
    id: 'file:src/mid2.ts',
    type: 'file',
    name: 'mid2.ts',
    path: 'src/mid2.ts',
    metadata: {},
  });

  store.addEdge({ from: 'file:src/a.ts', to: 'file:src/mid.ts', type: 'imports' });
  store.addEdge({ from: 'file:src/mid.ts', to: 'file:src/deep.ts', type: 'imports' });
  store.addEdge({ from: 'file:src/b.ts', to: 'file:src/mid2.ts', type: 'imports' });
  store.addEdge({ from: 'file:src/mid2.ts', to: 'file:src/deep.ts', type: 'imports' });

  const analyzer = new TaskIndependenceAnalyzer(store);

  // At depth 1: no overlap (a expands to mid, b expands to mid2 — no intersection)
  const resultDepth1 = analyzer.analyze({
    tasks: [
      { id: 'a', files: ['src/a.ts'] },
      { id: 'b', files: ['src/b.ts'] },
    ],
    depth: 1,
  });
  expect(resultDepth1.pairs[0]!.independent).toBe(true);

  // At depth 2: overlap on deep.ts (a expands through mid to deep, b expands through mid2 to deep)
  const resultDepth2 = analyzer.analyze({
    tasks: [
      { id: 'a', files: ['src/a.ts'] },
      { id: 'b', files: ['src/b.ts'] },
    ],
    depth: 2,
  });
  expect(resultDepth2.depth).toBe(2);
  expect(resultDepth2.pairs[0]!.independent).toBe(false);

  const deepOverlap = resultDepth2.pairs[0]!.overlaps.find((o) => o.file === 'src/deep.ts');
  expect(deepOverlap).toBeDefined();
  expect(deepOverlap!.type).toBe('transitive');
});
```

3. Run test: `npx vitest run packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts`
4. Observe: all tests pass (18 total — 17 existing + 1 new).
5. Run: `npx harness validate`
6. Commit: `test(graph): add depth > 1 expansion test for TaskIndependenceAnalyzer`

### Task 2: Add via traceability content assertion to analyzer unit tests

**Depends on:** none (can run in parallel with Task 1)
**Files:** `packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts`

1. Open `packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts`.
2. Inside the `describe('graph-expanded analysis')` block, add this test (after the test added in Task 1):

```typescript
it('populates via field with the original source file path for transitive overlaps', () => {
  const store = buildGraphWithImports();
  // Graph: a.ts --imports--> shared.ts <--imports-- b.ts
  // Task a has [src/a.ts], task b has [src/b.ts]
  // At depth 1, both expand to include shared.ts
  // The via field for the transitive overlap on shared.ts should reference the original file
  const analyzer = new TaskIndependenceAnalyzer(store);
  const result = analyzer.analyze({
    tasks: [
      { id: 'a', files: ['src/a.ts'] },
      { id: 'b', files: ['src/b.ts'] },
    ],
    depth: 1,
  });

  expect(result.pairs[0]!.independent).toBe(false);
  const transitiveOverlap = result.pairs[0]!.overlaps.find(
    (o) => o.type === 'transitive' && o.file === 'src/shared.ts'
  );
  expect(transitiveOverlap).toBeDefined();
  // via should be either 'src/a.ts' or 'src/b.ts' — the original file that led to the expansion
  expect(['src/a.ts', 'src/b.ts']).toContain(transitiveOverlap!.via);
});
```

3. Run test: `npx vitest run packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts`
4. Observe: all tests pass (19 total — 17 existing + 2 new).
5. Run: `npx harness validate`
6. Commit: `test(graph): verify via traceability field content in transitive overlaps`

### Task 3: Add multi-group 4-task scenario test to MCP tool handler

**Depends on:** none (can run in parallel with Tasks 1-2)
**Files:** `packages/cli/tests/mcp/tools/task-independence.test.ts`

1. Open `packages/cli/tests/mcp/tools/task-independence.test.ts`.
2. Inside the `describe('handleCheckTaskIndependence')` block, add this test (before the validation error tests, around line 217):

```typescript
it('handles 4 tasks with mixed independence producing multiple groups', async () => {
  await createTestGraph(tmpDir);
  // Graph: a.ts -> b.ts -> c.ts, d.ts (isolated)
  // task1 has a.ts, task2 has b.ts — conflict via transitive at depth 1 (a imports b)
  // task3 has c.ts — conflict with task2 at depth 1 (b imports c)
  // task4 has d.ts — independent of all others
  // Expected: tasks 1,2,3 grouped together (transitively connected), task4 alone
  const result = await handleCheckTaskIndependence({
    path: tmpDir,
    tasks: [
      { id: 'task1', files: ['a.ts'] },
      { id: 'task2', files: ['b.ts'] },
      { id: 'task3', files: ['c.ts'] },
      { id: 'task4', files: ['d.ts'] },
    ],
  });

  expect(result.isError).toBeUndefined();
  const data = parseResult(result);

  // 4 tasks produce 6 pairs (4 choose 2)
  expect(data.pairs).toHaveLength(6);

  // task4 should be independent of all others
  const task4Pairs = data.pairs.filter(
    (p: { taskA: string; taskB: string }) => p.taskA === 'task4' || p.taskB === 'task4'
  );
  expect(task4Pairs.every((p: { independent: boolean }) => p.independent)).toBe(true);

  // task1 and task2 should conflict (a.ts imports b.ts)
  const pair12 = data.pairs.find(
    (p: { taskA: string; taskB: string }) => p.taskA === 'task1' && p.taskB === 'task2'
  );
  expect(pair12.independent).toBe(false);

  // Should produce 2 groups: {task1, task2, task3} and {task4}
  expect(data.groups).toHaveLength(2);
  const groupWith1 = data.groups.find((g: string[]) => g.includes('task1'));
  expect(groupWith1).toContain('task2');
  expect(groupWith1).toContain('task3');
  const groupWith4 = data.groups.find((g: string[]) => g.includes('task4'));
  expect(groupWith4).toEqual(['task4']);

  // Verdict should mention 2 groups
  expect(data.verdict).toContain('2 independent groups');
});
```

3. Run test: `npx vitest run packages/cli/tests/mcp/tools/task-independence.test.ts`
4. Observe: all tests pass (17 total — 16 existing + 1 new).
5. Run: `npx harness validate`
6. Commit: `test(cli): add multi-group 4-task scenario for MCP tool handler`

### Task 4: Add full JSON output shape validation integration test

**Depends on:** none (can run in parallel with Tasks 1-3)
**Files:** `packages/cli/tests/mcp/tools/task-independence.test.ts`

1. Open `packages/cli/tests/mcp/tools/task-independence.test.ts`.
2. Inside the `describe('handleCheckTaskIndependence')` block, add this test after the test from Task 3:

```typescript
it('returns complete IndependenceResult JSON shape in detailed mode', async () => {
  await createTestGraph(tmpDir);
  // Use tasks that produce both direct and transitive overlaps for maximum shape coverage
  // task1 has a.ts, task2 has a.ts (direct) and b.ts (which a.ts imports — transitive from task1)
  const result = await handleCheckTaskIndependence({
    path: tmpDir,
    tasks: [
      { id: 'task1', files: ['a.ts'] },
      { id: 'task2', files: ['a.ts', 'b.ts'] },
    ],
  });

  expect(result.isError).toBeUndefined();
  expect(result.content).toHaveLength(1);
  expect(result.content[0].type).toBe('text');

  const data = parseResult(result);

  // Top-level fields
  expect(data).toHaveProperty('tasks');
  expect(data).toHaveProperty('analysisLevel');
  expect(data).toHaveProperty('depth');
  expect(data).toHaveProperty('pairs');
  expect(data).toHaveProperty('groups');
  expect(data).toHaveProperty('verdict');

  // Type checks on top-level fields
  expect(Array.isArray(data.tasks)).toBe(true);
  expect(data.tasks).toEqual(['task1', 'task2']);
  expect(typeof data.analysisLevel).toBe('string');
  expect(['graph-expanded', 'file-only']).toContain(data.analysisLevel);
  expect(typeof data.depth).toBe('number');
  expect(typeof data.verdict).toBe('string');

  // Pairs shape
  expect(Array.isArray(data.pairs)).toBe(true);
  expect(data.pairs).toHaveLength(1);
  const pair = data.pairs[0];
  expect(pair).toHaveProperty('taskA');
  expect(pair).toHaveProperty('taskB');
  expect(pair).toHaveProperty('independent');
  expect(pair).toHaveProperty('overlaps');
  expect(typeof pair.taskA).toBe('string');
  expect(typeof pair.taskB).toBe('string');
  expect(typeof pair.independent).toBe('boolean');
  expect(Array.isArray(pair.overlaps)).toBe(true);

  // Overlaps shape — should have at least one direct overlap on a.ts
  expect(pair.overlaps.length).toBeGreaterThan(0);
  const directOverlap = pair.overlaps.find(
    (o: { file: string; type: string }) => o.type === 'direct' && o.file === 'a.ts'
  );
  expect(directOverlap).toBeDefined();
  expect(directOverlap).toHaveProperty('file');
  expect(directOverlap).toHaveProperty('type');
  // Direct overlaps should NOT have a via field
  expect(directOverlap.via).toBeUndefined();

  // Groups shape
  expect(Array.isArray(data.groups)).toBe(true);
  for (const group of data.groups) {
    expect(Array.isArray(group)).toBe(true);
    for (const member of group) {
      expect(typeof member).toBe('string');
    }
  }
});
```

3. Run test: `npx vitest run packages/cli/tests/mcp/tools/task-independence.test.ts`
4. Observe: all tests pass (18 total — 16 existing + 2 new).
5. Run: `npx harness validate`
6. Commit: `test(cli): add full JSON output shape validation for MCP tool`

## Traceability

| Observable Truth                                         | Delivered By |
| -------------------------------------------------------- | ------------ |
| 1. Depth > 1 multi-hop transitive detection              | Task 1       |
| 2. `via` field contains correct source file path         | Task 2       |
| 3. 4-task mixed-independence multi-group response        | Task 3       |
| 4. Full JSON output shape conforms to IndependenceResult | Task 4       |
| 5. Analyzer unit tests pass                              | Tasks 1, 2   |
| 6. MCP tool tests pass                                   | Tasks 3, 4   |
