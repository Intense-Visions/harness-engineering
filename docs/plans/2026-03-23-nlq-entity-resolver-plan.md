# Plan: NLQ EntityResolver -- Fuzzy Cascade

**Date:** 2026-03-23
**Spec:** docs/changes/natural-language-graph-queries/proposal.md (Phase 4)
**Estimated tasks:** 3
**Estimated time:** 10 minutes

## Goal

Implement EntityResolver that resolves raw entity strings (from EntityExtractor) to actual graph nodes using a 3-step fuzzy cascade: exact name match, FusionLayer search, path match.

## Observable Truths (Acceptance Criteria)

1. When EntityResolver receives a raw string matching a node name exactly, the system shall return a ResolvedEntity with `confidence: 1.0` and `method: 'exact'`.
2. When EntityResolver receives a raw string that does not match exactly but FusionLayer returns a result with score > 0.5, the system shall return a ResolvedEntity with `confidence` equal to the FusionLayer score and `method: 'fusion'`.
3. If FusionLayer returns a result with score <= 0.5, then the system shall not use that result and shall fall through to Step 3.
4. When EntityResolver receives a raw string matching a file node path via `path.includes(raw)`, the system shall return a ResolvedEntity with `confidence: 0.6` and `method: 'path'`.
5. When no cascade step matches, the entity shall not appear in the resolved results (unresolved).
6. Where no FusionLayer is provided, the system shall skip Step 2 entirely and cascade from Step 1 to Step 3.
7. The system shall resolve multiple entities in a single call, returning one ResolvedEntity per matched raw string.
8. `npx vitest run tests/nlq/EntityResolver.test.ts` passes with all tests green.
9. `tsc --noEmit` passes clean.
10. `harness validate` passes.

## File Map

- CREATE `packages/graph/tests/nlq/EntityResolver.test.ts`
- CREATE `packages/graph/src/nlq/EntityResolver.ts`
- MODIFY `packages/graph/src/nlq/index.ts` (add EntityResolver export)

## Tasks

### Task 1: Create EntityResolver test file

**Depends on:** none
**Files:** `packages/graph/tests/nlq/EntityResolver.test.ts`

1. Create test file `packages/graph/tests/nlq/EntityResolver.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { EntityResolver } from '../../src/nlq/EntityResolver.js';
import type { FusionLayer, FusionResult } from '../../src/search/FusionLayer.js';
import type { GraphNode } from '../../src/types.js';

describe('EntityResolver', () => {
  let store: GraphStore;

  const classNode: GraphNode = {
    id: 'class:AuthService',
    type: 'class',
    name: 'AuthService',
    path: 'src/services/auth-service.ts',
    metadata: {},
  };

  const fnNode: GraphNode = {
    id: 'fn:hashPassword',
    type: 'function',
    name: 'hashPassword',
    path: 'src/utils/hash.ts',
    metadata: {},
  };

  const fileNode: GraphNode = {
    id: 'file:middleware.ts',
    type: 'file',
    name: 'middleware.ts',
    path: 'src/auth/middleware.ts',
    metadata: {},
  };

  const fileNode2: GraphNode = {
    id: 'file:auth-service.ts',
    type: 'file',
    name: 'auth-service.ts',
    path: 'src/services/auth-service.ts',
    metadata: {},
  };

  beforeEach(() => {
    store = new GraphStore();
    store.addNode(classNode);
    store.addNode(fnNode);
    store.addNode(fileNode);
    store.addNode(fileNode2);
  });

  describe('Step 1: exact name match', () => {
    it('resolves by exact name with confidence 1.0', async () => {
      const resolver = new EntityResolver(store);
      const results = await resolver.resolve(['AuthService']);
      expect(results).toHaveLength(1);
      expect(results[0]!.raw).toBe('AuthService');
      expect(results[0]!.nodeId).toBe('class:AuthService');
      expect(results[0]!.confidence).toBe(1.0);
      expect(results[0]!.method).toBe('exact');
    });

    it('resolves exact name match before other strategies', async () => {
      const resolver = new EntityResolver(store);
      const results = await resolver.resolve(['hashPassword']);
      expect(results[0]!.method).toBe('exact');
      expect(results[0]!.confidence).toBe(1.0);
    });

    it('returns the first matching node when multiple nodes share the same name', async () => {
      const resolver = new EntityResolver(store);
      const results = await resolver.resolve(['AuthService']);
      expect(results).toHaveLength(1);
      expect(results[0]!.nodeId).toBe('class:AuthService');
    });
  });

  describe('Step 2: FusionLayer search', () => {
    it('resolves via FusionLayer when exact match fails and score > 0.5', async () => {
      const mockFusion = {
        search: vi.fn().mockReturnValue([
          {
            nodeId: 'class:AuthService',
            node: classNode,
            score: 0.8,
            signals: { keyword: 0.8, semantic: 0 },
          },
        ] satisfies FusionResult[]),
      } as unknown as FusionLayer;

      const resolver = new EntityResolver(store, mockFusion);
      const results = await resolver.resolve(['auth']);
      expect(results).toHaveLength(1);
      expect(results[0]!.method).toBe('fusion');
      expect(results[0]!.confidence).toBe(0.8);
      expect(results[0]!.nodeId).toBe('class:AuthService');
    });

    it('skips FusionLayer result when score <= 0.5', async () => {
      const mockFusion = {
        search: vi.fn().mockReturnValue([
          {
            nodeId: 'class:AuthService',
            node: classNode,
            score: 0.3,
            signals: { keyword: 0.3, semantic: 0 },
          },
        ] satisfies FusionResult[]),
      } as unknown as FusionLayer;

      // No file nodes match "auth" as a path substring either,
      // so we need a node whose path includes "auth"
      const resolver = new EntityResolver(store, mockFusion);
      const results = await resolver.resolve(['nonexistent-thing']);
      expect(results).toHaveLength(0);
    });

    it('calls FusionLayer with topK=5', async () => {
      const mockFusion = {
        search: vi.fn().mockReturnValue([]),
      } as unknown as FusionLayer;

      const resolver = new EntityResolver(store, mockFusion);
      await resolver.resolve(['something']);
      expect(mockFusion.search).toHaveBeenCalledWith('something', 5);
    });
  });

  describe('Step 3: path match', () => {
    it('resolves via path match when exact and fusion fail', async () => {
      const resolver = new EntityResolver(store);
      // "middleware" is not a node name (the name is "middleware.ts")
      // but the path src/auth/middleware.ts includes "middleware"
      const results = await resolver.resolve(['middleware']);
      // "middleware" matches exact name "middleware.ts"? No -- findNodes({name}) is exact.
      // So it falls through to path match.
      expect(results).toHaveLength(1);
      expect(results[0]!.method).toBe('path');
      expect(results[0]!.confidence).toBe(0.6);
      expect(results[0]!.nodeId).toBe('file:middleware.ts');
    });

    it('matches file paths by substring inclusion', async () => {
      const resolver = new EntityResolver(store);
      const results = await resolver.resolve(['src/auth']);
      expect(results).toHaveLength(1);
      expect(results[0]!.method).toBe('path');
      expect(results[0]!.nodeId).toBe('file:middleware.ts');
    });

    it('returns the first file node matching path', async () => {
      const resolver = new EntityResolver(store);
      const results = await resolver.resolve(['auth']);
      // "auth" substring matches paths:
      // - src/auth/middleware.ts (file:middleware.ts)
      // - src/services/auth-service.ts (file:auth-service.ts)
      // Should return the first match
      expect(results).toHaveLength(1);
      expect(results[0]!.method).toBe('path');
      expect(results[0]!.confidence).toBe(0.6);
    });
  });

  describe('unresolved entities', () => {
    it('does not include entities that match no cascade step', async () => {
      const resolver = new EntityResolver(store);
      const results = await resolver.resolve(['CompletelyUnknownThing']);
      expect(results).toHaveLength(0);
    });

    it('resolves some entities and skips unresolved ones', async () => {
      const resolver = new EntityResolver(store);
      const results = await resolver.resolve(['AuthService', 'UnknownEntity']);
      expect(results).toHaveLength(1);
      expect(results[0]!.raw).toBe('AuthService');
    });
  });

  describe('no FusionLayer provided', () => {
    it('skips Step 2 and goes directly to path match', async () => {
      const resolver = new EntityResolver(store);
      // "auth" has no exact name match, no FusionLayer, falls to path match
      const results = await resolver.resolve(['auth']);
      expect(results).toHaveLength(1);
      expect(results[0]!.method).toBe('path');
    });
  });

  describe('multiple entities', () => {
    it('resolves multiple entities in a single call', async () => {
      const resolver = new EntityResolver(store);
      const results = await resolver.resolve(['AuthService', 'hashPassword']);
      expect(results).toHaveLength(2);
      expect(results[0]!.raw).toBe('AuthService');
      expect(results[1]!.raw).toBe('hashPassword');
    });

    it('each entity resolved independently through the cascade', async () => {
      const mockFusion = {
        search: vi.fn().mockReturnValue([
          {
            nodeId: 'fn:hashPassword',
            node: fnNode,
            score: 0.75,
            signals: { keyword: 0.75, semantic: 0 },
          },
        ] satisfies FusionResult[]),
      } as unknown as FusionLayer;

      const resolver = new EntityResolver(store, mockFusion);
      // "AuthService" matches exact, "hash" matches via fusion
      const results = await resolver.resolve(['AuthService', 'hash']);
      expect(results).toHaveLength(2);
      expect(results[0]!.method).toBe('exact');
      expect(results[1]!.method).toBe('fusion');
    });
  });

  describe('ResolvedEntity shape', () => {
    it('includes raw, nodeId, node, confidence, and method', async () => {
      const resolver = new EntityResolver(store);
      const results = await resolver.resolve(['AuthService']);
      const entity = results[0]!;
      expect(entity).toHaveProperty('raw');
      expect(entity).toHaveProperty('nodeId');
      expect(entity).toHaveProperty('node');
      expect(entity).toHaveProperty('confidence');
      expect(entity).toHaveProperty('method');
      expect(entity.node.id).toBe(entity.nodeId);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty input', async () => {
      const resolver = new EntityResolver(store);
      const results = await resolver.resolve([]);
      expect(results).toEqual([]);
    });

    it('handles empty store gracefully', async () => {
      const emptyStore = new GraphStore();
      const resolver = new EntityResolver(emptyStore);
      const results = await resolver.resolve(['AuthService']);
      expect(results).toHaveLength(0);
    });
  });
});
```

2. Run test: `npx vitest run tests/nlq/EntityResolver.test.ts`
3. Observe failure: `EntityResolver` module not found (expected -- implementation does not exist yet)
4. Run: `harness validate`
5. Commit: `test(nlq): add EntityResolver test suite with 16 tests`

---

### Task 2: Implement EntityResolver

**Depends on:** Task 1
**Files:** `packages/graph/src/nlq/EntityResolver.ts`

1. Create implementation `packages/graph/src/nlq/EntityResolver.ts`:

```typescript
import type { GraphStore } from '../store/GraphStore.js';
import type { FusionLayer } from '../search/FusionLayer.js';
import type { ResolvedEntity } from './types.js';

/**
 * Resolves raw entity strings to graph nodes using a 3-step fuzzy cascade:
 *
 * 1. Exact name match via store.findNodes({ name })
 * 2. FusionLayer search (if provided), take top result if score > 0.5
 * 3. Path match on file nodes via path.includes(raw)
 *
 * Each step tags its match with method and confidence.
 * Unresolved entities are silently omitted from results.
 */
export class EntityResolver {
  private readonly store: GraphStore;
  private readonly fusion: FusionLayer | undefined;

  constructor(store: GraphStore, fusion?: FusionLayer) {
    this.store = store;
    this.fusion = fusion;
  }

  /**
   * Resolve an array of raw entity strings to graph nodes.
   *
   * @param raws - Raw entity strings from EntityExtractor
   * @returns Array of ResolvedEntity for each successfully resolved raw string
   */
  async resolve(raws: readonly string[]): Promise<readonly ResolvedEntity[]> {
    const results: ResolvedEntity[] = [];

    for (const raw of raws) {
      const resolved = this.resolveOne(raw);
      if (resolved !== undefined) {
        results.push(resolved);
      }
    }

    return results;
  }

  private resolveOne(raw: string): ResolvedEntity | undefined {
    // Step 1: Exact name match
    const exactMatches = this.store.findNodes({ name: raw });
    if (exactMatches.length > 0) {
      const node = exactMatches[0]!;
      return {
        raw,
        nodeId: node.id,
        node,
        confidence: 1.0,
        method: 'exact',
      };
    }

    // Step 2: FusionLayer search (if provided)
    if (this.fusion) {
      const fusionResults = this.fusion.search(raw, 5);
      if (fusionResults.length > 0 && fusionResults[0]!.score > 0.5) {
        const top = fusionResults[0]!;
        return {
          raw,
          nodeId: top.nodeId,
          node: top.node,
          confidence: top.score,
          method: 'fusion',
        };
      }
    }

    // Step 3: Path match on file nodes
    const fileNodes = this.store.findNodes({ type: 'file' });
    for (const node of fileNodes) {
      if (node.path && node.path.includes(raw)) {
        return {
          raw,
          nodeId: node.id,
          node,
          confidence: 0.6,
          method: 'path',
        };
      }
    }

    return undefined;
  }
}
```

2. Run test: `npx vitest run tests/nlq/EntityResolver.test.ts`
3. Observe: all tests pass
4. Run: `tsc --noEmit`
5. Run: `harness validate`
6. Commit: `feat(nlq): implement EntityResolver with 3-step fuzzy cascade`

---

### Task 3: Export EntityResolver and final verification

**Depends on:** Task 2
**Files:** `packages/graph/src/nlq/index.ts`

1. Modify `packages/graph/src/nlq/index.ts` to add EntityResolver export. Add this line after the EntityExtractor export:

```typescript
export { EntityResolver } from './EntityResolver.js';
```

The full exports section should read:

```typescript
export { INTENTS } from './types.js';
export type { Intent, ClassificationResult, ResolvedEntity, AskGraphResult } from './types.js';
export { IntentClassifier } from './IntentClassifier.js';
export { EntityExtractor } from './EntityExtractor.js';
export { EntityResolver } from './EntityResolver.js';
```

2. Run: `npx vitest run tests/nlq/` (verify all NLQ tests pass together)
3. Run: `tsc --noEmit`
4. Run: `harness validate`
5. Commit: `feat(nlq): export EntityResolver from nlq barrel`

[checkpoint:human-verify] -- Verify all NLQ tests pass together and the module is properly exported.
