# Plan: Phase 1 — Core TaskIndependenceAnalyzer

**Date:** 2026-03-23
**Spec:** docs/changes/task-independence-detection/proposal.md
**Estimated tasks:** 7
**Estimated time:** 25 minutes

## Goal

Create a `TaskIndependenceAnalyzer` class in the graph package that computes pairwise task independence from file lists, with optional graph-expanded transitive analysis, and returns conflict matrices with parallel groupings.

## Observable Truths (Acceptance Criteria)

1. When `TaskIndependenceAnalyzer` is instantiated without a `GraphStore`, calling `analyze()` with two tasks sharing a file returns `analysisLevel: 'file-only'` with a direct overlap entry.
2. When `TaskIndependenceAnalyzer` is instantiated without a `GraphStore`, calling `analyze()` with two tasks sharing no files returns `independent: true` for that pair.
3. When `TaskIndependenceAnalyzer` is instantiated with a `GraphStore` containing import edges, calling `analyze()` at depth 1 detects transitive overlaps with `type: 'transitive'` and a populated `via` field.
4. When `analyze()` is called with `depth: 0`, only direct file overlaps are checked even when a graph store is provided — `analysisLevel` is `'file-only'`.
5. When three tasks form two conflict clusters (A conflicts B, C independent), `groups` returns two arrays: one containing A and B, one containing C.
6. When a task has an empty `files` array, `analyze()` throws a descriptive error.
7. When two tasks share the same `id`, `analyze()` throws a descriptive error.
8. The verdict string includes the count of parallel groups and task names.
9. `npx vitest run packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts` passes with all tests.
10. `import { TaskIndependenceAnalyzer } from '@harness-engineering/graph'` resolves after the index export is added.
11. `harness validate` passes.

## File Map

```
CREATE packages/graph/src/independence/TaskIndependenceAnalyzer.ts
CREATE packages/graph/src/independence/index.ts
CREATE packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts
MODIFY packages/graph/src/index.ts (add independence exports)
```

## Tasks

### Task 1: Define types and create barrel export

**Depends on:** none
**Files:** `packages/graph/src/independence/index.ts`

1. Create directory `packages/graph/src/independence/`.
2. Create `packages/graph/src/independence/index.ts`:

```typescript
export type {
  TaskDefinition,
  IndependenceCheckParams,
  OverlapDetail,
  PairResult,
  IndependenceResult,
} from './TaskIndependenceAnalyzer.js';
export { TaskIndependenceAnalyzer } from './TaskIndependenceAnalyzer.js';
```

3. Run: `harness validate`
4. Commit: `feat(graph): add independence barrel export`

---

### Task 2: Implement TaskIndependenceAnalyzer — types, constructor, validation

**Depends on:** Task 1
**Files:** `packages/graph/src/independence/TaskIndependenceAnalyzer.ts`

1. Create `packages/graph/src/independence/TaskIndependenceAnalyzer.ts`:

```typescript
import type { GraphStore } from '../store/GraphStore.js';
import type { EdgeType } from '../types.js';
import { ContextQL } from '../query/ContextQL.js';

// --- Public types ---

export interface TaskDefinition {
  readonly id: string;
  readonly files: readonly string[];
}

export interface IndependenceCheckParams {
  readonly tasks: readonly TaskDefinition[];
  readonly depth?: number;
  readonly edgeTypes?: readonly string[];
}

export interface OverlapDetail {
  readonly file: string;
  readonly type: 'direct' | 'transitive';
  readonly via?: string;
}

export interface PairResult {
  readonly taskA: string;
  readonly taskB: string;
  readonly independent: boolean;
  readonly overlaps: readonly OverlapDetail[];
}

export interface IndependenceResult {
  readonly tasks: readonly string[];
  readonly analysisLevel: 'graph-expanded' | 'file-only';
  readonly depth: number;
  readonly pairs: readonly PairResult[];
  readonly groups: readonly (readonly string[])[];
  readonly verdict: string;
}

// --- Default edge types for expansion ---

const DEFAULT_EDGE_TYPES: readonly EdgeType[] = ['imports', 'calls', 'references'];

// --- Analyzer ---

export class TaskIndependenceAnalyzer {
  private readonly store: GraphStore | undefined;

  constructor(store?: GraphStore) {
    this.store = store;
  }

  analyze(params: IndependenceCheckParams): IndependenceResult {
    const { tasks } = params;
    const depth = params.depth ?? 1;
    const edgeTypes = (params.edgeTypes ?? DEFAULT_EDGE_TYPES) as readonly EdgeType[];

    // --- Validation ---
    this.validate(tasks);

    // --- Determine analysis level ---
    const useGraph = this.store != null && depth > 0;
    const analysisLevel: 'graph-expanded' | 'file-only' = useGraph ? 'graph-expanded' : 'file-only';

    // --- Expand file sets ---
    // originalFiles: Map<taskId, Set<file>>
    // expandedFiles: Map<taskId, Map<file, sourceFile>> (expanded file -> which original file led to it)
    const originalFiles = new Map<string, Set<string>>();
    const expandedFiles = new Map<string, Map<string, string>>();

    for (const task of tasks) {
      const origSet = new Set(task.files);
      originalFiles.set(task.id, origSet);

      if (useGraph) {
        const expanded = this.expandViaGraph(task.files, depth, edgeTypes);
        expandedFiles.set(task.id, expanded);
      } else {
        expandedFiles.set(task.id, new Map());
      }
    }

    // --- Compute pairwise overlaps ---
    const taskIds = tasks.map((t) => t.id);
    const pairs: PairResult[] = [];

    for (let i = 0; i < taskIds.length; i++) {
      for (let j = i + 1; j < taskIds.length; j++) {
        const idA = taskIds[i]!;
        const idB = taskIds[j]!;
        const pair = this.computePairOverlap(
          idA,
          idB,
          originalFiles.get(idA)!,
          originalFiles.get(idB)!,
          expandedFiles.get(idA)!,
          expandedFiles.get(idB)!
        );
        pairs.push(pair);
      }
    }

    // --- Build parallel groups via union-find ---
    const groups = this.buildGroups(taskIds, pairs);

    // --- Generate verdict ---
    const verdict = this.generateVerdict(taskIds, groups, analysisLevel);

    return {
      tasks: taskIds,
      analysisLevel,
      depth,
      pairs,
      groups,
      verdict,
    };
  }

  // --- Private methods ---

  private validate(tasks: readonly TaskDefinition[]): void {
    const seenIds = new Set<string>();
    for (const task of tasks) {
      if (seenIds.has(task.id)) {
        throw new Error(`Duplicate task ID: "${task.id}"`);
      }
      seenIds.add(task.id);

      if (task.files.length === 0) {
        throw new Error(`Task "${task.id}" has an empty files array`);
      }
    }
  }

  private expandViaGraph(
    files: readonly string[],
    depth: number,
    edgeTypes: readonly EdgeType[]
  ): Map<string, string> {
    // Returns Map<expandedFilePath, sourceOriginalFile>
    const result = new Map<string, string>();
    const store = this.store!;
    const cql = new ContextQL(store);

    for (const file of files) {
      const nodeId = `file:${file}`;
      // Only expand if the node exists in the graph
      const node = store.getNode(nodeId);
      if (!node) continue;

      const queryResult = cql.execute({
        rootNodeIds: [nodeId],
        maxDepth: depth,
        includeEdges: edgeTypes,
        includeTypes: ['file'],
      });

      for (const n of queryResult.nodes) {
        // Extract the file path from the node ID (strip 'file:' prefix)
        const path = n.path ?? n.id.replace(/^file:/, '');
        // Do not include original files in the expanded set
        if (!files.includes(path)) {
          // Only record the first source (first original file that led here)
          if (!result.has(path)) {
            result.set(path, file);
          }
        }
      }
    }

    return result;
  }

  private computePairOverlap(
    idA: string,
    idB: string,
    origA: Set<string>,
    origB: Set<string>,
    expandedA: Map<string, string>,
    expandedB: Map<string, string>
  ): PairResult {
    const overlaps: OverlapDetail[] = [];

    // Direct overlaps: intersection of original file lists
    for (const file of origA) {
      if (origB.has(file)) {
        overlaps.push({ file, type: 'direct' });
      }
    }

    // Transitive overlaps: expanded files from A that appear in B's original or expanded,
    // and expanded files from B that appear in A's original — excluding direct overlaps
    const directFiles = new Set(overlaps.map((o) => o.file));
    const transitiveFiles = new Set<string>();

    // A's expanded files overlapping with B's original files
    for (const [file, via] of expandedA) {
      if (origB.has(file) && !directFiles.has(file) && !transitiveFiles.has(file)) {
        transitiveFiles.add(file);
        overlaps.push({ file, type: 'transitive', via });
      }
    }

    // B's expanded files overlapping with A's original files
    for (const [file, via] of expandedB) {
      if (origA.has(file) && !directFiles.has(file) && !transitiveFiles.has(file)) {
        transitiveFiles.add(file);
        overlaps.push({ file, type: 'transitive', via });
      }
    }

    // A's expanded files overlapping with B's expanded files
    for (const [file, viaA] of expandedA) {
      if (expandedB.has(file) && !directFiles.has(file) && !transitiveFiles.has(file)) {
        transitiveFiles.add(file);
        overlaps.push({ file, type: 'transitive', via: viaA });
      }
    }

    return {
      taskA: idA,
      taskB: idB,
      independent: overlaps.length === 0,
      overlaps,
    };
  }

  private buildGroups(
    taskIds: readonly string[],
    pairs: readonly PairResult[]
  ): readonly (readonly string[])[] {
    // Union-find
    const parent = new Map<string, string>();
    const rank = new Map<string, number>();

    for (const id of taskIds) {
      parent.set(id, id);
      rank.set(id, 0);
    }

    const find = (x: string): string => {
      let root = x;
      while (parent.get(root) !== root) {
        root = parent.get(root)!;
      }
      // Path compression
      let current = x;
      while (current !== root) {
        const next = parent.get(current)!;
        parent.set(current, root);
        current = next;
      }
      return root;
    };

    const union = (a: string, b: string): void => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA === rootB) return;
      const rankA = rank.get(rootA)!;
      const rankB = rank.get(rootB)!;
      if (rankA < rankB) {
        parent.set(rootA, rootB);
      } else if (rankA > rankB) {
        parent.set(rootB, rootA);
      } else {
        parent.set(rootB, rootA);
        rank.set(rootA, rankA + 1);
      }
    };

    // Union conflicting task pairs
    for (const pair of pairs) {
      if (!pair.independent) {
        union(pair.taskA, pair.taskB);
      }
    }

    // Collect groups
    const groupMap = new Map<string, string[]>();
    for (const id of taskIds) {
      const root = find(id);
      if (!groupMap.has(root)) {
        groupMap.set(root, []);
      }
      groupMap.get(root)!.push(id);
    }

    return Array.from(groupMap.values());
  }

  private generateVerdict(
    taskIds: readonly string[],
    groups: readonly (readonly string[])[],
    analysisLevel: 'graph-expanded' | 'file-only'
  ): string {
    const total = taskIds.length;
    const groupCount = groups.length;

    let verdict: string;
    if (groupCount === 1) {
      verdict = `All ${total} tasks conflict — must run serially.`;
    } else if (groupCount === total) {
      verdict = `All ${total} tasks are independent — can all run in parallel.`;
    } else {
      verdict = `${total} tasks form ${groupCount} independent groups — ${groupCount} parallel waves possible.`;
    }

    if (analysisLevel === 'file-only') {
      verdict += ' Graph unavailable — transitive dependencies not checked.';
    }

    return verdict;
  }
}
```

3. Run: `npx tsc --noEmit -p packages/graph/tsconfig.json` (verify types compile)
4. Run: `harness validate`
5. Commit: `feat(graph): implement TaskIndependenceAnalyzer core`

---

### Task 3: Write tests — validation errors

**Depends on:** Task 2
**Files:** `packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts`

1. Create directory `packages/graph/tests/independence/`.
2. Create `packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { TaskIndependenceAnalyzer } from '../../src/independence/TaskIndependenceAnalyzer.js';

describe('TaskIndependenceAnalyzer', () => {
  describe('validation', () => {
    it('throws on duplicate task IDs', () => {
      const analyzer = new TaskIndependenceAnalyzer();
      expect(() =>
        analyzer.analyze({
          tasks: [
            { id: 'a', files: ['f1.ts'] },
            { id: 'a', files: ['f2.ts'] },
          ],
        })
      ).toThrow('Duplicate task ID: "a"');
    });

    it('throws on empty files array', () => {
      const analyzer = new TaskIndependenceAnalyzer();
      expect(() =>
        analyzer.analyze({
          tasks: [
            { id: 'a', files: [] },
            { id: 'b', files: ['f1.ts'] },
          ],
        })
      ).toThrow('Task "a" has an empty files array');
    });
  });
});
```

3. Run: `npx vitest run packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts`
4. Observe: 2 tests pass.
5. Run: `harness validate`
6. Commit: `test(graph): add TaskIndependenceAnalyzer validation tests`

---

### Task 4: Write tests — file-only analysis (no graph)

**Depends on:** Task 3
**Files:** `packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts`

1. Append to the test file inside the outer `describe` block:

```typescript
describe('file-only analysis (no graph)', () => {
  it('detects direct file overlap between two tasks', () => {
    const analyzer = new TaskIndependenceAnalyzer();
    const result = analyzer.analyze({
      tasks: [
        { id: 'a', files: ['src/shared.ts', 'src/a.ts'] },
        { id: 'b', files: ['src/shared.ts', 'src/b.ts'] },
      ],
    });

    expect(result.analysisLevel).toBe('file-only');
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]!.independent).toBe(false);
    expect(result.pairs[0]!.overlaps).toEqual([{ file: 'src/shared.ts', type: 'direct' }]);
  });

  it('reports independent when no files overlap', () => {
    const analyzer = new TaskIndependenceAnalyzer();
    const result = analyzer.analyze({
      tasks: [
        { id: 'a', files: ['src/a.ts'] },
        { id: 'b', files: ['src/b.ts'] },
      ],
    });

    expect(result.pairs[0]!.independent).toBe(true);
    expect(result.pairs[0]!.overlaps).toEqual([]);
  });

  it('uses file-only when depth is 0 even with graph store', () => {
    const store = new GraphStore();
    const analyzer = new TaskIndependenceAnalyzer(store);
    const result = analyzer.analyze({
      tasks: [
        { id: 'a', files: ['src/a.ts'] },
        { id: 'b', files: ['src/b.ts'] },
      ],
      depth: 0,
    });

    expect(result.analysisLevel).toBe('file-only');
    expect(result.depth).toBe(0);
  });

  it('includes graph-unavailable warning in verdict', () => {
    const analyzer = new TaskIndependenceAnalyzer();
    const result = analyzer.analyze({
      tasks: [
        { id: 'a', files: ['src/a.ts'] },
        { id: 'b', files: ['src/b.ts'] },
      ],
    });

    expect(result.verdict).toContain('Graph unavailable');
  });
});
```

2. Run: `npx vitest run packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts`
3. Observe: 6 tests pass (2 validation + 4 file-only).
4. Run: `harness validate`
5. Commit: `test(graph): add file-only independence analysis tests`

---

### Task 5: Write tests — graph-expanded analysis

**Depends on:** Task 4
**Files:** `packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts`

1. Append to the test file inside the outer `describe` block:

```typescript
describe('graph-expanded analysis', () => {
  function buildGraphWithImports(): GraphStore {
    const store = new GraphStore();
    // Files: a.ts -> shared.ts <- b.ts
    // a.ts imports shared.ts, b.ts imports shared.ts
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
    return store;
  }

  it('detects transitive overlap via graph expansion at depth 1', () => {
    const store = buildGraphWithImports();
    const analyzer = new TaskIndependenceAnalyzer(store);
    const result = analyzer.analyze({
      tasks: [
        { id: 'a', files: ['src/a.ts'] },
        { id: 'b', files: ['src/b.ts'] },
      ],
      depth: 1,
    });

    expect(result.analysisLevel).toBe('graph-expanded');
    expect(result.pairs[0]!.independent).toBe(false);

    const transitiveOverlap = result.pairs[0]!.overlaps.find(
      (o) => o.type === 'transitive' && o.file === 'src/shared.ts'
    );
    expect(transitiveOverlap).toBeDefined();
    expect(transitiveOverlap!.via).toBeDefined();
  });

  it('does not detect transitive overlap at depth 0', () => {
    const store = buildGraphWithImports();
    const analyzer = new TaskIndependenceAnalyzer(store);
    const result = analyzer.analyze({
      tasks: [
        { id: 'a', files: ['src/a.ts'] },
        { id: 'b', files: ['src/b.ts'] },
      ],
      depth: 0,
    });

    expect(result.pairs[0]!.independent).toBe(true);
  });

  it('respects edgeTypes filter', () => {
    const store = buildGraphWithImports();
    // Add a 'calls' edge that would create a conflict
    store.addNode({
      id: 'file:src/called.ts',
      type: 'file',
      name: 'called.ts',
      path: 'src/called.ts',
      metadata: {},
    });
    store.addEdge({ from: 'file:src/a.ts', to: 'file:src/called.ts', type: 'calls' });
    store.addEdge({ from: 'file:src/b.ts', to: 'file:src/called.ts', type: 'calls' });

    const analyzer = new TaskIndependenceAnalyzer(store);

    // Only check 'calls' edges — should find overlap on called.ts
    const result = analyzer.analyze({
      tasks: [
        { id: 'a', files: ['src/a.ts'] },
        { id: 'b', files: ['src/b.ts'] },
      ],
      depth: 1,
      edgeTypes: ['calls'],
    });

    expect(result.pairs[0]!.independent).toBe(false);
    const calledOverlap = result.pairs[0]!.overlaps.find((o) => o.file === 'src/called.ts');
    expect(calledOverlap).toBeDefined();
  });

  it('handles files not found in graph gracefully', () => {
    const store = new GraphStore();
    // Graph is empty — no nodes exist
    const analyzer = new TaskIndependenceAnalyzer(store);
    const result = analyzer.analyze({
      tasks: [
        { id: 'a', files: ['src/a.ts'] },
        { id: 'b', files: ['src/b.ts'] },
      ],
      depth: 1,
    });

    // No graph nodes found, so falls back to direct-only comparison
    expect(result.analysisLevel).toBe('graph-expanded');
    expect(result.pairs[0]!.independent).toBe(true);
  });
});
```

2. Run: `npx vitest run packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts`
3. Observe: 10 tests pass (2 validation + 4 file-only + 4 graph-expanded).
4. Run: `harness validate`
5. Commit: `test(graph): add graph-expanded independence analysis tests`

---

### Task 6: Write tests — union-find grouping and verdict

**Depends on:** Task 5
**Files:** `packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts`

1. Append to the test file inside the outer `describe` block:

```typescript
describe('parallel grouping', () => {
  it('groups conflicting tasks together and independent tasks separately', () => {
    const analyzer = new TaskIndependenceAnalyzer();
    const result = analyzer.analyze({
      tasks: [
        { id: 'a', files: ['src/shared.ts'] },
        { id: 'b', files: ['src/shared.ts'] },
        { id: 'c', files: ['src/other.ts'] },
      ],
    });

    expect(result.groups).toHaveLength(2);
    // Find the group containing 'a' — it must also contain 'b'
    const groupWithA = result.groups.find((g) => g.includes('a'));
    expect(groupWithA).toContain('b');
    expect(groupWithA).not.toContain('c');
    // 'c' is in its own group
    const groupWithC = result.groups.find((g) => g.includes('c'));
    expect(groupWithC).toEqual(['c']);
  });

  it('puts all tasks in one group when all conflict', () => {
    const analyzer = new TaskIndependenceAnalyzer();
    const result = analyzer.analyze({
      tasks: [
        { id: 'a', files: ['src/shared.ts'] },
        { id: 'b', files: ['src/shared.ts'] },
        { id: 'c', files: ['src/shared.ts'] },
      ],
    });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toHaveLength(3);
  });

  it('puts each task in its own group when all independent', () => {
    const analyzer = new TaskIndependenceAnalyzer();
    const result = analyzer.analyze({
      tasks: [
        { id: 'a', files: ['src/a.ts'] },
        { id: 'b', files: ['src/b.ts'] },
        { id: 'c', files: ['src/c.ts'] },
      ],
    });

    expect(result.groups).toHaveLength(3);
  });
});

describe('verdict', () => {
  it('says all tasks conflict when one group', () => {
    const analyzer = new TaskIndependenceAnalyzer();
    const result = analyzer.analyze({
      tasks: [
        { id: 'a', files: ['src/x.ts'] },
        { id: 'b', files: ['src/x.ts'] },
      ],
    });
    expect(result.verdict).toContain('must run serially');
  });

  it('says all independent when each task is its own group', () => {
    const analyzer = new TaskIndependenceAnalyzer();
    const result = analyzer.analyze({
      tasks: [
        { id: 'a', files: ['src/a.ts'] },
        { id: 'b', files: ['src/b.ts'] },
      ],
    });
    expect(result.verdict).toContain('can all run in parallel');
  });

  it('says N groups when mixed', () => {
    const analyzer = new TaskIndependenceAnalyzer();
    const result = analyzer.analyze({
      tasks: [
        { id: 'a', files: ['src/shared.ts'] },
        { id: 'b', files: ['src/shared.ts'] },
        { id: 'c', files: ['src/c.ts'] },
      ],
    });
    expect(result.verdict).toContain('2 independent groups');
    expect(result.verdict).toContain('2 parallel waves');
  });
});
```

2. Run: `npx vitest run packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts`
3. Observe: 16 tests pass.
4. Run: `harness validate`
5. Commit: `test(graph): add grouping and verdict tests for TaskIndependenceAnalyzer`

---

### Task 7: Export from graph package index

**Depends on:** Task 2
**Files:** `packages/graph/src/index.ts`

1. Add to `packages/graph/src/index.ts` before the `VERSION` line:

```typescript
// Independence
export { TaskIndependenceAnalyzer } from './independence/index.js';
export type {
  TaskDefinition,
  IndependenceCheckParams,
  OverlapDetail,
  PairResult,
  IndependenceResult,
} from './independence/index.js';
```

2. Run: `npx tsc --noEmit -p packages/graph/tsconfig.json`
3. Run: `npx vitest run packages/graph/tests/independence/TaskIndependenceAnalyzer.test.ts`
4. Run: `harness validate`
5. Commit: `feat(graph): export TaskIndependenceAnalyzer from package index`

---

## Traceability Matrix

| Observable Truth                      | Delivered by Task(s)   |
| ------------------------------------- | ---------------------- |
| 1. File-only direct overlap detection | Task 2, Task 4         |
| 2. Independent when no overlap        | Task 2, Task 4         |
| 3. Transitive overlap via graph       | Task 2, Task 5         |
| 4. Depth 0 forces file-only           | Task 2, Task 4, Task 5 |
| 5. Union-find grouping correctness    | Task 2, Task 6         |
| 6. Validation errors                  | Task 2, Task 3         |
| 7. Duplicate ID error                 | Task 2, Task 3         |
| 8. Verdict string content             | Task 2, Task 6         |
| 9. All tests pass                     | Task 3-6               |
| 10. Index export resolves             | Task 1, Task 7         |
| 11. harness validate passes           | All tasks              |
