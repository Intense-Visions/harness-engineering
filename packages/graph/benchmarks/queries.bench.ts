import { bench, describe } from 'vitest';
import { GraphStore } from '../src/store/GraphStore.js';
import { ContextQL } from '../src/query/ContextQL.js';
import { groupNodesByImpact } from '../src/query/groupImpact.js';
import type { GraphNode, GraphEdge } from '../src/types.js';

// --- Helpers ---

const mkNode = (id: string, type: GraphNode['type'], name: string): GraphNode => ({
  id,
  type,
  name,
  metadata: {},
});

const mkEdge = (from: string, to: string, type: GraphEdge['type']): GraphEdge => ({
  from,
  to,
  type,
});

// --- Fixtures: build a graph with ~100 nodes ---

function buildMediumGraph(): { store: GraphStore; nodeIds: string[] } {
  const store = new GraphStore();
  const nodeIds: string[] = [];

  // 10 modules, each with 5 files, each file with 1 function = 60 nodes
  for (let m = 0; m < 10; m++) {
    const moduleId = `module:mod${m}`;
    store.addNode(mkNode(moduleId, 'module', `mod${m}`));
    nodeIds.push(moduleId);

    for (let f = 0; f < 5; f++) {
      const fileId = `file:mod${m}/file${f}.ts`;
      store.addNode(mkNode(fileId, 'file', `file${f}.ts`));
      nodeIds.push(fileId);
      store.addEdge(mkEdge(moduleId, fileId, 'contains'));

      const fnId = `fn:mod${m}/file${f}/main`;
      store.addNode(mkNode(fnId, 'function', `main_${m}_${f}`));
      nodeIds.push(fnId);
      store.addEdge(mkEdge(fileId, fnId, 'contains'));
    }
  }

  // Cross-module imports: each module imports the next
  for (let m = 0; m < 9; m++) {
    store.addEdge(mkEdge(`file:mod${m}/file0.ts`, `file:mod${m + 1}/file0.ts`, 'imports'));
  }

  // Add some test_result and document nodes for groupNodesByImpact
  for (let t = 0; t < 10; t++) {
    const testId = `test:result${t}`;
    store.addNode(mkNode(testId, 'test_result', `test${t}`));
    nodeIds.push(testId);
    store.addEdge(mkEdge(testId, `fn:mod${t}/file0/main`, 'references'));
  }

  for (let d = 0; d < 5; d++) {
    const docId = `doc:adr${d}`;
    store.addNode(mkNode(docId, 'adr', `ADR-${d}`));
    nodeIds.push(docId);
    store.addEdge(mkEdge(docId, `file:mod${d}/file0.ts`, 'documents'));
  }

  return { store, nodeIds };
}

// Build the shared graph once at module level; each bench suite rebuilds as needed
const sharedGraph = buildMediumGraph();

// --- Benchmarks ---

describe('GraphStore', () => {
  bench('addNode - single node', () => {
    const g = buildMediumGraph();
    g.store.addNode(mkNode(`bench:temp:${Math.random()}`, 'file', 'temp.ts'));
  });

  bench('findNodes - by type', () => {
    sharedGraph.store.findNodes({ type: 'file' });
  });
});

describe('ContextQL', () => {
  bench('execute - depth 2 from module root', () => {
    const cql = new ContextQL(sharedGraph.store);
    cql.execute({
      rootNodeIds: ['module:mod0'],
      maxDepth: 2,
    });
  });
});

describe('groupNodesByImpact', () => {
  bench('categorize ~85 nodes', () => {
    const allNodes = sharedGraph.store.findNodes({});
    groupNodesByImpact(allNodes, 'module:mod0');
  });
});
