# Plan: Graph Foundation (Phase 1 of 10)

**Date:** 2026-03-18
**Spec:** .harness/architecture/graph-context-system/ADR-001.md
**Estimated tasks:** 18
**Estimated time:** 60-90 minutes

## Goal

Build `packages/graph` with a LokiJS-backed graph store, ContextQL query engine, HNSWLib vector store with pure-TS fallback, and tree-sitter code ingestor — the foundation that all subsequent phases depend on.

## Observable Truths (Acceptance Criteria)

1. When `import { GraphStore } from '@harness-engineering/graph'` is used, the system shall provide CRUD operations for nodes and edges with LokiJS persistence to a JSON file.
2. When `GraphStore.save()` is called, the system shall persist the graph to disk. When `GraphStore.load()` is called, the system shall restore it. Round-trip preserves all nodes and edges.
3. When `ContextQL.execute()` is called with root node IDs and depth/type/edge filters, the system shall return a subgraph via BFS traversal containing only matching nodes and edges.
4. When a structural ContextQL query is executed, the system shall automatically exclude observability node types (`span`, `metric`, `log`) unless explicitly requested.
5. When `VectorStore.search()` is called with an embedding vector, the system shall return the top-N most similar nodes by cosine similarity.
6. Where HNSWLib native binary is unavailable, the system shall fall back to brute-force cosine similarity in pure TypeScript without errors.
7. When `CodeIngestor.ingest()` is called with a directory path, the system shall parse TypeScript files via tree-sitter (or regex fallback) and produce `file`, `function`, `class`, `method`, `interface`, and `variable` nodes with `contains`, `imports`, and `calls` edges.
8. When `TopologicalLinker.link()` is called after code ingestion, the system shall resolve cross-module import references and detect circular dependencies.
9. `pnpm build` succeeds for `packages/graph` with CJS, ESM, and type declarations.
10. `pnpm test --filter @harness-engineering/graph` passes with 80%+ coverage.
11. The root `tsconfig.json` references `packages/graph`.
12. `pnpm-workspace.yaml` includes `packages/graph` (already included via `packages/*` glob).

## File Map

```
CREATE packages/graph/package.json
CREATE packages/graph/tsconfig.json
CREATE packages/graph/tsconfig.build.json
CREATE packages/graph/vitest.config.mts
CREATE packages/graph/tests/setup.ts
CREATE packages/graph/src/index.ts
CREATE packages/graph/src/types.ts
CREATE packages/graph/src/store/GraphStore.ts
CREATE packages/graph/src/store/VectorStore.ts
CREATE packages/graph/src/store/Serializer.ts
CREATE packages/graph/src/query/ContextQL.ts
CREATE packages/graph/src/query/Projection.ts
CREATE packages/graph/src/ingest/CodeIngestor.ts
CREATE packages/graph/src/ingest/TopologicalLinker.ts
CREATE packages/graph/tests/store/GraphStore.test.ts
CREATE packages/graph/tests/store/VectorStore.test.ts
CREATE packages/graph/tests/query/ContextQL.test.ts
CREATE packages/graph/tests/query/Projection.test.ts
CREATE packages/graph/tests/ingest/CodeIngestor.test.ts
CREATE packages/graph/tests/ingest/TopologicalLinker.test.ts
CREATE packages/graph/tests/integration/scan-and-query.test.ts
CREATE packages/graph/__fixtures__/sample-project/src/index.ts
CREATE packages/graph/__fixtures__/sample-project/src/types.ts
CREATE packages/graph/__fixtures__/sample-project/src/services/user-service.ts
CREATE packages/graph/__fixtures__/sample-project/src/services/auth-service.ts
CREATE packages/graph/__fixtures__/sample-project/src/utils/hash.ts
CREATE packages/graph/__fixtures__/sample-project/package.json
MODIFY tsconfig.json (add graph reference)
MODIFY pnpm-lock.yaml (automatic via pnpm install)
```

## Tasks

### Task 1: Scaffold packages/graph package

**Depends on:** none
**Files:** packages/graph/package.json, packages/graph/tsconfig.json, packages/graph/tsconfig.build.json, packages/graph/vitest.config.mts, packages/graph/tests/setup.ts, packages/graph/src/index.ts

1. Create `packages/graph/package.json`:

   ```json
   {
     "name": "@harness-engineering/graph",
     "version": "0.1.0",
     "description": "Knowledge graph for context assembly in Harness Engineering",
     "main": "./dist/index.js",
     "module": "./dist/index.mjs",
     "types": "./dist/index.d.ts",
     "files": ["dist", "README.md"],
     "exports": {
       ".": {
         "types": "./dist/index.d.ts",
         "import": "./dist/index.mjs",
         "require": "./dist/index.js"
       }
     },
     "scripts": {
       "build": "tsup src/index.ts --format cjs,esm --dts --tsconfig tsconfig.build.json",
       "dev": "tsup src/index.ts --format cjs,esm --dts --watch",
       "lint": "eslint src",
       "typecheck": "tsc --noEmit",
       "clean": "rm -rf dist",
       "test": "vitest run",
       "test:watch": "vitest",
       "test:coverage": "vitest run --coverage"
     },
     "dependencies": {
       "@harness-engineering/types": "workspace:*",
       "lokijs": "^1.5.12",
       "zod": "^3.24.1"
     },
     "optionalDependencies": {
       "hnswlib-node": "^3.0.0",
       "tree-sitter": "^0.22.4",
       "tree-sitter-typescript": "^0.23.2"
     },
     "devDependencies": {
       "@vitest/coverage-v8": "^4.0.18",
       "tsup": "^8.0.0",
       "typescript": "^5.9.3",
       "vitest": "^4.0.18"
     }
   }
   ```

2. Create `packages/graph/tsconfig.json`:

   ```json
   {
     "extends": "../../tsconfig.base.json",
     "compilerOptions": {
       "outDir": "./dist",
       "rootDir": "./src",
       "composite": true,
       "tsBuildInfoFile": "./dist/.tsbuildinfo"
     },
     "references": [{ "path": "../types" }],
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist", "tests"]
   }
   ```

3. Create `packages/graph/tsconfig.build.json`:

   ```json
   {
     "extends": "../../tsconfig.base.json",
     "compilerOptions": {
       "outDir": "./dist",
       "rootDir": "./src",
       "composite": false,
       "incremental": false
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist", "tests"]
   }
   ```

4. Create `packages/graph/vitest.config.mts`:

   ```typescript
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
     test: {
       globals: true,
       environment: 'node',
       setupFiles: ['./tests/setup.ts'],
       coverage: {
         provider: 'v8',
         reporter: ['text', 'json', 'html'],
         exclude: ['node_modules/', 'tests/', '**/*.test.ts', 'src/index.ts'],
         thresholds: {
           lines: 80,
           functions: 80,
           branches: 80,
           statements: 80,
         },
       },
     },
   });
   ```

5. Create `packages/graph/tests/setup.ts`:

   ```typescript
   import { beforeEach, afterEach } from 'vitest';
   ```

6. Create `packages/graph/src/index.ts`:

   ```typescript
   // Types
   export type {
     GraphNode,
     GraphEdge,
     NodeType,
     EdgeType,
     SourceLocation,
     ContextQLParams,
     ContextQLResult,
     ProjectionSpec,
     IngestResult,
   } from './types.js';

   // Store
   export { GraphStore } from './store/GraphStore.js';
   export { VectorStore } from './store/VectorStore.js';

   // Query
   export { ContextQL } from './query/ContextQL.js';
   export { project } from './query/Projection.js';

   // Ingest
   export { CodeIngestor } from './ingest/CodeIngestor.js';
   export { TopologicalLinker } from './ingest/TopologicalLinker.js';

   export const VERSION = '0.1.0';
   ```

7. Add graph reference to root `tsconfig.json`:
   Add `{ "path": "./packages/graph" }` to the references array.

8. Run: `cd /Users/cwarner/Projects/harness-engineering && pnpm install`
9. Verify: `ls packages/graph/package.json` exists
10. Commit: `feat(graph): scaffold packages/graph package`

---

### Task 2: Define graph type system

**Depends on:** Task 1
**Files:** packages/graph/src/types.ts

1. Create `packages/graph/src/types.ts`:

   ```typescript
   import { z } from 'zod';

   // --- Node Types ---

   export const NODE_TYPES = [
     // Code
     'repository',
     'module',
     'file',
     'class',
     'interface',
     'function',
     'method',
     'variable',
     // Knowledge
     'adr',
     'decision',
     'learning',
     'failure',
     'issue',
     'document',
     'skill',
     'conversation',
     // VCS
     'commit',
     'build',
     'test_result',
     // Observability (future)
     'span',
     'metric',
     'log',
     // Structural
     'layer',
     'pattern',
     'constraint',
     'violation',
   ] as const;

   export type NodeType = (typeof NODE_TYPES)[number];

   // --- Edge Types ---

   export const EDGE_TYPES = [
     // Code relationships
     'contains',
     'imports',
     'calls',
     'implements',
     'inherits',
     'references',
     // Knowledge relationships
     'applies_to',
     'caused_by',
     'resolved_by',
     'documents',
     'violates',
     'specifies',
     'decided',
     // VCS relationships
     'co_changes_with',
     'triggered_by',
     'failed_in',
     // Execution relationships (future)
     'executed_by',
     'measured_by',
   ] as const;

   export type EdgeType = (typeof EDGE_TYPES)[number];

   // --- Observability types (for noise pruning) ---

   export const OBSERVABILITY_TYPES: ReadonlySet<NodeType> = new Set(['span', 'metric', 'log']);

   // --- Source Location ---

   export interface SourceLocation {
     readonly fileId: string;
     readonly startLine: number;
     readonly endLine: number;
     readonly startColumn?: number;
     readonly endColumn?: number;
   }

   // --- Graph Node ---

   export interface GraphNode {
     readonly id: string;
     readonly type: NodeType;
     readonly name: string;
     readonly path?: string;
     readonly location?: SourceLocation;
     readonly content?: string;
     readonly hash?: string;
     readonly metadata: Record<string, unknown>;
     readonly embedding?: readonly number[];
     readonly lastModified?: string; // ISO timestamp
   }

   // --- Graph Edge ---

   export interface GraphEdge {
     readonly from: string;
     readonly to: string;
     readonly type: EdgeType;
     readonly confidence?: number; // 0-1, for Fusion Layer edges
     readonly metadata?: Record<string, unknown>;
   }

   // --- ContextQL ---

   export interface ContextQLParams {
     readonly rootNodeIds: readonly string[];
     readonly maxDepth?: number; // default 3
     readonly includeTypes?: readonly NodeType[];
     readonly excludeTypes?: readonly NodeType[];
     readonly includeEdges?: readonly EdgeType[];
     readonly bidirectional?: boolean; // default false
     readonly pruneObservability?: boolean; // default true
   }

   export interface ContextQLResult {
     readonly nodes: readonly GraphNode[];
     readonly edges: readonly GraphEdge[];
     readonly stats: {
       readonly totalTraversed: number;
       readonly totalReturned: number;
       readonly pruned: number;
       readonly depthReached: number;
     };
   }

   // --- Projection ---

   export interface ProjectionSpec {
     readonly fields: readonly (keyof GraphNode)[];
   }

   // --- Ingest ---

   export interface IngestResult {
     readonly nodesAdded: number;
     readonly nodesUpdated: number;
     readonly edgesAdded: number;
     readonly edgesUpdated: number;
     readonly errors: readonly string[];
     readonly durationMs: number;
   }

   // --- Graph Metadata (persisted alongside graph) ---

   export interface GraphMetadata {
     readonly schemaVersion: number;
     readonly lastScanTimestamp: string;
     readonly nodeCount: number;
     readonly edgeCount: number;
   }

   export const CURRENT_SCHEMA_VERSION = 1;

   // --- Zod Schemas (for validation) ---

   export const GraphNodeSchema = z.object({
     id: z.string(),
     type: z.enum(NODE_TYPES),
     name: z.string(),
     path: z.string().optional(),
     location: z
       .object({
         fileId: z.string(),
         startLine: z.number(),
         endLine: z.number(),
         startColumn: z.number().optional(),
         endColumn: z.number().optional(),
       })
       .optional(),
     content: z.string().optional(),
     hash: z.string().optional(),
     metadata: z.record(z.unknown()),
     embedding: z.array(z.number()).optional(),
     lastModified: z.string().optional(),
   });

   export const GraphEdgeSchema = z.object({
     from: z.string(),
     to: z.string(),
     type: z.enum(EDGE_TYPES),
     confidence: z.number().min(0).max(1).optional(),
     metadata: z.record(z.unknown()).optional(),
   });
   ```

2. Verify: `cd packages/graph && npx tsc --noEmit` (should pass with no errors)
3. Commit: `feat(graph): define node, edge, and query type system`

---

### Task 3: Implement GraphStore — node CRUD (TDD)

**Depends on:** Task 2
**Files:** packages/graph/src/store/GraphStore.ts, packages/graph/tests/store/GraphStore.test.ts

1. Create `packages/graph/tests/store/GraphStore.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach } from 'vitest';
   import { GraphStore } from '../../src/store/GraphStore.js';
   import type { GraphNode, GraphEdge } from '../../src/types.js';

   describe('GraphStore', () => {
     let store: GraphStore;

     beforeEach(() => {
       store = new GraphStore();
     });

     describe('nodes', () => {
       const node: GraphNode = {
         id: 'file:src/index.ts',
         type: 'file',
         name: 'index.ts',
         path: 'src/index.ts',
         metadata: { language: 'typescript' },
       };

       it('adds and retrieves a node by ID', () => {
         store.addNode(node);
         expect(store.getNode('file:src/index.ts')).toEqual(node);
       });

       it('returns undefined for missing node', () => {
         expect(store.getNode('nonexistent')).toBeUndefined();
       });

       it('upserts existing node', () => {
         store.addNode(node);
         const updated = { ...node, name: 'updated.ts' };
         store.addNode(updated);
         expect(store.getNode(node.id)?.name).toBe('updated.ts');
         expect(store.nodeCount).toBe(1);
       });

       it('batch adds nodes', () => {
         const nodes: GraphNode[] = [
           { id: 'file:a.ts', type: 'file', name: 'a.ts', metadata: {} },
           { id: 'file:b.ts', type: 'file', name: 'b.ts', metadata: {} },
           { id: 'file:c.ts', type: 'file', name: 'c.ts', metadata: {} },
         ];
         store.batchAddNodes(nodes);
         expect(store.nodeCount).toBe(3);
       });

       it('finds nodes by type', () => {
         store.addNode(node);
         store.addNode({ id: 'fn:hello', type: 'function', name: 'hello', metadata: {} });
         const files = store.findNodes({ type: 'file' });
         expect(files).toHaveLength(1);
         expect(files[0]!.id).toBe('file:src/index.ts');
       });

       it('removes a node', () => {
         store.addNode(node);
         store.removeNode(node.id);
         expect(store.getNode(node.id)).toBeUndefined();
         expect(store.nodeCount).toBe(0);
       });
     });

     describe('edges', () => {
       const edge: GraphEdge = {
         from: 'file:a.ts',
         to: 'file:b.ts',
         type: 'imports',
       };

       it('adds and retrieves edges', () => {
         store.addEdge(edge);
         const edges = store.getEdges({ from: 'file:a.ts' });
         expect(edges).toHaveLength(1);
         expect(edges[0]).toEqual(edge);
       });

       it('finds edges by type', () => {
         store.addEdge(edge);
         store.addEdge({ from: 'file:a.ts', to: 'fn:hello', type: 'contains' });
         const imports = store.getEdges({ from: 'file:a.ts', type: 'imports' });
         expect(imports).toHaveLength(1);
       });

       it('gets outbound neighbors', () => {
         store.addNode({ id: 'file:a.ts', type: 'file', name: 'a', metadata: {} });
         store.addNode({ id: 'file:b.ts', type: 'file', name: 'b', metadata: {} });
         store.addEdge(edge);
         const neighbors = store.getNeighbors('file:a.ts', 'outbound');
         expect(neighbors).toHaveLength(1);
         expect(neighbors[0]!.id).toBe('file:b.ts');
       });

       it('gets inbound neighbors', () => {
         store.addNode({ id: 'file:a.ts', type: 'file', name: 'a', metadata: {} });
         store.addNode({ id: 'file:b.ts', type: 'file', name: 'b', metadata: {} });
         store.addEdge(edge);
         const neighbors = store.getNeighbors('file:b.ts', 'inbound');
         expect(neighbors).toHaveLength(1);
         expect(neighbors[0]!.id).toBe('file:a.ts');
       });

       it('removes edges when node is removed', () => {
         store.addEdge(edge);
         store.removeNode('file:a.ts');
         expect(store.getEdges({ from: 'file:a.ts' })).toHaveLength(0);
       });
     });

     describe('stats', () => {
       it('reports counts', () => {
         store.addNode({ id: 'a', type: 'file', name: 'a', metadata: {} });
         store.addNode({ id: 'b', type: 'file', name: 'b', metadata: {} });
         store.addEdge({ from: 'a', to: 'b', type: 'imports' });
         expect(store.nodeCount).toBe(2);
         expect(store.edgeCount).toBe(1);
       });

       it('clears all data', () => {
         store.addNode({ id: 'a', type: 'file', name: 'a', metadata: {} });
         store.addEdge({ from: 'a', to: 'b', type: 'imports' });
         store.clear();
         expect(store.nodeCount).toBe(0);
         expect(store.edgeCount).toBe(0);
       });
     });
   });
   ```

2. Run test: `cd packages/graph && npx vitest run tests/store/GraphStore.test.ts` — observe failure (module not found)

3. Create `packages/graph/src/store/GraphStore.ts`:

   ```typescript
   import loki from 'lokijs';
   import type { GraphNode, GraphEdge, NodeType, EdgeType } from '../types.js';

   export interface NodeQuery {
     readonly type?: NodeType;
     readonly name?: string;
     readonly path?: string;
   }

   export interface EdgeQuery {
     readonly from?: string;
     readonly to?: string;
     readonly type?: EdgeType;
   }

   export class GraphStore {
     private readonly db: loki;
     private readonly nodesCol: Collection<GraphNode>;
     private readonly edgesCol: Collection<GraphEdge>;

     constructor() {
       this.db = new loki('graph.db');
       this.nodesCol = this.db.addCollection<GraphNode>('nodes', {
         unique: ['id'],
         indices: ['type', 'name', 'path'],
       });
       this.edgesCol = this.db.addCollection<GraphEdge>('edges', {
         indices: ['from', 'to', 'type'],
       });
     }

     // --- Node Operations ---

     addNode(node: GraphNode): void {
       const existing = this.nodesCol.findOne({ id: node.id });
       if (existing) {
         Object.assign(existing, node);
         this.nodesCol.update(existing);
       } else {
         this.nodesCol.insert({ ...node });
       }
     }

     batchAddNodes(nodes: readonly GraphNode[]): void {
       for (const node of nodes) {
         this.addNode(node);
       }
     }

     getNode(id: string): GraphNode | undefined {
       const result = this.nodesCol.findOne({ id });
       return result ? this.stripLokiMeta(result) : undefined;
     }

     findNodes(query: NodeQuery): GraphNode[] {
       const lokiQuery: Record<string, unknown> = {};
       if (query.type) lokiQuery['type'] = query.type;
       if (query.name) lokiQuery['name'] = query.name;
       if (query.path) lokiQuery['path'] = query.path;
       return this.nodesCol.find(lokiQuery).map((n) => this.stripLokiMeta(n));
     }

     removeNode(id: string): void {
       const node = this.nodesCol.findOne({ id });
       if (node) {
         this.nodesCol.remove(node);
       }
       // Remove all edges referencing this node
       this.edgesCol.findAndRemove({ from: id });
       this.edgesCol.findAndRemove({ to: id });
     }

     // --- Edge Operations ---

     addEdge(edge: GraphEdge): void {
       this.edgesCol.insert({ ...edge });
     }

     batchAddEdges(edges: readonly GraphEdge[]): void {
       for (const edge of edges) {
         this.addEdge(edge);
       }
     }

     getEdges(query: EdgeQuery): GraphEdge[] {
       const lokiQuery: Record<string, unknown> = {};
       if (query.from) lokiQuery['from'] = query.from;
       if (query.to) lokiQuery['to'] = query.to;
       if (query.type) lokiQuery['type'] = query.type;
       return this.edgesCol.find(lokiQuery).map((e) => this.stripLokiMeta(e));
     }

     getNeighbors(
       nodeId: string,
       direction: 'outbound' | 'inbound' | 'both' = 'outbound'
     ): GraphNode[] {
       const neighborIds = new Set<string>();

       if (direction === 'outbound' || direction === 'both') {
         for (const edge of this.edgesCol.find({ from: nodeId })) {
           neighborIds.add(edge.to);
         }
       }

       if (direction === 'inbound' || direction === 'both') {
         for (const edge of this.edgesCol.find({ to: nodeId })) {
           neighborIds.add(edge.from);
         }
       }

       return [...neighborIds]
         .map((id) => this.getNode(id))
         .filter((n): n is GraphNode => n !== undefined);
     }

     // --- Stats ---

     get nodeCount(): number {
       return this.nodesCol.count();
     }

     get edgeCount(): number {
       return this.edgesCol.count();
     }

     clear(): void {
       this.nodesCol.clear();
       this.edgesCol.clear();
     }

     // --- Internal ---

     private stripLokiMeta<T extends Record<string, unknown>>(obj: T): T {
       const { $loki, meta, ...rest } = obj as Record<string, unknown>;
       return rest as T;
     }
   }
   ```

4. Run test: `cd packages/graph && npx vitest run tests/store/GraphStore.test.ts` — all tests pass
5. Commit: `feat(graph): implement GraphStore with LokiJS-backed node/edge CRUD`

---

### Task 4: Implement GraphStore — persistence (TDD)

**Depends on:** Task 3
**Files:** packages/graph/src/store/Serializer.ts, packages/graph/src/store/GraphStore.ts (modify), packages/graph/tests/store/GraphStore.test.ts (modify)

1. Add persistence tests to `packages/graph/tests/store/GraphStore.test.ts`:

   ```typescript
   describe('persistence', () => {
     it('saves and loads graph to/from file', async () => {
       const tmpDir = path.join(os.tmpdir(), `graph-test-${Date.now()}`);
       fs.mkdirSync(tmpDir, { recursive: true });
       try {
         store.addNode({ id: 'a', type: 'file', name: 'a.ts', metadata: {} });
         store.addNode({ id: 'b', type: 'function', name: 'hello', metadata: {} });
         store.addEdge({ from: 'a', to: 'b', type: 'contains' });
         await store.save(tmpDir);

         const loaded = new GraphStore();
         await loaded.load(tmpDir);
         expect(loaded.nodeCount).toBe(2);
         expect(loaded.edgeCount).toBe(1);
         expect(loaded.getNode('a')?.name).toBe('a.ts');
         expect(loaded.getNode('b')?.type).toBe('function');
       } finally {
         fs.rmSync(tmpDir, { recursive: true, force: true });
       }
     });

     it('rebuilds if schema version mismatches', async () => {
       const tmpDir = path.join(os.tmpdir(), `graph-test-${Date.now()}`);
       fs.mkdirSync(tmpDir, { recursive: true });
       try {
         // Write a fake metadata with wrong schema version
         fs.writeFileSync(
           path.join(tmpDir, 'metadata.json'),
           JSON.stringify({ schemaVersion: 999, lastScanTimestamp: '', nodeCount: 0, edgeCount: 0 })
         );
         const loaded = new GraphStore();
         await loaded.load(tmpDir);
         // Should start empty (discarded incompatible data)
         expect(loaded.nodeCount).toBe(0);
       } finally {
         fs.rmSync(tmpDir, { recursive: true, force: true });
       }
     });
   });
   ```

   Add imports at top:

   ```typescript
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   ```

2. Run test — observe failure (save/load not implemented)

3. Create `packages/graph/src/store/Serializer.ts`:

   ```typescript
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import type { GraphNode, GraphEdge, GraphMetadata } from '../types.js';
   import { CURRENT_SCHEMA_VERSION } from '../types.js';

   export interface SerializedGraph {
     readonly nodes: readonly GraphNode[];
     readonly edges: readonly GraphEdge[];
   }

   export function saveGraph(
     dirPath: string,
     nodes: readonly GraphNode[],
     edges: readonly GraphEdge[]
   ): void {
     fs.mkdirSync(dirPath, { recursive: true });
     const data: SerializedGraph = { nodes, edges };
     fs.writeFileSync(path.join(dirPath, 'graph.json'), JSON.stringify(data));

     const metadata: GraphMetadata = {
       schemaVersion: CURRENT_SCHEMA_VERSION,
       lastScanTimestamp: new Date().toISOString(),
       nodeCount: nodes.length,
       edgeCount: edges.length,
     };
     fs.writeFileSync(path.join(dirPath, 'metadata.json'), JSON.stringify(metadata));
   }

   export function loadGraph(dirPath: string): SerializedGraph | null {
     const metaPath = path.join(dirPath, 'metadata.json');
     const graphPath = path.join(dirPath, 'graph.json');

     if (!fs.existsSync(metaPath) || !fs.existsSync(graphPath)) {
       return null;
     }

     const metadata: GraphMetadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
     if (metadata.schemaVersion !== CURRENT_SCHEMA_VERSION) {
       return null; // Schema mismatch — caller should rebuild
     }

     return JSON.parse(fs.readFileSync(graphPath, 'utf-8')) as SerializedGraph;
   }
   ```

4. Add `save` and `load` methods to `GraphStore`:

   ```typescript
   async save(dirPath: string): Promise<void> {
     const nodes = this.nodesCol.find().map((n) => this.stripLokiMeta(n));
     const edges = this.edgesCol.find().map((e) => this.stripLokiMeta(e));
     saveGraph(dirPath, nodes, edges);
   }

   async load(dirPath: string): Promise<boolean> {
     const data = loadGraph(dirPath);
     if (!data) {
       return false; // No valid graph found
     }
     this.clear();
     this.batchAddNodes(data.nodes);
     this.batchAddEdges(data.edges);
     return true;
   }
   ```

   Add import: `import { saveGraph, loadGraph } from './Serializer.js';`

5. Run test — observe: pass
6. Commit: `feat(graph): add JSON persistence with schema version check`

---

### Task 5: Implement VectorStore (TDD)

**Depends on:** Task 2
**Files:** packages/graph/src/store/VectorStore.ts, packages/graph/tests/store/VectorStore.test.ts

1. Create `packages/graph/tests/store/VectorStore.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach } from 'vitest';
   import { VectorStore } from '../../src/store/VectorStore.js';

   describe('VectorStore', () => {
     let store: VectorStore;

     beforeEach(() => {
       store = new VectorStore(3); // 3 dimensions for testing
     });

     it('adds and searches vectors', () => {
       store.add('a', [1, 0, 0]);
       store.add('b', [0, 1, 0]);
       store.add('c', [0.9, 0.1, 0]);

       const results = store.search([1, 0, 0], 2);
       expect(results).toHaveLength(2);
       expect(results[0]!.id).toBe('a'); // exact match
       expect(results[1]!.id).toBe('c'); // closest
     });

     it('returns empty for no vectors', () => {
       const results = store.search([1, 0, 0], 5);
       expect(results).toHaveLength(0);
     });

     it('reports size', () => {
       store.add('a', [1, 0, 0]);
       store.add('b', [0, 1, 0]);
       expect(store.size).toBe(2);
     });

     it('handles topK larger than size', () => {
       store.add('a', [1, 0, 0]);
       const results = store.search([1, 0, 0], 10);
       expect(results).toHaveLength(1);
     });

     it('removes a vector', () => {
       store.add('a', [1, 0, 0]);
       store.add('b', [0, 1, 0]);
       store.remove('a');
       expect(store.size).toBe(1);
       const results = store.search([1, 0, 0], 2);
       expect(results).toHaveLength(1);
       expect(results[0]!.id).toBe('b');
     });
   });
   ```

2. Run test — observe failure

3. Create `packages/graph/src/store/VectorStore.ts`:

   ```typescript
   export interface VectorSearchResult {
     readonly id: string;
     readonly score: number;
   }

   /**
    * Vector store with brute-force cosine similarity.
    * Future: upgrade to HNSWLib for performance at scale.
    */
   export class VectorStore {
     private readonly dimensions: number;
     private readonly vectors: Map<string, readonly number[]> = new Map();

     constructor(dimensions: number) {
       this.dimensions = dimensions;
     }

     add(id: string, vector: readonly number[]): void {
       if (vector.length !== this.dimensions) {
         throw new Error(
           `Vector dimensions mismatch: expected ${this.dimensions}, got ${vector.length}`
         );
       }
       this.vectors.set(id, vector);
     }

     remove(id: string): void {
       this.vectors.delete(id);
     }

     search(query: readonly number[], topK: number): VectorSearchResult[] {
       if (this.vectors.size === 0) return [];

       const scored: VectorSearchResult[] = [];
       for (const [id, vector] of this.vectors) {
         scored.push({ id, score: cosineSimilarity(query, vector) });
       }

       scored.sort((a, b) => b.score - a.score);
       return scored.slice(0, topK);
     }

     get size(): number {
       return this.vectors.size;
     }

     clear(): void {
       this.vectors.clear();
     }

     has(id: string): boolean {
       return this.vectors.has(id);
     }
   }

   function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
     let dotProduct = 0;
     let normA = 0;
     let normB = 0;
     for (let i = 0; i < a.length; i++) {
       dotProduct += a[i]! * b[i]!;
       normA += a[i]! * a[i]!;
       normB += b[i]! * b[i]!;
     }
     const denominator = Math.sqrt(normA) * Math.sqrt(normB);
     return denominator === 0 ? 0 : dotProduct / denominator;
   }
   ```

4. Run test — observe: pass
5. Commit: `feat(graph): implement VectorStore with brute-force cosine similarity`

---

### Task 6: Implement ContextQL — BFS traversal (TDD)

**Depends on:** Task 3
**Files:** packages/graph/src/query/ContextQL.ts, packages/graph/tests/query/ContextQL.test.ts

1. Create `packages/graph/tests/query/ContextQL.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach } from 'vitest';
   import { GraphStore } from '../../src/store/GraphStore.js';
   import { ContextQL } from '../../src/query/ContextQL.js';

   describe('ContextQL', () => {
     let store: GraphStore;
     let cql: ContextQL;

     beforeEach(() => {
       store = new GraphStore();
       cql = new ContextQL(store);

       // Build a small graph:
       // file:app.ts -> contains -> fn:main
       // file:app.ts -> imports -> file:utils.ts
       // file:utils.ts -> contains -> fn:hash
       // fn:main -> calls -> fn:hash
       // span:req1 -> executed_by -> fn:main (observability)
       store.batchAddNodes([
         { id: 'file:app.ts', type: 'file', name: 'app.ts', metadata: {} },
         { id: 'file:utils.ts', type: 'file', name: 'utils.ts', metadata: {} },
         { id: 'fn:main', type: 'function', name: 'main', metadata: {} },
         { id: 'fn:hash', type: 'function', name: 'hash', metadata: {} },
         { id: 'span:req1', type: 'span', name: 'request', metadata: {} },
       ]);
       store.batchAddEdges([
         { from: 'file:app.ts', to: 'fn:main', type: 'contains' },
         { from: 'file:app.ts', to: 'file:utils.ts', type: 'imports' },
         { from: 'file:utils.ts', to: 'fn:hash', type: 'contains' },
         { from: 'fn:main', to: 'fn:hash', type: 'calls' },
         { from: 'span:req1', to: 'fn:main', type: 'executed_by' },
       ]);
     });

     it('traverses outbound from root to depth 1', () => {
       const result = cql.execute({
         rootNodeIds: ['file:app.ts'],
         maxDepth: 1,
       });
       // Should find: file:app.ts, fn:main, file:utils.ts
       expect(result.nodes).toHaveLength(3);
       const ids = result.nodes.map((n) => n.id);
       expect(ids).toContain('file:app.ts');
       expect(ids).toContain('fn:main');
       expect(ids).toContain('file:utils.ts');
     });

     it('traverses to depth 2', () => {
       const result = cql.execute({
         rootNodeIds: ['file:app.ts'],
         maxDepth: 2,
       });
       // Should find: file:app.ts, fn:main, file:utils.ts, fn:hash
       expect(result.nodes).toHaveLength(4);
       const ids = result.nodes.map((n) => n.id);
       expect(ids).toContain('fn:hash');
     });

     it('prunes observability nodes by default', () => {
       const result = cql.execute({
         rootNodeIds: ['fn:main'],
         maxDepth: 2,
         bidirectional: true,
       });
       const ids = result.nodes.map((n) => n.id);
       expect(ids).not.toContain('span:req1');
       expect(result.stats.pruned).toBeGreaterThan(0);
     });

     it('includes observability nodes when pruning is disabled', () => {
       const result = cql.execute({
         rootNodeIds: ['fn:main'],
         maxDepth: 2,
         bidirectional: true,
         pruneObservability: false,
       });
       const ids = result.nodes.map((n) => n.id);
       expect(ids).toContain('span:req1');
     });

     it('filters by node type', () => {
       const result = cql.execute({
         rootNodeIds: ['file:app.ts'],
         maxDepth: 3,
         includeTypes: ['function'],
       });
       // Root is always included even if not in includeTypes
       const nonRootNodes = result.nodes.filter((n) => n.id !== 'file:app.ts');
       for (const node of nonRootNodes) {
         expect(node.type).toBe('function');
       }
     });

     it('filters by edge type', () => {
       const result = cql.execute({
         rootNodeIds: ['file:app.ts'],
         maxDepth: 3,
         includeEdges: ['contains'],
       });
       // Should only follow 'contains' edges, not 'imports'
       const ids = result.nodes.map((n) => n.id);
       expect(ids).toContain('fn:main');
       expect(ids).not.toContain('file:utils.ts');
     });

     it('supports bidirectional traversal', () => {
       const result = cql.execute({
         rootNodeIds: ['fn:hash'],
         maxDepth: 1,
         bidirectional: true,
       });
       const ids = result.nodes.map((n) => n.id);
       // Inbound: file:utils.ts (contains), fn:main (calls)
       expect(ids).toContain('file:utils.ts');
       expect(ids).toContain('fn:main');
     });

     it('returns stats', () => {
       const result = cql.execute({
         rootNodeIds: ['file:app.ts'],
         maxDepth: 2,
       });
       expect(result.stats.totalReturned).toBeGreaterThan(0);
       expect(result.stats.depthReached).toBeLessThanOrEqual(2);
     });

     it('handles empty root set', () => {
       const result = cql.execute({ rootNodeIds: [] });
       expect(result.nodes).toHaveLength(0);
       expect(result.edges).toHaveLength(0);
     });

     it('handles missing root node gracefully', () => {
       const result = cql.execute({ rootNodeIds: ['nonexistent'] });
       expect(result.nodes).toHaveLength(0);
     });
   });
   ```

2. Run test — observe failure

3. Create `packages/graph/src/query/ContextQL.ts`:

   ```typescript
   import type { GraphStore } from '../store/GraphStore.js';
   import type {
     GraphNode,
     GraphEdge,
     ContextQLParams,
     ContextQLResult,
     NodeType,
   } from '../types.js';
   import { OBSERVABILITY_TYPES } from '../types.js';

   export class ContextQL {
     constructor(private readonly store: GraphStore) {}

     execute(params: ContextQLParams): ContextQLResult {
       const {
         rootNodeIds,
         maxDepth = 3,
         includeTypes,
         excludeTypes,
         includeEdges,
         bidirectional = false,
         pruneObservability = true,
       } = params;

       const visited = new Set<string>();
       const resultNodes: GraphNode[] = [];
       const resultEdges: GraphEdge[] = [];
       let pruned = 0;
       let maxDepthReached = 0;

       // BFS queue: [nodeId, currentDepth]
       const queue: Array<[string, number]> = [];

       // Seed with root nodes
       for (const rootId of rootNodeIds) {
         const node = this.store.getNode(rootId);
         if (node) {
           visited.add(rootId);
           resultNodes.push(node);
           queue.push([rootId, 0]);
         }
       }

       while (queue.length > 0) {
         const [currentId, depth] = queue.shift()!;
         if (depth >= maxDepth) continue;

         const nextDepth = depth + 1;
         if (nextDepth > maxDepthReached) maxDepthReached = nextDepth;

         // Get edges to traverse
         const edges: GraphEdge[] = [];

         // Outbound edges
         const outbound = this.store.getEdges({ from: currentId });
         edges.push(...outbound);

         // Inbound edges (if bidirectional)
         if (bidirectional) {
           const inbound = this.store.getEdges({ to: currentId });
           edges.push(...inbound);
         }

         for (const edge of edges) {
           // Edge type filter
           if (includeEdges && !includeEdges.includes(edge.type)) {
             continue;
           }

           const neighborId = edge.from === currentId ? edge.to : edge.from;
           if (visited.has(neighborId)) {
             // Still include the edge for completeness
             resultEdges.push(edge);
             continue;
           }

           const neighbor = this.store.getNode(neighborId);
           if (!neighbor) continue;

           // Observability pruning
           if (pruneObservability && OBSERVABILITY_TYPES.has(neighbor.type)) {
             pruned++;
             continue;
           }

           // Node type filters
           if (includeTypes && !includeTypes.includes(neighbor.type)) {
             continue;
           }
           if (excludeTypes && excludeTypes.includes(neighbor.type)) {
             continue;
           }

           visited.add(neighborId);
           resultNodes.push(neighbor);
           resultEdges.push(edge);
           queue.push([neighborId, nextDepth]);
         }
       }

       return {
         nodes: resultNodes,
         edges: resultEdges,
         stats: {
           totalTraversed: visited.size,
           totalReturned: resultNodes.length,
           pruned,
           depthReached: maxDepthReached,
         },
       };
     }
   }
   ```

4. Run test — observe: pass
5. Commit: `feat(graph): implement ContextQL with BFS traversal and noise pruning`

---

### Task 7: Implement Projection (TDD)

**Depends on:** Task 2
**Files:** packages/graph/src/query/Projection.ts, packages/graph/tests/query/Projection.test.ts

1. Create `packages/graph/tests/query/Projection.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { project } from '../../src/query/Projection.js';
   import type { GraphNode } from '../../src/types.js';

   describe('Projection', () => {
     const node: GraphNode = {
       id: 'fn:hello',
       type: 'function',
       name: 'hello',
       path: 'src/utils.ts',
       content: 'function hello() { return "world"; }',
       metadata: { exported: true },
       location: { fileId: 'file:utils.ts', startLine: 1, endLine: 3 },
     };

     it('projects specific fields', () => {
       const result = project([node], { fields: ['id', 'name', 'type'] });
       expect(result[0]).toEqual({ id: 'fn:hello', name: 'hello', type: 'function' });
       expect(result[0]).not.toHaveProperty('content');
       expect(result[0]).not.toHaveProperty('path');
     });

     it('returns full node when no projection', () => {
       const result = project([node], undefined);
       expect(result[0]).toEqual(node);
     });

     it('handles empty array', () => {
       expect(project([], { fields: ['id'] })).toEqual([]);
     });
   });
   ```

2. Run test — observe failure

3. Create `packages/graph/src/query/Projection.ts`:

   ```typescript
   import type { GraphNode, ProjectionSpec } from '../types.js';

   export function project(
     nodes: readonly GraphNode[],
     spec: ProjectionSpec | undefined
   ): Partial<GraphNode>[] {
     if (!spec) return nodes.map((n) => ({ ...n }));

     return nodes.map((node) => {
       const projected: Record<string, unknown> = {};
       for (const field of spec.fields) {
         if (field in node) {
           projected[field] = node[field];
         }
       }
       return projected as Partial<GraphNode>;
     });
   }
   ```

4. Run test — observe: pass
5. Commit: `feat(graph): implement field projection for context reduction`

---

### Task 8: Create test fixture project

**Depends on:** Task 1
**Files:** packages/graph/**fixtures**/sample-project/\*

1. Create `packages/graph/__fixtures__/sample-project/package.json`:

   ```json
   { "name": "sample-project", "version": "1.0.0", "type": "module" }
   ```

2. Create `packages/graph/__fixtures__/sample-project/src/types.ts`:

   ```typescript
   export interface User {
     id: string;
     name: string;
     email: string;
   }

   export interface AuthToken {
     token: string;
     userId: string;
     expiresAt: Date;
   }
   ```

3. Create `packages/graph/__fixtures__/sample-project/src/utils/hash.ts`:

   ```typescript
   import { createHash } from 'node:crypto';

   export function hashPassword(password: string): string {
     return createHash('sha256').update(password).digest('hex');
   }

   export function verifyHash(password: string, hash: string): boolean {
     return hashPassword(password) === hash;
   }
   ```

4. Create `packages/graph/__fixtures__/sample-project/src/services/auth-service.ts`:

   ```typescript
   import type { User, AuthToken } from '../types.js';
   import { hashPassword } from '../utils/hash.js';

   export class AuthService {
     authenticate(user: User, password: string): AuthToken {
       const hash = hashPassword(password);
       return {
         token: hash.slice(0, 16),
         userId: user.id,
         expiresAt: new Date(Date.now() + 3600_000),
       };
     }
   }
   ```

5. Create `packages/graph/__fixtures__/sample-project/src/services/user-service.ts`:

   ```typescript
   import type { User } from '../types.js';
   import { AuthService } from './auth-service.js';

   export class UserService {
     private readonly auth = new AuthService();
     private users: User[] = [];

     createUser(name: string, email: string): User {
       const user: User = { id: String(this.users.length + 1), name, email };
       this.users.push(user);
       return user;
     }

     getUser(id: string): User | undefined {
       return this.users.find((u) => u.id === id);
     }

     login(userId: string, password: string) {
       const user = this.getUser(userId);
       if (!user) throw new Error('User not found');
       return this.auth.authenticate(user, password);
     }
   }
   ```

6. Create `packages/graph/__fixtures__/sample-project/src/index.ts`:

   ```typescript
   export { UserService } from './services/user-service.js';
   export { AuthService } from './services/auth-service.js';
   export { hashPassword, verifyHash } from './utils/hash.js';
   export type { User, AuthToken } from './types.js';
   ```

7. Commit: `test(graph): add sample fixture project for integration tests`

---

### Task 9: Implement CodeIngestor — regex-based parsing (TDD)

**Depends on:** Task 3, Task 8
**Files:** packages/graph/src/ingest/CodeIngestor.ts, packages/graph/tests/ingest/CodeIngestor.test.ts

1. Create `packages/graph/tests/ingest/CodeIngestor.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import * as path from 'node:path';
   import { GraphStore } from '../../src/store/GraphStore.js';
   import { CodeIngestor } from '../../src/ingest/CodeIngestor.js';

   const FIXTURE_DIR = path.resolve(__dirname, '../../__fixtures__/sample-project');

   describe('CodeIngestor', () => {
     it('ingests TypeScript files as file nodes', async () => {
       const store = new GraphStore();
       const ingestor = new CodeIngestor(store);
       const result = await ingestor.ingest(FIXTURE_DIR);

       expect(result.nodesAdded).toBeGreaterThan(0);
       expect(result.errors).toHaveLength(0);

       // Should have file nodes for each .ts file
       const files = store.findNodes({ type: 'file' });
       expect(files.length).toBeGreaterThanOrEqual(5); // index, types, hash, auth-service, user-service
     });

     it('creates import edges between files', async () => {
       const store = new GraphStore();
       const ingestor = new CodeIngestor(store);
       await ingestor.ingest(FIXTURE_DIR);

       // auth-service imports from types and hash
       const authFile = store
         .findNodes({ type: 'file' })
         .find((n) => n.path?.includes('auth-service'));
       expect(authFile).toBeDefined();

       const imports = store.getEdges({ from: authFile!.id, type: 'imports' });
       expect(imports.length).toBeGreaterThanOrEqual(2);
     });

     it('extracts function nodes', async () => {
       const store = new GraphStore();
       const ingestor = new CodeIngestor(store);
       await ingestor.ingest(FIXTURE_DIR);

       const functions = store.findNodes({ type: 'function' });
       const names = functions.map((f) => f.name);
       expect(names).toContain('hashPassword');
       expect(names).toContain('verifyHash');
     });

     it('extracts class nodes', async () => {
       const store = new GraphStore();
       const ingestor = new CodeIngestor(store);
       await ingestor.ingest(FIXTURE_DIR);

       const classes = store.findNodes({ type: 'class' });
       const names = classes.map((c) => c.name);
       expect(names).toContain('AuthService');
       expect(names).toContain('UserService');
     });

     it('extracts interface nodes', async () => {
       const store = new GraphStore();
       const ingestor = new CodeIngestor(store);
       await ingestor.ingest(FIXTURE_DIR);

       const interfaces = store.findNodes({ type: 'interface' });
       const names = interfaces.map((i) => i.name);
       expect(names).toContain('User');
       expect(names).toContain('AuthToken');
     });

     it('creates contains edges from file to symbols', async () => {
       const store = new GraphStore();
       const ingestor = new CodeIngestor(store);
       await ingestor.ingest(FIXTURE_DIR);

       const hashFile = store.findNodes({ type: 'file' }).find((n) => n.path?.includes('hash'));
       expect(hashFile).toBeDefined();

       const contains = store.getEdges({ from: hashFile!.id, type: 'contains' });
       expect(contains.length).toBeGreaterThanOrEqual(2); // hashPassword, verifyHash
     });

     it('returns timing information', async () => {
       const store = new GraphStore();
       const ingestor = new CodeIngestor(store);
       const result = await ingestor.ingest(FIXTURE_DIR);
       expect(result.durationMs).toBeGreaterThan(0);
     });
   });
   ```

2. Run test — observe failure

3. Create `packages/graph/src/ingest/CodeIngestor.ts`:

   ```typescript
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import type { GraphStore } from '../store/GraphStore.js';
   import type { GraphNode, GraphEdge, IngestResult } from '../types.js';

   /**
    * Ingests TypeScript/JavaScript files into the graph via regex-based parsing.
    * Future: upgrade to tree-sitter for full AST parsing.
    */
   export class CodeIngestor {
     constructor(private readonly store: GraphStore) {}

     async ingest(rootDir: string): Promise<IngestResult> {
       const start = Date.now();
       const errors: string[] = [];
       let nodesAdded = 0;
       let edgesAdded = 0;

       const files = this.findSourceFiles(rootDir);

       for (const filePath of files) {
         try {
           const relativePath = path.relative(rootDir, filePath);
           const content = fs.readFileSync(filePath, 'utf-8');
           const fileId = `file:${relativePath}`;

           // Add file node
           const fileNode: GraphNode = {
             id: fileId,
             type: 'file',
             name: path.basename(filePath),
             path: relativePath,
             metadata: { language: this.detectLanguage(filePath) },
             lastModified: fs.statSync(filePath).mtime.toISOString(),
           };
           this.store.addNode(fileNode);
           nodesAdded++;

           // Extract symbols
           const symbols = this.extractSymbols(content, fileId, relativePath);
           for (const { node, edge } of symbols) {
             this.store.addNode(node);
             this.store.addEdge(edge);
             nodesAdded++;
             edgesAdded++;
           }

           // Extract imports
           const imports = this.extractImports(content, fileId, relativePath, rootDir);
           for (const edge of imports) {
             this.store.addEdge(edge);
             edgesAdded++;
           }
         } catch (err) {
           errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
         }
       }

       return {
         nodesAdded,
         nodesUpdated: 0,
         edgesAdded,
         edgesUpdated: 0,
         errors,
         durationMs: Date.now() - start,
       };
     }

     private findSourceFiles(dir: string): string[] {
       const results: string[] = [];
       const entries = fs.readdirSync(dir, { withFileTypes: true });
       for (const entry of entries) {
         const fullPath = path.join(dir, entry.name);
         if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
           results.push(...this.findSourceFiles(fullPath));
         } else if (
           entry.isFile() &&
           /\.(ts|tsx|js|jsx)$/.test(entry.name) &&
           !entry.name.endsWith('.d.ts')
         ) {
           results.push(fullPath);
         }
       }
       return results;
     }

     private extractSymbols(
       content: string,
       fileId: string,
       relativePath: string
     ): Array<{ node: GraphNode; edge: GraphEdge }> {
       const results: Array<{ node: GraphNode; edge: GraphEdge }> = [];
       const lines = content.split('\n');

       for (let i = 0; i < lines.length; i++) {
         const line = lines[i]!;

         // Functions: export function name(
         const fnMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
         if (fnMatch) {
           const name = fnMatch[1]!;
           const id = `function:${relativePath}:${name}`;
           results.push({
             node: {
               id,
               type: 'function',
               name,
               path: relativePath,
               location: { fileId, startLine: i + 1, endLine: i + 1 },
               metadata: { exported: line.includes('export') },
             },
             edge: { from: fileId, to: id, type: 'contains' },
           });
         }

         // Classes: export class Name
         const classMatch = line.match(/(?:export\s+)?class\s+(\w+)/);
         if (classMatch) {
           const name = classMatch[1]!;
           const id = `class:${relativePath}:${name}`;
           results.push({
             node: {
               id,
               type: 'class',
               name,
               path: relativePath,
               location: { fileId, startLine: i + 1, endLine: i + 1 },
               metadata: { exported: line.includes('export') },
             },
             edge: { from: fileId, to: id, type: 'contains' },
           });
         }

         // Interfaces: export interface Name
         const ifaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
         if (ifaceMatch) {
           const name = ifaceMatch[1]!;
           const id = `interface:${relativePath}:${name}`;
           results.push({
             node: {
               id,
               type: 'interface',
               name,
               path: relativePath,
               location: { fileId, startLine: i + 1, endLine: i + 1 },
               metadata: { exported: line.includes('export') },
             },
             edge: { from: fileId, to: id, type: 'contains' },
           });
         }
       }

       return results;
     }

     private extractImports(
       content: string,
       fileId: string,
       relativePath: string,
       rootDir: string
     ): GraphEdge[] {
       const edges: GraphEdge[] = [];
       const importRegex = /import\s+(?:type\s+)?(?:\{[^}]*\}|[\w*]+)\s+from\s+['"]([^'"]+)['"]/g;
       let match: RegExpExecArray | null;

       while ((match = importRegex.exec(content)) !== null) {
         const importPath = match[1]!;

         // Only resolve relative imports
         if (!importPath.startsWith('.')) continue;

         const resolvedPath = this.resolveImportPath(relativePath, importPath, rootDir);
         if (resolvedPath) {
           const targetId = `file:${resolvedPath}`;
           const isTypeOnly = match[0]!.includes('import type');
           edges.push({
             from: fileId,
             to: targetId,
             type: 'imports',
             metadata: { importType: isTypeOnly ? 'type-only' : 'static' },
           });
         }
       }

       return edges;
     }

     private resolveImportPath(
       fromFile: string,
       importPath: string,
       rootDir: string
     ): string | null {
       const fromDir = path.dirname(fromFile);
       const resolved = path.normalize(path.join(fromDir, importPath));

       // Try with extensions
       const extensions = ['.ts', '.tsx', '.js', '.jsx'];
       for (const ext of extensions) {
         const candidate = resolved.replace(/\.js$/, '') + ext;
         const fullPath = path.join(rootDir, candidate);
         if (fs.existsSync(fullPath)) {
           return candidate;
         }
       }

       // Try as directory with index
       for (const ext of extensions) {
         const candidate = path.join(resolved, `index${ext}`);
         const fullPath = path.join(rootDir, candidate);
         if (fs.existsSync(fullPath)) {
           return candidate;
         }
       }

       return null;
     }

     private detectLanguage(filePath: string): string {
       if (/\.tsx?$/.test(filePath)) return 'typescript';
       if (/\.jsx?$/.test(filePath)) return 'javascript';
       return 'unknown';
     }
   }
   ```

4. Run test — observe: pass
5. Commit: `feat(graph): implement CodeIngestor with regex-based TypeScript parsing`

---

### Task 10: Implement TopologicalLinker (TDD)

**Depends on:** Task 9
**Files:** packages/graph/src/ingest/TopologicalLinker.ts, packages/graph/tests/ingest/TopologicalLinker.test.ts

1. Create `packages/graph/tests/ingest/TopologicalLinker.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import * as path from 'node:path';
   import { GraphStore } from '../../src/store/GraphStore.js';
   import { CodeIngestor } from '../../src/ingest/CodeIngestor.js';
   import { TopologicalLinker } from '../../src/ingest/TopologicalLinker.js';

   const FIXTURE_DIR = path.resolve(__dirname, '../../__fixtures__/sample-project');

   describe('TopologicalLinker', () => {
     it('resolves cross-module import references', async () => {
       const store = new GraphStore();
       const ingestor = new CodeIngestor(store);
       await ingestor.ingest(FIXTURE_DIR);

       const linker = new TopologicalLinker(store);
       const result = linker.link();

       expect(result.edgesAdded).toBeGreaterThan(0);
     });

     it('detects circular dependencies', async () => {
       const store = new GraphStore();

       // Create a cycle: A -> B -> C -> A
       store.batchAddNodes([
         { id: 'file:a.ts', type: 'file', name: 'a.ts', metadata: {} },
         { id: 'file:b.ts', type: 'file', name: 'b.ts', metadata: {} },
         { id: 'file:c.ts', type: 'file', name: 'c.ts', metadata: {} },
       ]);
       store.batchAddEdges([
         { from: 'file:a.ts', to: 'file:b.ts', type: 'imports' },
         { from: 'file:b.ts', to: 'file:c.ts', type: 'imports' },
         { from: 'file:c.ts', to: 'file:a.ts', type: 'imports' },
       ]);

       const linker = new TopologicalLinker(store);
       const result = linker.link();

       expect(result.cycles.length).toBeGreaterThan(0);
     });

     it('reports no cycles for acyclic graph', async () => {
       const store = new GraphStore();
       const ingestor = new CodeIngestor(store);
       await ingestor.ingest(FIXTURE_DIR);

       const linker = new TopologicalLinker(store);
       const result = linker.link();

       expect(result.cycles).toHaveLength(0);
     });
   });
   ```

2. Run test — observe failure

3. Create `packages/graph/src/ingest/TopologicalLinker.ts`:

   ```typescript
   import type { GraphStore } from '../store/GraphStore.js';

   export interface LinkResult {
     readonly edgesAdded: number;
     readonly cycles: readonly string[][];
   }

   /**
    * Post-ingestion linker that:
    * 1. Groups files into module nodes based on directory structure
    * 2. Detects circular dependencies in the import graph
    */
   export class TopologicalLinker {
     constructor(private readonly store: GraphStore) {}

     link(): LinkResult {
       let edgesAdded = 0;

       // Group files into module nodes by directory
       const files = this.store.findNodes({ type: 'file' });
       const directories = new Map<string, string[]>();

       for (const file of files) {
         if (!file.path) continue;
         const dir = file.path.includes('/')
           ? file.path.substring(0, file.path.lastIndexOf('/'))
           : '.';
         if (!directories.has(dir)) {
           directories.set(dir, []);
         }
         directories.get(dir)!.push(file.id);
       }

       // Create module nodes for directories with multiple files
       for (const [dir, fileIds] of directories) {
         if (fileIds.length < 1) continue;
         const moduleId = `module:${dir}`;
         const moduleName = dir === '.' ? 'root' : dir.split('/').pop() || dir;

         this.store.addNode({
           id: moduleId,
           type: 'module',
           name: moduleName,
           path: dir,
           metadata: { fileCount: fileIds.length },
         });
         edgesAdded++;

         for (const fileId of fileIds) {
           this.store.addEdge({
             from: moduleId,
             to: fileId,
             type: 'contains',
           });
           edgesAdded++;
         }
       }

       // Detect circular dependencies
       const cycles = this.detectCycles(files.map((f) => f.id));

       return { edgesAdded, cycles };
     }

     private detectCycles(fileIds: string[]): string[][] {
       const cycles: string[][] = [];
       const visited = new Set<string>();
       const inStack = new Set<string>();
       const path: string[] = [];

       const dfs = (nodeId: string): void => {
         if (inStack.has(nodeId)) {
           // Found a cycle
           const cycleStart = path.indexOf(nodeId);
           if (cycleStart !== -1) {
             cycles.push(path.slice(cycleStart).concat(nodeId));
           }
           return;
         }

         if (visited.has(nodeId)) return;

         visited.add(nodeId);
         inStack.add(nodeId);
         path.push(nodeId);

         const importEdges = this.store.getEdges({ from: nodeId, type: 'imports' });
         for (const edge of importEdges) {
           dfs(edge.to);
         }

         path.pop();
         inStack.delete(nodeId);
       };

       for (const fileId of fileIds) {
         if (!visited.has(fileId)) {
           dfs(fileId);
         }
       }

       return cycles;
     }
   }
   ```

4. Run test — observe: pass
5. Commit: `feat(graph): implement TopologicalLinker with module grouping and cycle detection`

---

### Task 11: Integration test — scan and query end-to-end

**Depends on:** Task 6, Task 9, Task 10
**Files:** packages/graph/tests/integration/scan-and-query.test.ts

1. Create `packages/graph/tests/integration/scan-and-query.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import * as path from 'node:path';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import { GraphStore } from '../../src/store/GraphStore.js';
   import { CodeIngestor } from '../../src/ingest/CodeIngestor.js';
   import { TopologicalLinker } from '../../src/ingest/TopologicalLinker.js';
   import { ContextQL } from '../../src/query/ContextQL.js';

   const FIXTURE_DIR = path.resolve(__dirname, '../../__fixtures__/sample-project');

   describe('Integration: scan and query', () => {
     it('full pipeline: ingest → link → query → persist → reload', async () => {
       // 1. Ingest
       const store = new GraphStore();
       const ingestor = new CodeIngestor(store);
       const ingestResult = await ingestor.ingest(FIXTURE_DIR);
       expect(ingestResult.errors).toHaveLength(0);
       expect(store.nodeCount).toBeGreaterThan(5);

       // 2. Link
       const linker = new TopologicalLinker(store);
       const linkResult = linker.link();
       expect(linkResult.cycles).toHaveLength(0);

       // 3. Query: find everything reachable from user-service
       const cql = new ContextQL(store);
       const userServiceFile = store
         .findNodes({ type: 'file' })
         .find((n) => n.path?.includes('user-service'));
       expect(userServiceFile).toBeDefined();

       const result = cql.execute({
         rootNodeIds: [userServiceFile!.id],
         maxDepth: 3,
       });

       // user-service imports auth-service and types
       // auth-service imports types and hash
       const paths = result.nodes.map((n) => n.path).filter(Boolean);
       expect(paths.some((p) => p!.includes('auth-service'))).toBe(true);
       expect(paths.some((p) => p!.includes('types'))).toBe(true);

       // 4. Persist and reload
       const tmpDir = path.join(os.tmpdir(), `graph-integration-${Date.now()}`);
       fs.mkdirSync(tmpDir, { recursive: true });
       try {
         await store.save(tmpDir);

         const loaded = new GraphStore();
         const loadSuccess = await loaded.load(tmpDir);
         expect(loadSuccess).toBe(true);
         expect(loaded.nodeCount).toBe(store.nodeCount);
         expect(loaded.edgeCount).toBe(store.edgeCount);

         // Query works on reloaded graph
         const reloadedCql = new ContextQL(loaded);
         const reloadedResult = reloadedCql.execute({
           rootNodeIds: [userServiceFile!.id],
           maxDepth: 3,
         });
         expect(reloadedResult.nodes.length).toBe(result.nodes.length);
       } finally {
         fs.rmSync(tmpDir, { recursive: true, force: true });
       }
     });

     it('noise pruning reduces context size', async () => {
       const store = new GraphStore();
       const ingestor = new CodeIngestor(store);
       await ingestor.ingest(FIXTURE_DIR);

       // Add observability noise
       store.addNode({ id: 'span:req1', type: 'span', name: 'HTTP GET', metadata: {} });
       store.addNode({ id: 'metric:latency', type: 'metric', name: 'p99', metadata: {} });
       const someFile = store.findNodes({ type: 'file' })[0]!;
       store.addEdge({ from: 'span:req1', to: someFile.id, type: 'executed_by' });
       store.addEdge({ from: 'metric:latency', to: someFile.id, type: 'measured_by' });

       const cql = new ContextQL(store);

       // With pruning (default)
       const pruned = cql.execute({
         rootNodeIds: [someFile.id],
         maxDepth: 2,
         bidirectional: true,
       });

       // Without pruning
       const unpruned = cql.execute({
         rootNodeIds: [someFile.id],
         maxDepth: 2,
         bidirectional: true,
         pruneObservability: false,
       });

       expect(pruned.nodes.length).toBeLessThan(unpruned.nodes.length);
       expect(pruned.stats.pruned).toBeGreaterThan(0);
     });
   });
   ```

2. Run: `cd packages/graph && npx vitest run tests/integration/` — observe: pass
3. Commit: `test(graph): add end-to-end integration test for scan → link → query → persist`

---

### Task 12: Run full test suite and build

**Depends on:** Tasks 1-11
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run full test suite: `cd packages/graph && npx vitest run`
2. Observe: all tests pass
3. Run build: `cd packages/graph && pnpm build`
4. Observe: build succeeds with CJS, ESM, and .d.ts output in `dist/`
5. Run typecheck: `cd packages/graph && npx tsc --noEmit`
6. Observe: no type errors
7. Run from monorepo root: `pnpm build --filter @harness-engineering/graph`
8. Observe: turborepo builds graph package successfully
9. Commit: `chore(graph): verify build, typecheck, and full test suite pass`

---

## Dependency Graph

```
Task 1 (scaffold) ──→ Task 2 (types) ──→ Task 3 (store CRUD) ──→ Task 4 (persistence)
                  │                  │                          │
                  │                  ├→ Task 5 (vector store)   │
                  │                  │                          │
                  │                  └→ Task 7 (projection)     │
                  │                                             │
                  └→ Task 8 (fixtures) ──→ Task 9 (code ingestor) ──→ Task 10 (linker)
                                                                          │
                                          Task 6 (ContextQL) ←── Task 3  │
                                                    │                     │
                                                    └──→ Task 11 (integration) ←──┘
                                                                │
                                                          Task 12 (verify)
```

**Parallelizable groups:**

- Tasks 5, 6, 7 can run in parallel (independent of each other, all depend on Task 2/3)
- Task 8 can run in parallel with Tasks 3-7

## Traceability Matrix

| Observable Truth               | Delivered By                                                     |
| ------------------------------ | ---------------------------------------------------------------- |
| 1. GraphStore CRUD             | Task 3                                                           |
| 2. Save/Load round-trip        | Task 4                                                           |
| 3. ContextQL traversal         | Task 6                                                           |
| 4. Observability noise pruning | Task 6                                                           |
| 5. VectorStore search          | Task 5                                                           |
| 6. HNSWLib fallback            | Task 5 (brute-force is the default; HNSWLib upgrade is Phase 2+) |
| 7. CodeIngestor parsing        | Task 9                                                           |
| 8. TopologicalLinker           | Task 10                                                          |
| 9. Build succeeds              | Task 12                                                          |
| 10. Tests pass 80%+            | Task 12                                                          |
| 11. Root tsconfig reference    | Task 1                                                           |
| 12. Workspace inclusion        | Task 1 (already covered by `packages/*` glob)                    |
