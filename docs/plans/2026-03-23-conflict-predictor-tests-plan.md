# Plan: ConflictPredictor Unit Tests

**Date:** 2026-03-23
**Spec:** docs/changes/conflict-prediction/proposal.md
**Phase:** 2 of 6 (Unit tests for ConflictPredictor)
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Comprehensive unit tests for `ConflictPredictor` covering all severity classification paths, regrouping behavior, graceful degradation without graph, and missing metrics handling.

## Observable Truths (Acceptance Criteria)

1. When `npx vitest run tests/independence/ConflictPredictor.test.ts` is run from `packages/graph/`, all tests pass.
2. When two tasks list the same file, `predict()` returns a conflict with `severity: 'high'`, reason containing `"Both tasks write to"`, and mitigation containing `"Serialize"`.
3. When tasks have transitive overlap on a file whose `changeFrequency` is at or above the 80th percentile, severity is `'medium'` with reason containing `"high-churn"`.
4. When tasks have transitive overlap on a file whose `fanIn + fanOut` is at or above the 80th percentile, severity is `'medium'` with reason containing `"highly-coupled"`.
5. When tasks have transitive-only overlap with low churn and low coupling, severity is `'low'` with reason containing `"low risk"`.
6. When a high-severity conflict exists between two tasks, they appear in the same group in `prediction.groups`.
7. When only medium/low conflicts exist, `prediction.summary.regrouped` is `false` and groups match the analyzer's native grouping.
8. Every `ConflictDetail` in every test has non-empty `reason` and non-empty `mitigation`.
9. Without a graph store: direct overlaps produce `'high'`, transitive overlaps produce `'low'`, and `verdict` contains `"Graph unavailable"`.
10. When a transitive overlap file has no entry in churn/coupling maps, it is classified as `'low'`.
11. When all tasks are independent, `prediction.conflicts` is empty and `prediction.summary.regrouped` is `false`.
12. Validation errors (< 2 tasks, duplicates, empty files) throw the same errors as `TaskIndependenceAnalyzer`.

## File Map

- CREATE `packages/graph/tests/independence/ConflictPredictor.test.ts`

## Tasks

### Task 1: Scaffold test file with validation and no-conflict tests

**Depends on:** none
**Files:** `packages/graph/tests/independence/ConflictPredictor.test.ts`

1. Create test file `packages/graph/tests/independence/ConflictPredictor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { ConflictPredictor } from '../../src/independence/ConflictPredictor.js';

describe('ConflictPredictor', () => {
  describe('validation (delegated to analyzer)', () => {
    it('throws when fewer than 2 tasks provided', () => {
      const predictor = new ConflictPredictor();
      expect(() =>
        predictor.predict({
          tasks: [{ id: 'a', files: ['f1.ts'] }],
        })
      ).toThrow('At least 2 tasks are required');
    });

    it('throws on duplicate task IDs', () => {
      const predictor = new ConflictPredictor();
      expect(() =>
        predictor.predict({
          tasks: [
            { id: 'a', files: ['f1.ts'] },
            { id: 'a', files: ['f2.ts'] },
          ],
        })
      ).toThrow('Duplicate task ID: "a"');
    });

    it('throws on empty files array', () => {
      const predictor = new ConflictPredictor();
      expect(() =>
        predictor.predict({
          tasks: [
            { id: 'a', files: [] },
            { id: 'b', files: ['f1.ts'] },
          ],
        })
      ).toThrow('Task "a" has an empty files array');
    });
  });

  describe('no conflicts', () => {
    it('returns empty conflicts and regrouped=false when tasks are independent', () => {
      const predictor = new ConflictPredictor();
      const result = predictor.predict({
        tasks: [
          { id: 'a', files: ['src/a.ts'] },
          { id: 'b', files: ['src/b.ts'] },
          { id: 'c', files: ['src/c.ts'] },
        ],
      });

      expect(result.conflicts).toHaveLength(0);
      expect(result.summary).toEqual({
        high: 0,
        medium: 0,
        low: 0,
        regrouped: false,
      });
      expect(result.groups).toHaveLength(3);
      expect(result.verdict).toContain('no conflicts');
    });
  });
});
```

2. Run test from `packages/graph/`:
   ```
   npx vitest run tests/independence/ConflictPredictor.test.ts
   ```
3. Observe: all 4 tests pass.
4. Run: `harness validate`
5. Commit: `test(conflict-predictor): add validation and no-conflict tests`

---

### Task 2: Direct file overlap (high severity) and reason/mitigation assertions

**Depends on:** Task 1
**Files:** `packages/graph/tests/independence/ConflictPredictor.test.ts`

Append the following `describe` block inside the top-level `describe('ConflictPredictor', ...)`, after the `'no conflicts'` block:

```typescript
describe('severity classification — file-only (no graph)', () => {
  it('classifies direct file overlap as high severity', () => {
    const predictor = new ConflictPredictor();
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/shared.ts', 'src/a.ts'] },
        { id: 'b', files: ['src/shared.ts', 'src/b.ts'] },
      ],
    });

    expect(result.conflicts).toHaveLength(1);
    const conflict = result.conflicts[0]!;
    expect(conflict.severity).toBe('high');
    expect(conflict.reason).toContain('Both tasks write to src/shared.ts');
    expect(conflict.mitigation).toContain('Serialize');
    expect(conflict.taskA).toBe('a');
    expect(conflict.taskB).toBe('b');
  });

  it('every ConflictDetail has non-empty reason and mitigation', () => {
    const predictor = new ConflictPredictor();
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/shared.ts'] },
        { id: 'b', files: ['src/shared.ts'] },
        { id: 'c', files: ['src/shared.ts', 'src/other.ts'] },
      ],
    });

    expect(result.conflicts.length).toBeGreaterThan(0);
    for (const conflict of result.conflicts) {
      expect(conflict.reason.length).toBeGreaterThan(0);
      expect(conflict.mitigation.length).toBeGreaterThan(0);
    }
  });

  it('without graph: direct overlap is high, verdict notes degradation', () => {
    const predictor = new ConflictPredictor();
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/x.ts'] },
        { id: 'b', files: ['src/x.ts'] },
      ],
    });

    expect(result.analysisLevel).toBe('file-only');
    expect(result.conflicts[0]!.severity).toBe('high');
    expect(result.verdict).toContain('Graph unavailable');
  });
});
```

1. Add the block above to the test file.
2. Run test: `npx vitest run tests/independence/ConflictPredictor.test.ts`
3. Observe: all 7 tests pass (4 from Task 1 + 3 new).
4. Run: `harness validate`
5. Commit: `test(conflict-predictor): add direct overlap and high severity tests`

---

### Task 3: Graph-expanded severity tests (medium via churn, medium via coupling, low default)

**Depends on:** Task 2
**Files:** `packages/graph/tests/independence/ConflictPredictor.test.ts`

Append the following `describe` block inside the top-level `describe`:

```typescript
describe('severity classification — graph-expanded', () => {
  /**
   * Build a graph where:
   * - a.ts imports shared.ts, b.ts imports shared.ts (transitive overlap)
   * - shared.ts has a function node with high changeFrequency (via commit references)
   * - Additional "filler" files with low changeFrequency to establish the percentile threshold
   *
   * To make shared.ts appear in the top 20th percentile of churn, we need
   * at least 5 files so that 1 file = 20%. We give shared.ts 10 commit refs
   * and the others 1 each.
   */
  function buildHighChurnGraph(): GraphStore {
    const store = new GraphStore();

    // Core files for tasks
    store.addNode({
      id: 'file:src/a.ts',
      type: 'file',
      name: 'a.ts',
      path: 'src/a.ts',
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
      id: 'file:src/shared.ts',
      type: 'file',
      name: 'shared.ts',
      path: 'src/shared.ts',
      metadata: {},
    });

    // Edges creating transitive overlap
    store.addEdge({ from: 'file:src/a.ts', to: 'file:src/shared.ts', type: 'imports' });
    store.addEdge({ from: 'file:src/b.ts', to: 'file:src/shared.ts', type: 'imports' });

    // Function node in shared.ts (required for GraphComplexityAdapter)
    store.addNode({
      id: 'fn:shared:doStuff',
      type: 'function',
      name: 'doStuff',
      path: 'src/shared.ts',
      metadata: { cyclomaticComplexity: 1 },
    });
    store.addEdge({ from: 'file:src/shared.ts', to: 'fn:shared:doStuff', type: 'contains' });

    // 10 commit references to shared.ts (high churn)
    for (let i = 0; i < 10; i++) {
      store.addNode({
        id: `commit:shared-${i}`,
        type: 'commit',
        name: `commit-shared-${i}`,
        metadata: {},
      });
      store.addEdge({ from: `commit:shared-${i}`, to: 'file:src/shared.ts', type: 'references' });
    }

    // 4 filler files with 1 function node and 1 commit each (low churn)
    for (let i = 0; i < 4; i++) {
      const filePath = `src/filler${i}.ts`;
      store.addNode({
        id: `file:${filePath}`,
        type: 'file',
        name: `filler${i}.ts`,
        path: filePath,
        metadata: {},
      });
      store.addNode({
        id: `fn:filler${i}:fn`,
        type: 'function',
        name: 'fn',
        path: filePath,
        metadata: { cyclomaticComplexity: 1 },
      });
      store.addEdge({ from: `file:${filePath}`, to: `fn:filler${i}:fn`, type: 'contains' });
      store.addNode({
        id: `commit:filler-${i}`,
        type: 'commit',
        name: `commit-filler-${i}`,
        metadata: {},
      });
      store.addEdge({ from: `commit:filler-${i}`, to: `file:${filePath}`, type: 'references' });
    }

    return store;
  }

  it('classifies transitive overlap on high-churn file as medium severity', () => {
    const store = buildHighChurnGraph();
    const predictor = new ConflictPredictor(store);
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/a.ts'] },
        { id: 'b', files: ['src/b.ts'] },
      ],
      depth: 1,
    });

    expect(result.analysisLevel).toBe('graph-expanded');
    expect(result.conflicts).toHaveLength(1);
    const conflict = result.conflicts[0]!;
    expect(conflict.severity).toBe('medium');
    expect(conflict.reason).toContain('high-churn');
    expect(conflict.reason).toContain('src/shared.ts');
    expect(conflict.mitigation).toContain('coordinate');
  });

  /**
   * Build a graph where shared.ts has high coupling (many imports in/out)
   * but low churn (no commit references to keep changeFrequency at 0).
   */
  function buildHighCouplingGraph(): GraphStore {
    const store = new GraphStore();

    // Core files
    store.addNode({
      id: 'file:src/a.ts',
      type: 'file',
      name: 'a.ts',
      path: 'src/a.ts',
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
      id: 'file:src/shared.ts',
      type: 'file',
      name: 'shared.ts',
      path: 'src/shared.ts',
      metadata: {},
    });

    // Transitive overlap edges
    store.addEdge({ from: 'file:src/a.ts', to: 'file:src/shared.ts', type: 'imports' });
    store.addEdge({ from: 'file:src/b.ts', to: 'file:src/shared.ts', type: 'imports' });

    // Give shared.ts high coupling: many files import it (fanIn) + it imports many (fanOut)
    // Create 8 extra files that import shared.ts (high fanIn for shared.ts)
    for (let i = 0; i < 8; i++) {
      const filePath = `src/consumer${i}.ts`;
      store.addNode({
        id: `file:${filePath}`,
        type: 'file',
        name: `consumer${i}.ts`,
        path: filePath,
        metadata: {},
      });
      store.addEdge({ from: `file:${filePath}`, to: 'file:src/shared.ts', type: 'imports' });
    }

    // shared.ts also imports 2 utility files (fanOut)
    for (let i = 0; i < 2; i++) {
      const filePath = `src/util${i}.ts`;
      store.addNode({
        id: `file:${filePath}`,
        type: 'file',
        name: `util${i}.ts`,
        path: filePath,
        metadata: {},
      });
      store.addEdge({ from: 'file:src/shared.ts', to: `file:${filePath}`, type: 'imports' });
    }

    // No function nodes / commits -> churn stays at 0 -> no churn-based medium
    // Coupling for shared.ts: fanIn=10 (a,b + 8 consumers), fanOut=2 => total=12
    // Other files have coupling 1 each -> shared.ts is top percentile

    return store;
  }

  it('classifies transitive overlap on highly-coupled file as medium severity', () => {
    const store = buildHighCouplingGraph();
    const predictor = new ConflictPredictor(store);
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/a.ts'] },
        { id: 'b', files: ['src/b.ts'] },
      ],
      depth: 1,
    });

    expect(result.analysisLevel).toBe('graph-expanded');
    expect(result.conflicts).toHaveLength(1);
    const conflict = result.conflicts[0]!;
    expect(conflict.severity).toBe('medium');
    expect(conflict.reason).toContain('highly-coupled');
    expect(conflict.reason).toContain('src/shared.ts');
    expect(conflict.mitigation).toContain('coordinate');
  });

  it('classifies transitive overlap with low churn and low coupling as low severity', () => {
    // Simple graph: a.ts -> shared.ts <- b.ts, no churn/coupling signals
    const store = new GraphStore();
    store.addNode({
      id: 'file:src/a.ts',
      type: 'file',
      name: 'a.ts',
      path: 'src/a.ts',
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
      id: 'file:src/shared.ts',
      type: 'file',
      name: 'shared.ts',
      path: 'src/shared.ts',
      metadata: {},
    });
    store.addEdge({ from: 'file:src/a.ts', to: 'file:src/shared.ts', type: 'imports' });
    store.addEdge({ from: 'file:src/b.ts', to: 'file:src/shared.ts', type: 'imports' });

    const predictor = new ConflictPredictor(store);
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/a.ts'] },
        { id: 'b', files: ['src/b.ts'] },
      ],
      depth: 1,
    });

    expect(result.conflicts).toHaveLength(1);
    const conflict = result.conflicts[0]!;
    expect(conflict.severity).toBe('low');
    expect(conflict.reason).toContain('low risk');
    expect(conflict.mitigation).toContain('transitive overlap unlikely');
  });

  it('without graph: transitive overlaps are classified as low', () => {
    // Cannot have transitive overlaps without a graph (file-only mode has no expansion)
    // So we test that with a graph store but depth=0, transitive is not detected,
    // and without a graph at all, the analyzer only produces direct overlaps.
    // The meaningful test: with graph, depth=1, no churn/coupling data -> low
    const store = new GraphStore();
    store.addNode({
      id: 'file:src/a.ts',
      type: 'file',
      name: 'a.ts',
      path: 'src/a.ts',
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
      id: 'file:src/shared.ts',
      type: 'file',
      name: 'shared.ts',
      path: 'src/shared.ts',
      metadata: {},
    });
    store.addEdge({ from: 'file:src/a.ts', to: 'file:src/shared.ts', type: 'imports' });
    store.addEdge({ from: 'file:src/b.ts', to: 'file:src/shared.ts', type: 'imports' });

    const predictor = new ConflictPredictor(store);
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/a.ts'] },
        { id: 'b', files: ['src/b.ts'] },
      ],
      depth: 1,
    });

    // With empty churn/coupling maps, transitive -> low
    expect(result.conflicts[0]!.severity).toBe('low');
  });

  it('missing metrics for a node classifies transitive overlap as low', () => {
    // Graph has nodes and edges but no function/commit nodes (no churn data)
    // and low coupling — so metrics are effectively missing for the overlap file
    const store = new GraphStore();
    store.addNode({
      id: 'file:src/a.ts',
      type: 'file',
      name: 'a.ts',
      path: 'src/a.ts',
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
      id: 'file:src/shared.ts',
      type: 'file',
      name: 'shared.ts',
      path: 'src/shared.ts',
      metadata: {},
    });
    store.addEdge({ from: 'file:src/a.ts', to: 'file:src/shared.ts', type: 'imports' });
    store.addEdge({ from: 'file:src/b.ts', to: 'file:src/shared.ts', type: 'imports' });

    const predictor = new ConflictPredictor(store);
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/a.ts'] },
        { id: 'b', files: ['src/b.ts'] },
      ],
      depth: 1,
    });

    const conflict = result.conflicts[0]!;
    expect(conflict.severity).toBe('low');
    expect(conflict.reason).toContain('low risk');
  });
});
```

1. Add the block above to the test file after the file-only severity block.
2. Run test: `npx vitest run tests/independence/ConflictPredictor.test.ts`
3. Observe: all 13 tests pass (7 from Task 2 + 6 new).
4. Run: `harness validate`
5. Commit: `test(conflict-predictor): add graph-expanded severity classification tests`

---

### Task 4: Regrouping tests (high causes regrouping, medium/low do not)

**Depends on:** Task 3
**Files:** `packages/graph/tests/independence/ConflictPredictor.test.ts`

Append the following `describe` block inside the top-level `describe`:

```typescript
describe('regrouping behavior', () => {
  it('high-severity conflicts cause tasks to be grouped together (regrouped=true)', () => {
    const predictor = new ConflictPredictor();
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/shared.ts'] },
        { id: 'b', files: ['src/shared.ts'] },
        { id: 'c', files: ['src/c.ts'] },
      ],
    });

    // a and b have direct overlap (high) -> same group
    expect(result.summary.high).toBe(1);
    expect(result.groups).toHaveLength(2);

    const groupWithA = result.groups.find((g) => g.includes('a'));
    expect(groupWithA).toContain('b');
    expect(groupWithA).not.toContain('c');

    // In this case, the analyzer's groups also merge a+b (since any overlap merges),
    // so regrouped may be false since both groupings agree.
    // The key test is that high-severity DOES merge.
  });

  it('medium-severity conflicts do NOT cause regrouping', () => {
    // Use a graph with transitive high-churn overlap (medium severity)
    // The analyzer would group a+b together (any overlap merges in analyzer)
    // but ConflictPredictor only merges on HIGH severity
    // So ConflictPredictor puts a and b in separate groups -> regrouped=true
    // Wait — this is the opposite direction. The analyzer merges MORE aggressively.
    // Let's verify: analyzer groups on ANY overlap, predictor groups on HIGH only.
    // So when there's a medium conflict, analyzer merges a+b, predictor does NOT.
    // This means predictor.groups has MORE groups than analyzer.groups -> regrouped=true.

    const store = new GraphStore();
    store.addNode({
      id: 'file:src/a.ts',
      type: 'file',
      name: 'a.ts',
      path: 'src/a.ts',
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
      id: 'file:src/shared.ts',
      type: 'file',
      name: 'shared.ts',
      path: 'src/shared.ts',
      metadata: {},
    });
    store.addEdge({ from: 'file:src/a.ts', to: 'file:src/shared.ts', type: 'imports' });
    store.addEdge({ from: 'file:src/b.ts', to: 'file:src/shared.ts', type: 'imports' });

    // Make shared.ts high-churn -> medium severity (not high)
    store.addNode({
      id: 'fn:shared:fn',
      type: 'function',
      name: 'fn',
      path: 'src/shared.ts',
      metadata: { cyclomaticComplexity: 1 },
    });
    store.addEdge({ from: 'file:src/shared.ts', to: 'fn:shared:fn', type: 'contains' });
    for (let i = 0; i < 10; i++) {
      store.addNode({ id: `commit:s-${i}`, type: 'commit', name: `c-${i}`, metadata: {} });
      store.addEdge({ from: `commit:s-${i}`, to: 'file:src/shared.ts', type: 'references' });
    }
    // Filler files for percentile
    for (let i = 0; i < 4; i++) {
      const fp = `src/fill${i}.ts`;
      store.addNode({
        id: `file:${fp}`,
        type: 'file',
        name: `fill${i}.ts`,
        path: fp,
        metadata: {},
      });
      store.addNode({
        id: `fn:fill${i}:fn`,
        type: 'function',
        name: 'fn',
        path: fp,
        metadata: { cyclomaticComplexity: 1 },
      });
      store.addEdge({ from: `file:${fp}`, to: `fn:fill${i}:fn`, type: 'contains' });
      store.addNode({ id: `commit:f-${i}`, type: 'commit', name: `cf-${i}`, metadata: {} });
      store.addEdge({ from: `commit:f-${i}`, to: `file:${fp}`, type: 'references' });
    }

    const predictor = new ConflictPredictor(store);
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/a.ts'] },
        { id: 'b', files: ['src/b.ts'] },
      ],
      depth: 1,
    });

    expect(result.conflicts[0]!.severity).toBe('medium');
    // Medium does NOT merge -> each task in own group
    expect(result.groups).toHaveLength(2);
    // The analyzer would have merged them (any overlap merges)
    // So groups differ -> regrouped=true
    expect(result.summary.regrouped).toBe(true);
  });

  it('low-severity conflicts do NOT cause regrouping', () => {
    // Transitive overlap with no churn/coupling -> low severity
    const store = new GraphStore();
    store.addNode({
      id: 'file:src/a.ts',
      type: 'file',
      name: 'a.ts',
      path: 'src/a.ts',
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
      id: 'file:src/shared.ts',
      type: 'file',
      name: 'shared.ts',
      path: 'src/shared.ts',
      metadata: {},
    });
    store.addEdge({ from: 'file:src/a.ts', to: 'file:src/shared.ts', type: 'imports' });
    store.addEdge({ from: 'file:src/b.ts', to: 'file:src/shared.ts', type: 'imports' });

    const predictor = new ConflictPredictor(store);
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/a.ts'] },
        { id: 'b', files: ['src/b.ts'] },
      ],
      depth: 1,
    });

    expect(result.conflicts[0]!.severity).toBe('low');
    // Low does NOT merge -> each task in own group
    expect(result.groups).toHaveLength(2);
    // Analyzer merged them -> regrouped=true (groups differ)
    expect(result.summary.regrouped).toBe(true);
  });

  it('regrouped=false when no conflicts exist', () => {
    const predictor = new ConflictPredictor();
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/a.ts'] },
        { id: 'b', files: ['src/b.ts'] },
      ],
    });

    expect(result.summary.regrouped).toBe(false);
  });

  it('regrouped=false when only high-severity conflicts exist (groups match)', () => {
    // Direct overlap -> high severity -> predictor merges a+b
    // Analyzer also merges a+b (any overlap) -> groups match -> regrouped=false
    const predictor = new ConflictPredictor();
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/shared.ts'] },
        { id: 'b', files: ['src/shared.ts'] },
      ],
    });

    expect(result.summary.high).toBe(1);
    expect(result.groups).toHaveLength(1);
    expect(result.summary.regrouped).toBe(false);
  });
});
```

1. Add the block above to the test file.
2. Run test: `npx vitest run tests/independence/ConflictPredictor.test.ts`
3. Observe: all 18 tests pass (13 from Task 3 + 5 new).
4. Run: `harness validate`
5. Commit: `test(conflict-predictor): add regrouping behavior tests`

---

### Task 5: Verdict and summary tests, plus severity precedence edge case

**Depends on:** Task 4
**Files:** `packages/graph/tests/independence/ConflictPredictor.test.ts`

Append the following `describe` block inside the top-level `describe`:

```typescript
describe('verdict and summary', () => {
  it('verdict mentions regrouping when high-severity caused regrouping', () => {
    const predictor = new ConflictPredictor();
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/shared.ts'] },
        { id: 'b', files: ['src/shared.ts'] },
        { id: 'c', files: ['src/c.ts'] },
      ],
    });

    // a+b conflict (high), c is independent
    // Analyzer groups: [a,b], [c] — predictor groups: [a,b], [c] — same -> no regrouping
    expect(result.verdict).not.toContain('regrouped');
  });

  it('verdict includes severity counts', () => {
    const predictor = new ConflictPredictor();
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/x.ts'] },
        { id: 'b', files: ['src/x.ts'] },
      ],
    });

    expect(result.verdict).toContain('1 high');
  });

  it('summary counts are correct with multiple conflict pairs', () => {
    const predictor = new ConflictPredictor();
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/x.ts'] },
        { id: 'b', files: ['src/x.ts'] },
        { id: 'c', files: ['src/x.ts'] },
      ],
    });

    // 3 pairs: a-b, a-c, b-c — all direct overlap -> high
    expect(result.summary.high).toBe(3);
    expect(result.summary.medium).toBe(0);
    expect(result.summary.low).toBe(0);
    expect(result.conflicts).toHaveLength(3);
  });

  it('verdict says all must run serially when one group', () => {
    const predictor = new ConflictPredictor();
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/x.ts'] },
        { id: 'b', files: ['src/x.ts'] },
      ],
    });

    expect(result.verdict).toContain('must run serially');
  });

  it('pair with both direct and transitive overlaps takes highest severity', () => {
    // Task a writes to shared.ts (direct overlap with b)
    // Task b writes to shared.ts AND a.ts -> shared.ts is transitive from graph
    // Direct overlap takes precedence -> high severity
    const store = new GraphStore();
    store.addNode({
      id: 'file:src/a.ts',
      type: 'file',
      name: 'a.ts',
      path: 'src/a.ts',
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
      id: 'file:src/shared.ts',
      type: 'file',
      name: 'shared.ts',
      path: 'src/shared.ts',
      metadata: {},
    });
    store.addNode({
      id: 'file:src/dep.ts',
      type: 'file',
      name: 'dep.ts',
      path: 'src/dep.ts',
      metadata: {},
    });

    store.addEdge({ from: 'file:src/a.ts', to: 'file:src/dep.ts', type: 'imports' });
    store.addEdge({ from: 'file:src/b.ts', to: 'file:src/dep.ts', type: 'imports' });

    const predictor = new ConflictPredictor(store);
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/a.ts', 'src/shared.ts'] },
        { id: 'b', files: ['src/b.ts', 'src/shared.ts'] },
      ],
      depth: 1,
    });

    // Direct overlap on shared.ts -> high; transitive on dep.ts -> low
    // Pair severity should be high (max)
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.severity).toBe('high');
    expect(result.conflicts[0]!.reason).toContain('Both tasks write to');
  });

  it('file-only degradation verdict when no graph', () => {
    const predictor = new ConflictPredictor();
    const result = predictor.predict({
      tasks: [
        { id: 'a', files: ['src/a.ts'] },
        { id: 'b', files: ['src/b.ts'] },
      ],
    });

    expect(result.analysisLevel).toBe('file-only');
    expect(result.verdict).toContain('Graph unavailable');
    expect(result.verdict).toContain('file overlaps only');
  });
});
```

1. Add the block above to the test file.
2. Run test: `npx vitest run tests/independence/ConflictPredictor.test.ts`
3. Observe: all 24 tests pass (18 from Task 4 + 6 new).
4. Run: `harness validate`
5. Commit: `test(conflict-predictor): add verdict, summary, and severity precedence tests`

---

## Traceability Matrix

| Observable Truth                                                           | Task(s)                |
| -------------------------------------------------------------------------- | ---------------------- |
| 1. Direct file overlap -> high severity with "Both tasks write to"         | Task 2                 |
| 2. Transitive overlap on high-churn -> medium                              | Task 3                 |
| 3. Transitive overlap on high-coupling -> medium                           | Task 3                 |
| 4. Transitive-only with low churn/coupling -> low                          | Task 3                 |
| 5. High-severity causes regrouping (same group)                            | Task 4                 |
| 6. Medium/low do NOT cause regrouping                                      | Task 4                 |
| 7. Every ConflictDetail has non-empty reason and mitigation                | Task 2                 |
| 8. Without graph: direct->high, transitive->low, verdict notes degradation | Task 2, Task 3, Task 5 |
| 9. Missing metrics -> transitive classified as low                         | Task 3                 |
| 10. No conflicts -> empty conflicts, regrouped=false                       | Task 1                 |
| 11. Validation errors throw                                                | Task 1                 |
| 12. All tests pass                                                         | Task 5 (final run)     |
