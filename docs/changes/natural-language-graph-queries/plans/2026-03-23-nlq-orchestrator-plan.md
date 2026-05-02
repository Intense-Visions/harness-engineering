# Plan: NLQ Orchestrator (Phase 6)

**Date:** 2026-03-23
**Spec:** docs/changes/natural-language-graph-queries/proposal.md
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Replace the stub `askGraph()` function with a real orchestrator that wires together IntentClassifier, EntityExtractor, EntityResolver, graph operations (ContextQL, FusionLayer, GraphAnomalyAdapter), and ResponseFormatter, plus integration tests and package exports.

## Observable Truths (Acceptance Criteria)

1. When `askGraph(store, "what breaks if I change AuthService?")` is called with a store containing an AuthService node, the system shall return an `AskGraphResult` with `intent: 'impact'`, resolved entities containing AuthService, a non-empty summary, and grouped impact data with keys `code`, `tests`, `docs`, `other`.
2. When `askGraph(store, "where is the auth middleware?")` is called, the system shall return `intent: 'find'` with FusionLayer search results as an array.
3. When `askGraph(store, "what calls UserService?")` is called, the system shall return `intent: 'relationships'` with ContextQL depth-1 bidirectional results containing `nodes` and `edges`.
4. When `askGraph(store, "what is GraphStore?")` is called, the system shall return `intent: 'explain'` with context blocks from FusionLayer search + ContextQL expansion.
5. When `askGraph(store, "what looks wrong?")` is called, the system shall return `intent: 'anomaly'` with an `AnomalyReport` containing `statisticalOutliers`, `articulationPoints`, and `summary`.
6. When intent confidence < 0.3, the system shall return `data: null` and a `suggestions` array with rephrased query ideas based on the top 2 intents.
7. When entities cannot be resolved and the intent requires entities (impact, relationships, explain), the system shall return `data: null` with a summary explaining no matching nodes were found.
8. `askGraph`, `AskGraphResult`, `Intent`, `ClassificationResult`, `ResolvedEntity`, `IntentClassifier`, `EntityExtractor`, `EntityResolver`, `ResponseFormatter`, and `INTENTS` shall be exported from `packages/graph/src/index.ts`.
9. `npx vitest run packages/graph/tests/nlq/askGraph.test.ts` shall pass with tests covering all 5 intents, low-confidence, and no-entity edge cases.

## File Map

- MODIFY `packages/graph/src/nlq/index.ts` (replace stub with real orchestrator)
- CREATE `packages/graph/tests/nlq/askGraph.test.ts` (integration tests)
- MODIFY `packages/graph/src/index.ts` (add NLQ exports)

## Tasks

### Task 1: Implement the askGraph orchestrator

**Depends on:** none
**Files:** `packages/graph/src/nlq/index.ts`

Replace the stub implementation with the real orchestrator. The function:

1. Creates instances of IntentClassifier, EntityExtractor, FusionLayer, EntityResolver, ResponseFormatter
2. Classifies intent via `new IntentClassifier().classify(question)`
3. If confidence < 0.3, returns early with suggestions
4. Extracts raw entities via `new EntityExtractor().extract(question)`
5. Resolves entities via `new EntityResolver(store, fusion).resolve(raws)`
6. Executes the graph operation based on intent (see operation mapping below)
7. Formats the response via `new ResponseFormatter().format(intent, entities, data, question)`
8. Returns `AskGraphResult`

**Operation mapping by intent:**

- **impact**: If no resolved entities, return helpful message. Otherwise, use `new ContextQL(store).execute({ rootNodeIds: [entity.nodeId], bidirectional: true, maxDepth: 3 })`. Group result nodes (excluding the root) into `{ tests, docs, code, other }` using the same type sets as `handleGetImpact` in `packages/cli/src/mcp/tools/graph.ts` (lines 543-568).
- **find**: Use `new FusionLayer(store).search(question, 10)`. Return the array of FusionResult directly.
- **relationships**: If no resolved entities, return helpful message. Otherwise, use `new ContextQL(store).execute({ rootNodeIds: [entity.nodeId], bidirectional: true, maxDepth: 1 })`. Return `{ nodes, edges }`.
- **explain**: If no resolved entities, return helpful message. Otherwise, use FusionLayer search + ContextQL expansion (same pattern as `handleFindContextFor` in graph.ts lines 258-313). Return `{ searchResults, context }`.
- **anomaly**: Use `new GraphAnomalyAdapter(store).detect()`. Return the full `AnomalyReport`. Note: anomaly does NOT require resolved entities.

**Low-confidence path (confidence < 0.3):** Return:

```typescript
{
  intent: classification.intent,
  intentConfidence: classification.confidence,
  entities: [],
  summary: `I'm not sure what you're asking. Try rephrasing your question.`,
  data: null,
  suggestions: [
    'Try "what breaks if I change <name>?" for impact analysis',
    'Try "where is <name>?" to find entities',
    'Try "what calls <name>?" for relationships',
    'Try "what is <name>?" for explanations',
    'Try "what looks wrong?" for anomaly detection',
  ],
}
```

**No-entity path (for intents requiring entities):** Return:

```typescript
{
  intent: classification.intent,
  intentConfidence: classification.confidence,
  entities: [],
  summary: `Could not find any matching nodes in the graph for your query. Try using exact class names, function names, or file paths.`,
  data: null,
}
```

**Exact replacement for `packages/graph/src/nlq/index.ts`:**

```typescript
import type { GraphStore } from '../store/GraphStore.js';
import type { AskGraphResult } from './types.js';
import { IntentClassifier } from './IntentClassifier.js';
import { EntityExtractor } from './EntityExtractor.js';
import { EntityResolver } from './EntityResolver.js';
import { ResponseFormatter } from './ResponseFormatter.js';
import { FusionLayer } from '../search/FusionLayer.js';
import { ContextQL } from '../query/ContextQL.js';
import { GraphAnomalyAdapter } from '../entropy/GraphAnomalyAdapter.js';

export { INTENTS } from './types.js';
export type { Intent, ClassificationResult, ResolvedEntity, AskGraphResult } from './types.js';
export { IntentClassifier } from './IntentClassifier.js';
export { EntityExtractor } from './EntityExtractor.js';
export { EntityResolver } from './EntityResolver.js';
export { ResponseFormatter } from './ResponseFormatter.js';

/** Intents that require at least one resolved entity to produce meaningful results. */
const ENTITY_REQUIRED_INTENTS = new Set(['impact', 'relationships', 'explain']);

/** Type sets for grouping impact results — mirrors handleGetImpact in cli/mcp/tools/graph.ts */
const TEST_TYPES = new Set(['test_result']);
const DOC_TYPES = new Set(['adr', 'decision', 'document', 'learning']);
const CODE_TYPES = new Set([
  'file',
  'module',
  'class',
  'interface',
  'function',
  'method',
  'variable',
]);

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
export async function askGraph(store: GraphStore, question: string): Promise<AskGraphResult> {
  const classifier = new IntentClassifier();
  const extractor = new EntityExtractor();
  const fusion = new FusionLayer(store);
  const resolver = new EntityResolver(store, fusion);
  const formatter = new ResponseFormatter();

  // Step 1: Classify intent
  const classification = classifier.classify(question);

  // Step 2: Low-confidence bail-out
  if (classification.confidence < 0.3) {
    return {
      intent: classification.intent,
      intentConfidence: classification.confidence,
      entities: [],
      summary: "I'm not sure what you're asking. Try rephrasing your question.",
      data: null,
      suggestions: [
        'Try "what breaks if I change <name>?" for impact analysis',
        'Try "where is <name>?" to find entities',
        'Try "what calls <name>?" for relationships',
        'Try "what is <name>?" for explanations',
        'Try "what looks wrong?" for anomaly detection',
      ],
    };
  }

  // Step 3: Extract entities
  const rawEntities = extractor.extract(question);

  // Step 4: Resolve entities
  const entities = await resolver.resolve(rawEntities);

  // Step 5: Check if entity-requiring intents have entities
  if (ENTITY_REQUIRED_INTENTS.has(classification.intent) && entities.length === 0) {
    return {
      intent: classification.intent,
      intentConfidence: classification.confidence,
      entities: [],
      summary:
        'Could not find any matching nodes in the graph for your query. Try using exact class names, function names, or file paths.',
      data: null,
    };
  }

  // Step 6: Execute graph operation
  const data = executeOperation(store, classification.intent, entities, question, fusion);

  // Step 7: Format response
  const summary = formatter.format(classification.intent, entities, data, question);

  return {
    intent: classification.intent,
    intentConfidence: classification.confidence,
    entities,
    summary,
    data,
  };
}

/**
 * Execute the appropriate graph operation based on classified intent.
 */
function executeOperation(
  store: GraphStore,
  intent: string,
  entities: readonly import('./types.js').ResolvedEntity[],
  question: string,
  fusion: FusionLayer
): unknown {
  const cql = new ContextQL(store);

  switch (intent) {
    case 'impact': {
      const rootId = entities[0]!.nodeId;
      const result = cql.execute({
        rootNodeIds: [rootId],
        bidirectional: true,
        maxDepth: 3,
      });

      const groups: Record<string, unknown[]> = {
        tests: [],
        docs: [],
        code: [],
        other: [],
      };

      for (const node of result.nodes) {
        if (node.id === rootId) continue;
        if (TEST_TYPES.has(node.type)) {
          groups['tests']!.push(node);
        } else if (DOC_TYPES.has(node.type)) {
          groups['docs']!.push(node);
        } else if (CODE_TYPES.has(node.type)) {
          groups['code']!.push(node);
        } else {
          groups['other']!.push(node);
        }
      }

      return groups;
    }

    case 'find': {
      return fusion.search(question, 10);
    }

    case 'relationships': {
      const rootId = entities[0]!.nodeId;
      const result = cql.execute({
        rootNodeIds: [rootId],
        bidirectional: true,
        maxDepth: 1,
      });
      return { nodes: result.nodes, edges: result.edges };
    }

    case 'explain': {
      const searchResults = fusion.search(question, 10);

      const contextBlocks: Array<{
        rootNode: string;
        score: number;
        nodes: unknown[];
        edges: unknown[];
      }> = [];

      // Use resolved entity as primary root, fall back to search results
      const rootIds =
        entities.length > 0
          ? [entities[0]!.nodeId]
          : searchResults.slice(0, 3).map((r) => r.nodeId);

      for (const rootId of rootIds) {
        const expanded = cql.execute({
          rootNodeIds: [rootId],
          maxDepth: 2,
        });
        const matchingResult = searchResults.find((r) => r.nodeId === rootId);
        contextBlocks.push({
          rootNode: rootId,
          score: matchingResult?.score ?? 1.0,
          nodes: expanded.nodes as unknown[],
          edges: expanded.edges as unknown[],
        });
      }

      return { searchResults, context: contextBlocks };
    }

    case 'anomaly': {
      const adapter = new GraphAnomalyAdapter(store);
      return adapter.detect();
    }

    default:
      return null;
  }
}
```

**Steps:**

1. Read `packages/graph/src/nlq/index.ts` (already read)
2. Replace the entire file with the implementation above
3. Run: `npx vitest run packages/graph/tests/nlq/` to verify existing NLQ tests still pass
4. Run: `harness validate`
5. Commit: `feat(nlq): implement askGraph orchestrator wiring pipeline together`

---

### Task 2: Write integration tests for askGraph

**Depends on:** Task 1
**Files:** `packages/graph/tests/nlq/askGraph.test.ts`

Create integration tests that build a real GraphStore with test nodes and edges, then call `askGraph` with various questions and verify the full pipeline.

**Test fixture graph:**

```
Nodes:
  class:AuthService  (type: class, name: AuthService, path: src/services/auth-service.ts)
  class:UserService  (type: class, name: UserService, path: src/services/user-service.ts)
  fn:hashPassword    (type: function, name: hashPassword, path: src/utils/hash.ts)
  file:middleware.ts  (type: file, name: middleware.ts, path: src/auth/middleware.ts)
  file:auth.test.ts  (type: test_result, name: auth.test.ts, path: tests/auth.test.ts)
  doc:auth-adr       (type: adr, name: auth-adr, path: docs/adr/auth.md)

Edges:
  middleware.ts --imports--> AuthService
  AuthService  --calls-->   hashPassword
  auth.test.ts --references--> AuthService
  auth-adr     --documents-->  AuthService
  UserService  --calls-->   AuthService
```

**Test cases:**

1. **impact intent** — `askGraph(store, "what breaks if I change AuthService?")`:
   - `result.intent` === `'impact'`
   - `result.intentConfidence` > 0.3
   - `result.entities.length` >= 1, first entity resolves to `class:AuthService`
   - `result.data` has `code`, `tests`, `docs`, `other` keys
   - `result.summary` is a non-empty string containing "AuthService"

2. **find intent** — `askGraph(store, "where is hashPassword?")`:
   - `result.intent` === `'find'`
   - `result.data` is an array with length > 0
   - `result.summary` contains "match"

3. **relationships intent** — `askGraph(store, "what calls AuthService?")`:
   - `result.intent` === `'relationships'`
   - `result.data` has `nodes` and `edges` arrays
   - `result.summary` contains "AuthService"

4. **explain intent** — `askGraph(store, "what is AuthService?")`:
   - `result.intent` === `'explain'`
   - `result.data` has `searchResults` and `context` properties
   - `result.summary` contains "AuthService"

5. **anomaly intent** — `askGraph(store, "what looks wrong in the codebase?")`:
   - `result.intent` === `'anomaly'`
   - `result.data` has `statisticalOutliers` and `articulationPoints`
   - `result.summary` contains "anomal" (case insensitive)

6. **low confidence** — `askGraph(store, "hello world")`:
   - `result.intentConfidence` < 0.3
   - `result.suggestions` is defined and has length > 0
   - `result.data` === null

7. **no entity resolution** — `askGraph(store, "what breaks if I change NonExistentThing?")`:
   - `result.intent` === `'impact'`
   - `result.entities.length` === 0
   - `result.data` === null
   - `result.summary` contains "Could not find"

**Exact file content for `packages/graph/tests/nlq/askGraph.test.ts`:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { askGraph } from '../../src/nlq/index.js';
import type { GraphNode, GraphEdge } from '../../src/types.js';

describe('askGraph (integration)', () => {
  let store: GraphStore;

  const authService: GraphNode = {
    id: 'class:AuthService',
    type: 'class',
    name: 'AuthService',
    path: 'src/services/auth-service.ts',
    metadata: {},
  };

  const userService: GraphNode = {
    id: 'class:UserService',
    type: 'class',
    name: 'UserService',
    path: 'src/services/user-service.ts',
    metadata: {},
  };

  const hashPassword: GraphNode = {
    id: 'fn:hashPassword',
    type: 'function',
    name: 'hashPassword',
    path: 'src/utils/hash.ts',
    metadata: {},
  };

  const middleware: GraphNode = {
    id: 'file:middleware.ts',
    type: 'file',
    name: 'middleware.ts',
    path: 'src/auth/middleware.ts',
    metadata: {},
  };

  const authTest: GraphNode = {
    id: 'test:auth.test.ts',
    type: 'test_result',
    name: 'auth.test.ts',
    path: 'tests/auth.test.ts',
    metadata: {},
  };

  const authAdr: GraphNode = {
    id: 'doc:auth-adr',
    type: 'adr',
    name: 'auth-adr',
    path: 'docs/adr/auth.md',
    metadata: {},
  };

  const edges: GraphEdge[] = [
    { from: 'file:middleware.ts', to: 'class:AuthService', type: 'imports', metadata: {} },
    { from: 'class:AuthService', to: 'fn:hashPassword', type: 'calls', metadata: {} },
    { from: 'test:auth.test.ts', to: 'class:AuthService', type: 'references', metadata: {} },
    { from: 'doc:auth-adr', to: 'class:AuthService', type: 'documents', metadata: {} },
    { from: 'class:UserService', to: 'class:AuthService', type: 'calls', metadata: {} },
  ];

  beforeEach(() => {
    store = new GraphStore();
    store.addNode(authService);
    store.addNode(userService);
    store.addNode(hashPassword);
    store.addNode(middleware);
    store.addNode(authTest);
    store.addNode(authAdr);
    for (const edge of edges) {
      store.addEdge(edge);
    }
  });

  it('handles impact intent end-to-end', async () => {
    const result = await askGraph(store, 'what breaks if I change AuthService?');
    expect(result.intent).toBe('impact');
    expect(result.intentConfidence).toBeGreaterThan(0.3);
    expect(result.entities.length).toBeGreaterThanOrEqual(1);
    expect(result.entities[0]!.nodeId).toBe('class:AuthService');

    const data = result.data as Record<string, unknown[]>;
    expect(data).toHaveProperty('code');
    expect(data).toHaveProperty('tests');
    expect(data).toHaveProperty('docs');
    expect(data).toHaveProperty('other');
    expect(result.summary).toBeTruthy();
    expect(result.summary).toContain('AuthService');
  });

  it('handles find intent end-to-end', async () => {
    const result = await askGraph(store, 'where is hashPassword?');
    expect(result.intent).toBe('find');
    expect(result.intentConfidence).toBeGreaterThan(0.3);
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as unknown[]).length).toBeGreaterThan(0);
    expect(result.summary).toContain('match');
  });

  it('handles relationships intent end-to-end', async () => {
    const result = await askGraph(store, 'what calls AuthService?');
    expect(result.intent).toBe('relationships');
    expect(result.intentConfidence).toBeGreaterThan(0.3);

    const data = result.data as { nodes: unknown[]; edges: unknown[] };
    expect(data).toHaveProperty('nodes');
    expect(data).toHaveProperty('edges');
    expect(result.summary).toContain('AuthService');
  });

  it('handles explain intent end-to-end', async () => {
    const result = await askGraph(store, 'what is AuthService?');
    expect(result.intent).toBe('explain');
    expect(result.intentConfidence).toBeGreaterThan(0.3);

    const data = result.data as { searchResults: unknown[]; context: unknown[] };
    expect(data).toHaveProperty('searchResults');
    expect(data).toHaveProperty('context');
    expect(result.summary).toContain('AuthService');
  });

  it('handles anomaly intent end-to-end', async () => {
    const result = await askGraph(store, 'what looks wrong in the codebase?');
    expect(result.intent).toBe('anomaly');
    expect(result.intentConfidence).toBeGreaterThan(0.3);

    const data = result.data as { statisticalOutliers: unknown[]; articulationPoints: unknown[] };
    expect(data).toHaveProperty('statisticalOutliers');
    expect(data).toHaveProperty('articulationPoints');
    expect(result.summary.toLowerCase()).toContain('anomal');
  });

  it('returns suggestions when confidence is low', async () => {
    const result = await askGraph(store, 'hello world');
    expect(result.intentConfidence).toBeLessThan(0.3);
    expect(result.suggestions).toBeDefined();
    expect(result.suggestions!.length).toBeGreaterThan(0);
    expect(result.data).toBeNull();
  });

  it('returns helpful message when entity cannot be resolved for entity-requiring intent', async () => {
    const result = await askGraph(store, 'what breaks if I change NonExistentThing?');
    expect(result.intent).toBe('impact');
    expect(result.entities).toHaveLength(0);
    expect(result.data).toBeNull();
    expect(result.summary).toContain('Could not find');
  });

  it('always returns a valid AskGraphResult shape', async () => {
    const questions = [
      'what breaks if I change AuthService?',
      'where is hashPassword?',
      'what calls UserService?',
      'what is AuthService?',
      'what looks wrong?',
      'hello world',
    ];

    for (const q of questions) {
      const result = await askGraph(store, q);
      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('intentConfidence');
      expect(result).toHaveProperty('entities');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('data');
      expect(typeof result.summary).toBe('string');
      expect(result.summary.length).toBeGreaterThan(0);
    }
  });
});
```

**Steps:**

1. Create `packages/graph/tests/nlq/askGraph.test.ts` with the content above
2. Run: `npx vitest run packages/graph/tests/nlq/askGraph.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(nlq): add askGraph integration tests covering all intents and edge cases`

---

### Task 3: Export NLQ public API from graph package index

**Depends on:** Task 1
**Files:** `packages/graph/src/index.ts`

Add NLQ exports to the package barrel file so consumers can import `askGraph` and related types from `@harness-engineering/graph`.

**Add the following block** after the existing Entropy section (after line 84) in `packages/graph/src/index.ts`:

```typescript
// NLQ
export {
  askGraph,
  INTENTS,
  IntentClassifier,
  EntityExtractor,
  EntityResolver,
  ResponseFormatter,
} from './nlq/index.js';
export type { Intent, ClassificationResult, ResolvedEntity, AskGraphResult } from './nlq/index.js';
```

**Steps:**

1. Read `packages/graph/src/index.ts` (already read)
2. Add the NLQ export block after the Entropy section
3. Run: `npx tsc --noEmit -p packages/graph/tsconfig.json` to verify no type errors
4. Run: `harness validate`
5. Commit: `feat(graph): export NLQ public API from package index`

---

### Task 4: Run full test suite and verify all observable truths

**Depends on:** Task 1, Task 2, Task 3
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run: `npx vitest run packages/graph/tests/nlq/` -- all NLQ tests pass (existing + new)
2. Run: `npx vitest run packages/graph/` -- full graph package test suite passes
3. Run: `npx tsc --noEmit -p packages/graph/tsconfig.json` -- no type errors
4. Run: `harness validate` -- passes
5. Verify observable truths 1-9 by inspecting test output

If any test fails, fix the implementation in Task 1 and re-run.

## Known Issues (out of scope)

- **ResponseFormatter.formatRelationships** uses `edge.source`/`edge.target` but `GraphEdge` uses `from`/`to`. This means relationship summaries will report 0/0 for outbound/inbound counts. This is a Phase 5 bug that should be fixed separately -- the orchestrator correctly passes ContextQL results through, and the integration tests verify the data shape rather than the summary counts.
