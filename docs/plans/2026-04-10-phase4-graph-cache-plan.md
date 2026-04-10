# Plan: Phase 4 -- Graph Cache for MCP Response Compaction

**Date:** 2026-04-10
**Spec:** docs/changes/mcp-response-compaction/proposal.md (Section 4: Pre-computed Graph Nodes)
**Estimated tasks:** 7
**Estimated time:** 30 minutes

## Goal

When the `compact` tool receives an intent query, it checks the Knowledge Graph for a cached `PackedSummary` node (TTL 1 hour) and returns it on hit, skipping live aggregation. On miss, it writes the result as a new `PackedSummary` node for future cache hits. Source node modifications invalidate dependent cache entries.

## Observable Truths (Acceptance Criteria)

1. **[ADDED]** `packed_summary` exists in the `NODE_TYPES` array in `packages/graph/src/types.ts` and the `GraphNodeSchema` zod validator accepts it.
2. **[ADDED]** `caches` exists in the `EDGE_TYPES` array in `packages/graph/src/types.ts` and the `GraphEdgeSchema` zod validator accepts it.
3. **[ADDED]** When `compact(intent)` is called and no cached `PackedSummary` node exists, the system shall perform live aggregation, write a `PackedSummary` node to the graph with `caches` edges to each source node, and return the envelope with `cached: false`.
4. **[ADDED]** When `compact(intent)` is called and a valid cached `PackedSummary` node exists (created < 1 hour ago), the system shall return the cached envelope with `cached: true` and skip FusionLayer search and ContextQL expansion.
5. **[ADDED]** When `compact(intent)` is called and a stale cached `PackedSummary` node exists (created >= 1 hour ago), the system shall remove the stale node, perform live aggregation, and write a fresh cache node.
6. **[ADDED]** When source nodes referenced by a `PackedSummary` have `lastModified` timestamps newer than the cache node's creation time, the system shall treat the cache as stale and re-aggregate.
7. **[ADDED]** `npx vitest run packages/graph/tests/store/PackedSummaryCache.test.ts` passes with all tests green.
8. **[ADDED]** `npx vitest run packages/cli/tests/mcp/tools/compact.test.ts` passes with new cache-hit and cache-write tests green.
9. **[ADDED]** `harness validate` passes after all tasks are complete.

## File Map

```
CREATE  packages/graph/src/store/PackedSummaryCache.ts
CREATE  packages/graph/tests/store/PackedSummaryCache.test.ts
MODIFY  packages/graph/src/types.ts (add packed_summary node type, caches edge type)
MODIFY  packages/graph/src/index.ts (export PackedSummaryCache)
MODIFY  packages/cli/src/mcp/tools/compact.ts (replace TODO stubs with cache check + cache write)
MODIFY  packages/cli/tests/mcp/tools/compact.test.ts (add cache-hit and cache-write tests)
```

## Tasks

### Task 1: Add `packed_summary` node type and `caches` edge type to graph schema

**Depends on:** none
**Files:** `packages/graph/src/types.ts`

1. Open `packages/graph/src/types.ts`.
2. Add `'packed_summary'` to the `NODE_TYPES` array after the last entry (`'requirement'`):

   ```typescript
   // Traceability
   'requirement',
   // Cache
   'packed_summary',
   ```

3. Add `'caches'` to the `EDGE_TYPES` array after the last entry (`'tested_by'`):

   ```typescript
   'tested_by',
   // Cache relationships
   'caches',
   ```

4. Run: `npx vitest run packages/graph/tests/types/ --reporter=verbose` -- verify schema tests still pass (the zod schemas derive from the const arrays, so they auto-update).
5. Run: `harness validate`
6. Commit: `feat(graph): add packed_summary node type and caches edge type to schema`

---

### Task 2: Create PackedSummaryCache module with normalizeIntent and isStale (TDD)

**Depends on:** Task 1
**Files:** `packages/graph/src/store/PackedSummaryCache.ts`, `packages/graph/tests/store/PackedSummaryCache.test.ts`

1. Create test file `packages/graph/tests/store/PackedSummaryCache.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach } from 'vitest';
   import { GraphStore } from '../../src/store/GraphStore.js';
   import { normalizeIntent, PackedSummaryCache } from '../../src/store/PackedSummaryCache.js';
   import type { GraphNode } from '../../src/types.js';

   function makeNode(
     overrides: Partial<GraphNode> & { id: string; type: GraphNode['type']; name: string }
   ): GraphNode {
     return { metadata: {}, ...overrides };
   }

   describe('normalizeIntent', () => {
     it('lowercases and trims', () => {
       expect(normalizeIntent('  Understand Auth  ')).toBe('understand auth');
     });

     it('collapses multiple spaces', () => {
       expect(normalizeIntent('understand   the   auth   flow')).toBe('understand the auth flow');
     });

     it('produces deterministic node IDs', () => {
       const a = normalizeIntent('Understand Auth');
       const b = normalizeIntent('understand  auth');
       expect(a).toBe(b);
     });
   });

   describe('PackedSummaryCache', () => {
     let store: GraphStore;
     let cache: PackedSummaryCache;

     beforeEach(() => {
       store = new GraphStore();
       cache = new PackedSummaryCache(store);
     });

     describe('get', () => {
       it('returns null when no cache node exists', () => {
         expect(cache.get('anything')).toBeNull();
       });

       it('returns cached envelope when node exists and is fresh', () => {
         const intent = 'understand auth';
         const envelope = {
           meta: {
             strategy: ['structural'],
             originalTokenEstimate: 100,
             compactedTokenEstimate: 50,
             reductionPct: 50,
             cached: false,
           },
           sections: [{ source: 'file:auth.ts', content: 'compacted' }],
         };

         cache.set(intent, envelope, ['file:auth.ts']);

         const result = cache.get(intent);
         expect(result).not.toBeNull();
         expect(result!.meta.cached).toBe(true);
         expect(result!.sections).toEqual(envelope.sections);
       });

       it('returns null when cache node is expired (TTL exceeded)', () => {
         const intent = 'understand auth';
         const envelope = {
           meta: {
             strategy: ['structural'],
             originalTokenEstimate: 100,
             compactedTokenEstimate: 50,
             reductionPct: 50,
             cached: false,
           },
           sections: [{ source: 'file:auth.ts', content: 'compacted' }],
         };

         cache.set(intent, envelope, ['file:auth.ts']);

         // Manually backdate the node to simulate expiry
         const nodeId = `packed_summary:${normalizeIntent(intent)}`;
         store.addNode({
           id: nodeId,
           type: 'packed_summary',
           name: intent,
           metadata: {
             envelope: JSON.stringify(envelope),
             createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
           },
         });

         const result = cache.get(intent);
         expect(result).toBeNull();
       });

       it('returns null when source node was modified after cache creation', () => {
         // Add a source node with a recent lastModified
         store.addNode(
           makeNode({
             id: 'file:auth.ts',
             type: 'file',
             name: 'auth.ts',
             lastModified: new Date().toISOString(),
           })
         );

         const intent = 'understand auth';
         const envelope = {
           meta: {
             strategy: ['structural'],
             originalTokenEstimate: 100,
             compactedTokenEstimate: 50,
             reductionPct: 50,
             cached: false,
           },
           sections: [{ source: 'file:auth.ts', content: 'compacted' }],
         };

         // Backdate cache creation to before the source modification
         const nodeId = `packed_summary:${normalizeIntent(intent)}`;
         const pastTime = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
         store.addNode({
           id: nodeId,
           type: 'packed_summary',
           name: intent,
           metadata: {
             envelope: JSON.stringify(envelope),
             createdAt: pastTime,
           },
         });
         store.addEdge({ from: nodeId, to: 'file:auth.ts', type: 'caches' });

         const result = cache.get(intent);
         expect(result).toBeNull();
       });
     });

     describe('set', () => {
       it('creates a packed_summary node and caches edges', () => {
         const intent = 'understand auth';
         const envelope = {
           meta: {
             strategy: ['structural'],
             originalTokenEstimate: 100,
             compactedTokenEstimate: 50,
             reductionPct: 50,
             cached: false,
           },
           sections: [{ source: 'file:auth.ts', content: 'compacted' }],
         };

         cache.set(intent, envelope, ['file:auth.ts', 'file:user.ts']);

         const nodeId = `packed_summary:${normalizeIntent(intent)}`;
         const node = store.getNode(nodeId);
         expect(node).not.toBeNull();
         expect(node!.type).toBe('packed_summary');

         const edges = store.getEdges({ from: nodeId, type: 'caches' });
         expect(edges).toHaveLength(2);
         expect(edges.map((e) => e.to).sort()).toEqual(['file:auth.ts', 'file:user.ts']);
       });

       it('overwrites existing cache node on re-set', () => {
         const intent = 'understand auth';
         const envelope1 = {
           meta: {
             strategy: ['structural'],
             originalTokenEstimate: 100,
             compactedTokenEstimate: 50,
             reductionPct: 50,
             cached: false,
           },
           sections: [{ source: 'file:auth.ts', content: 'v1' }],
         };
         const envelope2 = {
           meta: {
             strategy: ['structural'],
             originalTokenEstimate: 200,
             compactedTokenEstimate: 80,
             reductionPct: 60,
             cached: false,
           },
           sections: [{ source: 'file:auth.ts', content: 'v2' }],
         };

         cache.set(intent, envelope1, ['file:auth.ts']);
         cache.set(intent, envelope2, ['file:auth.ts']);

         const result = cache.get(intent);
         expect(result).not.toBeNull();
         expect(result!.sections[0].content).toBe('v2');
       });
     });

     describe('invalidate', () => {
       it('removes cache node by intent', () => {
         const intent = 'understand auth';
         const envelope = {
           meta: {
             strategy: ['structural'],
             originalTokenEstimate: 100,
             compactedTokenEstimate: 50,
             reductionPct: 50,
             cached: false,
           },
           sections: [{ source: 'file:auth.ts', content: 'compacted' }],
         };

         cache.set(intent, envelope, ['file:auth.ts']);
         cache.invalidate(intent);

         expect(cache.get(intent)).toBeNull();
       });
     });
   });
   ```

2. Run test: `npx vitest run packages/graph/tests/store/PackedSummaryCache.test.ts` -- observe failure (module does not exist).

3. Create implementation `packages/graph/src/store/PackedSummaryCache.ts`:

   ```typescript
   import type { GraphStore } from './GraphStore.js';
   import type { PackedEnvelope } from './PackedSummaryCache.types.js';

   const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

   /**
    * Normalize an intent string for deterministic cache keying.
    * Lowercases, trims, and collapses multiple spaces.
    */
   export function normalizeIntent(intent: string): string {
     return intent.trim().toLowerCase().replace(/\s+/g, ' ');
   }

   function cacheNodeId(normalizedIntent: string): string {
     return `packed_summary:${normalizedIntent}`;
   }

   /**
    * PackedSummaryCache reads and writes PackedSummary nodes in the GraphStore.
    *
    * Cache validity is determined by:
    * 1. TTL: node must have been created within the last hour
    * 2. Source freshness: all source nodes linked via `caches` edges must have
    *    `lastModified` timestamps older than the cache creation time
    */
   export class PackedSummaryCache {
     constructor(
       private readonly store: GraphStore,
       private readonly ttlMs: number = DEFAULT_TTL_MS
     ) {}

     /**
      * Check cache for a packed summary matching the intent.
      * Returns the envelope with `cached: true` if valid, or null if miss/stale.
      */
     get(intent: string): PackedEnvelope | null {
       const normalized = normalizeIntent(intent);
       const nodeId = cacheNodeId(normalized);
       const node = this.store.getNode(nodeId);

       if (!node) return null;

       const createdAt = node.metadata['createdAt'] as string | undefined;
       if (!createdAt) return null;

       const createdMs = new Date(createdAt).getTime();

       // Check TTL
       if (Date.now() - createdMs > this.ttlMs) {
         return null;
       }

       // Check source freshness via caches edges
       const edges = this.store.getEdges({ from: nodeId, type: 'caches' as any });
       for (const edge of edges) {
         const sourceNode = this.store.getNode(edge.to);
         if (sourceNode?.lastModified) {
           const sourceModMs = new Date(sourceNode.lastModified).getTime();
           if (sourceModMs > createdMs) {
             return null; // source was modified after cache was created
           }
         }
       }

       // Parse and return envelope with cached: true
       try {
         const envelope = JSON.parse(node.metadata['envelope'] as string) as PackedEnvelope;
         return {
           ...envelope,
           meta: { ...envelope.meta, cached: true },
         };
       } catch {
         return null;
       }
     }

     /**
      * Write a PackedSummary node to the graph with caches edges to source nodes.
      */
     set(intent: string, envelope: PackedEnvelope, sourceNodeIds: string[]): void {
       const normalized = normalizeIntent(intent);
       const nodeId = cacheNodeId(normalized);

       // Remove existing node (and its edges) before writing fresh
       this.store.removeNode(nodeId);

       this.store.addNode({
         id: nodeId,
         type: 'packed_summary' as any,
         name: normalized,
         metadata: {
           envelope: JSON.stringify(envelope),
           createdAt: new Date().toISOString(),
         },
       });

       for (const sourceId of sourceNodeIds) {
         this.store.addEdge({
           from: nodeId,
           to: sourceId,
           type: 'caches' as any,
         });
       }
     }

     /**
      * Explicitly invalidate a cached packed summary.
      */
     invalidate(intent: string): void {
       const normalized = normalizeIntent(intent);
       const nodeId = cacheNodeId(normalized);
       this.store.removeNode(nodeId);
     }
   }
   ```

4. **Important note on type imports:** The `PackedEnvelope` type is defined in `@harness-engineering/core`. However, to avoid a circular dependency (graph should not depend on core), we inline a minimal type alias. Replace the import line with:

   ```typescript
   /** Minimal PackedEnvelope shape -- avoids circular dep on @harness-engineering/core */
   interface PackedEnvelope {
     meta: {
       strategy: string[];
       originalTokenEstimate: number;
       compactedTokenEstimate: number;
       reductionPct: number;
       cached: boolean;
     };
     sections: Array<{
       source: string;
       content: string;
     }>;
   }

   export type { PackedEnvelope as CacheableEnvelope };
   ```

   Update the test file import accordingly -- it does not need to import `PackedEnvelope` since the test objects are literal.

5. Run test: `npx vitest run packages/graph/tests/store/PackedSummaryCache.test.ts` -- observe: all tests pass.
6. Run: `harness validate`
7. Commit: `feat(graph): add PackedSummaryCache with TTL and source-freshness invalidation`

---

### Task 3: Export PackedSummaryCache from graph package index

**Depends on:** Task 2
**Files:** `packages/graph/src/index.ts`

1. Open `packages/graph/src/index.ts`.
2. Add the following export after the Store section (after line 29, `export { saveGraph, loadGraph } from './store/Serializer.js';`):

   ```typescript
   export { PackedSummaryCache, normalizeIntent } from './store/PackedSummaryCache.js';
   export type { CacheableEnvelope } from './store/PackedSummaryCache.js';
   ```

3. Run: `npx vitest run packages/graph/tests/ --reporter=verbose` -- verify no regressions.
4. Run: `harness validate`
5. Commit: `feat(graph): export PackedSummaryCache from package index`

---

### Task 4: Wire cache check into compact tool's intent mode (cache read)

**Depends on:** Task 3
**Files:** `packages/cli/src/mcp/tools/compact.ts`

1. Open `packages/cli/src/mcp/tools/compact.ts`.
2. Replace the TODO stub at lines 138-140:

   ```typescript
   // Phase 4 stub: check for cached PackedSummary node (always miss)
   // TODO(Phase 4): const cached = await checkPackedSummaryCache(projectPath, intent);
   // if (cached) return cached;
   ```

   With:

   ```typescript
   // Phase 4: check for cached PackedSummary node
   const { PackedSummaryCache } = await import('@harness-engineering/graph');
   const cacheInstance = new PackedSummaryCache(store);
   const cachedEnvelope = cacheInstance.get(intent);
   if (cachedEnvelope) {
     return {
       content: [
         { type: 'text' as const, text: serializeEnvelope(cachedEnvelope as PackedEnvelope) },
       ],
     };
   }
   ```

   **Important:** This requires moving the graph store load _before_ the cache check. Restructure `handleIntentMode` so the store is loaded first, then cache is checked, then fusion/CQL are used on miss. The full replacement for lines 131-228 of `handleIntentMode`:

   ```typescript
   /** Mode B: intent -- aggregate via graph then pack. */
   async function handleIntentMode(
     projectPath: string,
     intent: string,
     pipeline: CompactionPipeline,
     budget: number,
     filterContent?: string
   ): Promise<ToolResult> {
     const { loadGraphStore } = await import('../utils/graph-loader.js');
     const store = await loadGraphStore(projectPath);
     if (!store) {
       return {
         content: [
           {
             type: 'text' as const,
             text: 'No graph found. Run `harness scan` or use `ingest_source` tool first.',
           },
         ],
         isError: true,
       };
     }

     // Phase 4: check for cached PackedSummary node
     const { PackedSummaryCache } = await import('@harness-engineering/graph');
     const cache = new PackedSummaryCache(store);
     const cachedEnvelope = cache.get(intent);
     if (cachedEnvelope) {
       return {
         content: [
           { type: 'text' as const, text: serializeEnvelope(cachedEnvelope as PackedEnvelope) },
         ],
       };
     }

     const { FusionLayer, ContextQL } = await import('@harness-engineering/graph');
     const fusion = new FusionLayer(store);
     const cql = new ContextQL(store);

     // Search with intent (optionally scoped by content as filter)
     const searchQuery = filterContent ? `${intent} ${filterContent}` : intent;
     const searchResults = fusion.search(searchQuery, 10);

     if (searchResults.length === 0) {
       const envelope: PackedEnvelope = {
         meta: {
           strategy: pipeline.strategyNames,
           originalTokenEstimate: 0,
           compactedTokenEstimate: 0,
           reductionPct: 0,
           cached: false,
         },
         sections: [{ source: 'compact', content: 'No relevant context found for intent.' }],
       };
       return {
         content: [{ type: 'text' as const, text: serializeEnvelope(envelope) }],
       };
     }

     // Expand context around each result -- weight budget by relevance score
     const totalScore = searchResults.reduce((sum, r) => sum + r.score, 0);
     const sections: Array<{ source: string; content: string }> = [];
     const sourceNodeIds: string[] = [];
     let totalOriginalChars = 0;

     for (const result of searchResults) {
       const resultBudget =
         totalScore > 0
           ? Math.floor(budget * (result.score / totalScore))
           : Math.floor(budget / searchResults.length);
       const expanded = cql.execute({
         rootNodeIds: [result.nodeId],
         maxDepth: 2,
       });

       const rawContent = JSON.stringify({
         rootNode: result.nodeId,
         score: result.score,
         nodes: expanded.nodes,
         edges: expanded.edges,
       });

       totalOriginalChars += rawContent.length;
       const compacted = pipeline.apply(rawContent, resultBudget);
       sections.push({ source: result.nodeId, content: compacted });
       sourceNodeIds.push(result.nodeId);
     }

     const originalTokens = Math.ceil(totalOriginalChars / 4);
     const compactedTokens = sections.reduce((sum, s) => sum + estimateTokens(s.content), 0);
     const reductionPct =
       originalTokens > 0 ? Math.round((1 - compactedTokens / originalTokens) * 100) : 0;

     const envelope: PackedEnvelope = {
       meta: {
         strategy: pipeline.strategyNames,
         originalTokenEstimate: originalTokens,
         compactedTokenEstimate: compactedTokens,
         reductionPct,
         cached: false,
       },
       sections,
     };

     // Phase 4: write PackedSummary node to graph for future cache hits
     cache.set(intent, envelope, sourceNodeIds);

     return {
       content: [{ type: 'text' as const, text: serializeEnvelope(envelope) }],
     };
   }
   ```

3. Run: `npx vitest run packages/cli/tests/mcp/tools/compact.test.ts` -- verify existing tests still pass.
4. Run: `harness validate`
5. Commit: `feat(compact): wire PackedSummaryCache into intent mode for cache read and write`

---

### Task 5: Add cache-hit tests to compact tool test suite

**Depends on:** Task 4
**Files:** `packages/cli/tests/mcp/tools/compact.test.ts`

1. Open `packages/cli/tests/mcp/tools/compact.test.ts`.
2. Replace the existing `describe('cache stub (Phase 4 placeholder)')` block (lines 303-341) with:

   ```typescript
   describe('cache behavior (Phase 4)', () => {
     afterEach(() => {
       vi.restoreAllMocks();
     });

     it('returns cached envelope on cache hit with cached: true marker', async () => {
       // Set up a mock store that has a PackedSummary node
       const mockStore = {
         getNode: vi.fn().mockImplementation((id: string) => {
           if (id.startsWith('packed_summary:')) {
             return {
               id,
               type: 'packed_summary',
               name: 'understand auth',
               metadata: {
                 envelope: JSON.stringify({
                   meta: {
                     strategy: ['structural'],
                     originalTokenEstimate: 200,
                     compactedTokenEstimate: 80,
                     reductionPct: 60,
                     cached: false,
                   },
                   sections: [{ source: 'file:auth.ts', content: 'cached content' }],
                 }),
                 createdAt: new Date().toISOString(), // fresh
               },
             };
           }
           return null;
         }),
         getEdges: vi.fn().mockReturnValue([]),
         addNode: vi.fn(),
         addEdge: vi.fn(),
         removeNode: vi.fn(),
       };

       vi.doMock('../../../src/mcp/utils/graph-loader', () => ({
         loadGraphStore: vi.fn().mockResolvedValue(mockStore),
       }));
       vi.doMock('@harness-engineering/graph', () => ({
         PackedSummaryCache: (await import('@harness-engineering/graph')).PackedSummaryCache,
         FusionLayer: class {
           search() {
             return [];
           }
         },
         ContextQL: class {
           execute() {
             return { nodes: [], edges: [] };
           }
         },
       }));

       const { handleCompact: freshHandleCompact } = await import('../../../src/mcp/tools/compact');

       const result = await freshHandleCompact({
         path: '/tmp/test-project',
         intent: 'understand auth',
       });

       expect(result.isError).toBeUndefined();
       const text = result.content[0].text;
       expect(text).toContain('[cached]');
       expect(text).toContain('cached content');

       vi.doUnmock('@harness-engineering/graph');
       vi.doUnmock('../../../src/mcp/utils/graph-loader');
     });

     it('writes cache node on cache miss', async () => {
       const addNodeCalls: any[] = [];
       const addEdgeCalls: any[] = [];
       const mockStore = {
         getNode: vi.fn().mockReturnValue(null), // always miss
         getEdges: vi.fn().mockReturnValue([]),
         addNode: vi.fn().mockImplementation((n: any) => addNodeCalls.push(n)),
         addEdge: vi.fn().mockImplementation((e: any) => addEdgeCalls.push(e)),
         removeNode: vi.fn(),
       };

       vi.doMock('../../../src/mcp/utils/graph-loader', () => ({
         loadGraphStore: vi.fn().mockResolvedValue(mockStore),
       }));
       vi.doMock('@harness-engineering/graph', () => ({
         PackedSummaryCache: (await import('@harness-engineering/graph')).PackedSummaryCache,
         FusionLayer: class {
           search() {
             return [{ nodeId: 'file:auth.ts', score: 0.9 }];
           }
         },
         ContextQL: class {
           execute() {
             return {
               nodes: [{ id: 'file:auth.ts', type: 'file', content: 'auth code' }],
               edges: [],
             };
           }
         },
       }));

       const { handleCompact: freshHandleCompact } = await import('../../../src/mcp/tools/compact');

       const result = await freshHandleCompact({
         path: '/tmp/test-project',
         intent: 'understand auth',
       });

       expect(result.isError).toBeUndefined();
       const text = result.content[0].text;
       // Should NOT be cached (first call)
       expect(text).not.toContain('[cached]');
       // Should have written a packed_summary node
       const summaryNode = addNodeCalls.find((n: any) => n.type === 'packed_summary');
       expect(summaryNode).toBeDefined();
       // Should have written a caches edge
       const cachesEdge = addEdgeCalls.find((e: any) => e.type === 'caches');
       expect(cachesEdge).toBeDefined();
       expect(cachesEdge.to).toBe('file:auth.ts');

       vi.doUnmock('@harness-engineering/graph');
       vi.doUnmock('../../../src/mcp/utils/graph-loader');
     });

     it('intent mode returns cached: false when no cache exists', async () => {
       vi.doMock('../../../src/mcp/utils/graph-loader', () => ({
         loadGraphStore: vi.fn().mockResolvedValue({}),
       }));
       vi.doMock('@harness-engineering/graph', () => ({
         PackedSummaryCache: class {
           get() {
             return null;
           }
           set() {}
         },
         FusionLayer: class {
           search() {
             return [{ nodeId: 'src/test.ts', score: 0.8 }];
           }
         },
         ContextQL: class {
           execute() {
             return {
               nodes: [{ id: 'src/test.ts', type: 'file', content: 'test' }],
               edges: [],
             };
           }
         },
       }));

       const { handleCompact: freshHandleCompact } = await import('../../../src/mcp/tools/compact');

       const result = await freshHandleCompact({
         path: '/tmp/test-project',
         intent: 'anything',
       });

       expect(result.isError).toBeUndefined();
       const text = result.content[0].text;
       expect(text).toMatch(/<!-- packed:/);
       expect(text).not.toContain('[cached]');

       vi.doUnmock('@harness-engineering/graph');
       vi.doUnmock('../../../src/mcp/utils/graph-loader');
     });
   });
   ```

3. Run: `npx vitest run packages/cli/tests/mcp/tools/compact.test.ts` -- observe: all tests pass (including new cache tests).
4. Run: `harness validate`
5. Commit: `test(compact): add cache-hit and cache-write tests for Phase 4 graph cache`

---

### Task 6: Verify invalidation via source-node lastModified in PackedSummaryCache tests

**Depends on:** Task 2
**Files:** `packages/graph/tests/store/PackedSummaryCache.test.ts`

[checkpoint:human-verify] -- Verify that the invalidation tests from Task 2 pass correctly. This task adds edge-case coverage.

1. Open `packages/graph/tests/store/PackedSummaryCache.test.ts`.
2. Add the following tests inside the existing `describe('get')` block:

   ```typescript
   it('returns cached envelope when source nodes have no lastModified', () => {
     store.addNode(
       makeNode({
         id: 'file:auth.ts',
         type: 'file',
         name: 'auth.ts',
         // no lastModified
       })
     );

     const intent = 'understand auth';
     const envelope = {
       meta: {
         strategy: ['structural'],
         originalTokenEstimate: 100,
         compactedTokenEstimate: 50,
         reductionPct: 50,
         cached: false,
       },
       sections: [{ source: 'file:auth.ts', content: 'compacted' }],
     };

     cache.set(intent, envelope, ['file:auth.ts']);

     const result = cache.get(intent);
     expect(result).not.toBeNull();
     expect(result!.meta.cached).toBe(true);
   });

   it('returns cached envelope when source node lastModified is before cache creation', () => {
     const pastTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
     store.addNode(
       makeNode({
         id: 'file:auth.ts',
         type: 'file',
         name: 'auth.ts',
         lastModified: pastTime,
       })
     );

     const intent = 'understand auth';
     const envelope = {
       meta: {
         strategy: ['structural'],
         originalTokenEstimate: 100,
         compactedTokenEstimate: 50,
         reductionPct: 50,
         cached: false,
       },
       sections: [{ source: 'file:auth.ts', content: 'compacted' }],
     };

     cache.set(intent, envelope, ['file:auth.ts']);

     const result = cache.get(intent);
     expect(result).not.toBeNull();
     expect(result!.meta.cached).toBe(true);
   });

   it('returns null when any one of multiple source nodes is modified', () => {
     // One source old, one source fresh
     store.addNode(
       makeNode({
         id: 'file:auth.ts',
         type: 'file',
         name: 'auth.ts',
         lastModified: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
       })
     );
     store.addNode(
       makeNode({
         id: 'file:user.ts',
         type: 'file',
         name: 'user.ts',
         lastModified: new Date().toISOString(), // just now
       })
     );

     const intent = 'understand auth and users';
     const envelope = {
       meta: {
         strategy: ['structural'],
         originalTokenEstimate: 200,
         compactedTokenEstimate: 80,
         reductionPct: 60,
         cached: false,
       },
       sections: [
         { source: 'file:auth.ts', content: 'auth' },
         { source: 'file:user.ts', content: 'user' },
       ],
     };

     // Backdate cache
     const nodeId = `packed_summary:${normalizeIntent(intent)}`;
     store.addNode({
       id: nodeId,
       type: 'packed_summary' as any,
       name: normalizeIntent(intent),
       metadata: {
         envelope: JSON.stringify(envelope),
         createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
       },
     });
     store.addEdge({ from: nodeId, to: 'file:auth.ts', type: 'caches' as any });
     store.addEdge({ from: nodeId, to: 'file:user.ts', type: 'caches' as any });

     const result = cache.get(intent);
     expect(result).toBeNull();
   });
   ```

3. Run: `npx vitest run packages/graph/tests/store/PackedSummaryCache.test.ts` -- observe: all tests pass.
4. Run: `harness validate`
5. Commit: `test(graph): add source-freshness edge-case coverage for PackedSummaryCache`

---

### Task 7: Run full test suites and verify no regressions

**Depends on:** Tasks 1-6
**Files:** none (verification only)

[checkpoint:human-verify] -- Final integration check before marking Phase 4 complete.

1. Run: `npx vitest run packages/graph/tests/ --reporter=verbose` -- verify all graph tests pass, including new PackedSummaryCache tests.
2. Run: `npx vitest run packages/cli/tests/mcp/tools/compact.test.ts --reporter=verbose` -- verify all compact tool tests pass, including new cache tests.
3. Run: `npx vitest run packages/core/tests/ --reporter=verbose` -- verify no regressions in core compaction tests.
4. Run: `harness validate`
5. Run: `harness check-deps`
6. Verify observable truths:
   - `packed_summary` is in `NODE_TYPES` (Truth 1)
   - `caches` is in `EDGE_TYPES` (Truth 2)
   - Cache write test confirms node creation on miss (Truth 3)
   - Cache hit test confirms `[cached]` marker in output (Truth 4)
   - TTL expiry test confirms stale eviction (Truth 5)
   - Source freshness test confirms invalidation (Truth 6)
   - All PackedSummaryCache tests pass (Truth 7)
   - All compact tool tests pass (Truth 8)
   - `harness validate` passes (Truth 9)
7. Commit: no commit needed (verification only).
