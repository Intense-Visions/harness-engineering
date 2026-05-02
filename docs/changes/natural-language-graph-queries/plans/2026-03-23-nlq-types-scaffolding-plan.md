# Plan: NLQ Types + Scaffolding (Phase 1)

**Date:** 2026-03-23
**Spec:** docs/changes/natural-language-graph-queries/proposal.md
**Estimated tasks:** 3
**Estimated time:** 10 minutes

## Goal

Create the foundational types and public API shell for the NLQ module so that subsequent phases can import and build against stable interfaces.

## Observable Truths (Acceptance Criteria)

1. `packages/graph/src/nlq/types.ts` exists and exports `Intent`, `ClassificationResult`, `ResolvedEntity`, and `AskGraphResult` types with `readonly` modifiers on all fields.
2. `packages/graph/src/nlq/index.ts` exists and exports an `askGraph` function with signature `(store: GraphStore, question: string) => AskGraphResult`.
3. When `tsc --noEmit` runs in `packages/graph/`, it passes (types are structurally correct).
4. `packages/graph/tests/nlq/types.test.ts` exists with tests verifying type-level assignability and that the `askGraph` stub returns a valid `AskGraphResult`.
5. When `npx vitest run tests/nlq/types.test.ts` runs in `packages/graph/`, all tests pass.
6. When `harness validate` runs, it passes.

## File Map

- CREATE `packages/graph/src/nlq/types.ts`
- CREATE `packages/graph/src/nlq/index.ts`
- CREATE `packages/graph/tests/nlq/types.test.ts`

## Tasks

### Task 1: Define NLQ types

**Depends on:** none
**Files:** `packages/graph/src/nlq/types.ts`

1. Create directory `packages/graph/src/nlq/`.
2. Create `packages/graph/src/nlq/types.ts` with the following content:

```typescript
import type { GraphNode } from '../types.js';

/**
 * Intent categories for natural language graph queries.
 */
export type Intent = 'impact' | 'find' | 'relationships' | 'explain' | 'anomaly';

/**
 * Result of classifying a natural language question into an intent.
 */
export interface ClassificationResult {
  readonly intent: Intent;
  readonly confidence: number; // 0-1
  readonly signals: Readonly<Record<string, number>>; // signal name -> score
}

/**
 * An entity mention from the query resolved to a graph node.
 */
export interface ResolvedEntity {
  readonly raw: string; // original mention from query
  readonly nodeId: string; // resolved graph node ID
  readonly node: GraphNode;
  readonly confidence: number; // 0-1
  readonly method: 'exact' | 'fusion' | 'path'; // which cascade step matched
}

/**
 * Complete result from askGraph, including intent, entities, summary, and raw data.
 */
export interface AskGraphResult {
  readonly intent: Intent;
  readonly intentConfidence: number;
  readonly entities: readonly ResolvedEntity[];
  readonly summary: string; // human-readable answer
  readonly data: unknown; // raw graph result (same shape as underlying tool)
  readonly suggestions?: readonly string[]; // if confidence is low, suggest rephrased queries
}
```

3. Run: `cd packages/graph && npx tsc --noEmit`
4. Observe: passes with no errors.
5. Run: `harness validate`
6. Commit: `feat(graph): define NLQ types for natural language graph queries`

---

### Task 2: Create test file for types and askGraph stub (TDD)

**Depends on:** Task 1
**Files:** `packages/graph/tests/nlq/types.test.ts`

1. Create directory `packages/graph/tests/nlq/`.
2. Create `packages/graph/tests/nlq/types.test.ts` with the following content:

```typescript
import { describe, it, expect } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { askGraph } from '../../src/nlq/index.js';
import type {
  Intent,
  ClassificationResult,
  ResolvedEntity,
  AskGraphResult,
} from '../../src/nlq/types.js';

describe('NLQ types', () => {
  describe('Intent type', () => {
    it('should accept all five intent values', () => {
      const intents: Intent[] = ['impact', 'find', 'relationships', 'explain', 'anomaly'];
      expect(intents).toHaveLength(5);
    });
  });

  describe('ClassificationResult shape', () => {
    it('should satisfy the interface contract', () => {
      const result: ClassificationResult = {
        intent: 'impact',
        confidence: 0.85,
        signals: { keyword: 0.9, questionWord: 0.8 },
      };
      expect(result.intent).toBe('impact');
      expect(result.confidence).toBe(0.85);
      expect(result.signals).toEqual({ keyword: 0.9, questionWord: 0.8 });
    });
  });

  describe('ResolvedEntity shape', () => {
    it('should satisfy the interface contract', () => {
      const entity: ResolvedEntity = {
        raw: 'AuthMiddleware',
        nodeId: 'node-1',
        node: { id: 'node-1', type: 'class', name: 'AuthMiddleware', metadata: {} },
        confidence: 1.0,
        method: 'exact',
      };
      expect(entity.raw).toBe('AuthMiddleware');
      expect(entity.method).toBe('exact');
    });
  });

  describe('AskGraphResult shape', () => {
    it('should satisfy the interface contract with suggestions', () => {
      const result: AskGraphResult = {
        intent: 'find',
        intentConfidence: 0.75,
        entities: [],
        summary: 'Found 3 matches.',
        data: { nodes: [] },
        suggestions: ['Try: "where is AuthMiddleware?"'],
      };
      expect(result.intent).toBe('find');
      expect(result.suggestions).toHaveLength(1);
    });

    it('should satisfy the interface contract without suggestions', () => {
      const result: AskGraphResult = {
        intent: 'impact',
        intentConfidence: 0.95,
        entities: [],
        summary: 'Changing X affects 5 files.',
        data: {},
      };
      expect(result.suggestions).toBeUndefined();
    });
  });
});

describe('askGraph', () => {
  it('should return a valid AskGraphResult stub', () => {
    const store = new GraphStore();
    const result = askGraph(store, 'what breaks if I change auth?');

    expect(result).toHaveProperty('intent');
    expect(result).toHaveProperty('intentConfidence');
    expect(result).toHaveProperty('entities');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('data');
    expect(typeof result.summary).toBe('string');
    expect(Array.isArray(result.entities)).toBe(true);
  });

  it('should return a not-implemented summary in the stub', () => {
    const store = new GraphStore();
    const result = askGraph(store, 'where is the auth middleware?');

    expect(result.intentConfidence).toBe(0);
    expect(result.summary).toContain('not yet implemented');
  });
});
```

3. Run: `cd packages/graph && npx vitest run tests/nlq/types.test.ts`
4. Observe: fails because `packages/graph/src/nlq/index.ts` does not export `askGraph` yet (or exports a stub that does not exist).
5. Proceed to Task 3 to make the test pass.

---

### Task 3: Create askGraph public API stub

**Depends on:** Task 1, Task 2
**Files:** `packages/graph/src/nlq/index.ts`

1. Create `packages/graph/src/nlq/index.ts` with the following content:

```typescript
import type { GraphStore } from '../store/GraphStore.js';
import type { AskGraphResult } from './types.js';

export type { Intent, ClassificationResult, ResolvedEntity, AskGraphResult } from './types.js';

/**
 * Ask a natural language question about the codebase knowledge graph.
 *
 * Translates the question into graph operations and returns a human-readable
 * summary alongside raw graph data.
 *
 * @param store - The GraphStore instance to query against
 * @param question - Natural language question about the codebase
 * @returns AskGraphResult with intent, entities, summary, and raw data
 */
export function askGraph(store: GraphStore, question: string): AskGraphResult {
  // Stub implementation — will be wired up in Phase 6 (Orchestrator)
  void store;
  void question;

  return {
    intent: 'find',
    intentConfidence: 0,
    entities: [],
    summary: 'askGraph is not yet implemented. This is a stub.',
    data: null,
  };
}
```

2. Run: `cd packages/graph && npx vitest run tests/nlq/types.test.ts`
3. Observe: all tests pass.
4. Run: `cd packages/graph && npx tsc --noEmit`
5. Observe: passes with no errors.
6. Run: `harness validate`
7. Commit: `feat(graph): add askGraph stub and NLQ test scaffolding`

---

## Traceability

| Observable Truth                                    | Delivered by                         |
| --------------------------------------------------- | ------------------------------------ |
| 1. types.ts exports all types with readonly         | Task 1                               |
| 2. index.ts exports askGraph with correct signature | Task 3                               |
| 3. tsc --noEmit passes                              | Task 1 (verified), Task 3 (verified) |
| 4. Test file exists with type and stub tests        | Task 2                               |
| 5. vitest passes                                    | Task 3 (final verification)          |
| 6. harness validate passes                          | Task 1, Task 3                       |
