/**
 * Pagination integration tests — Phase 5
 *
 * Two concerns:
 * 1. Schema completeness: all 8 tool definitions have offset/limit (and section for
 *    gather_context) with sort-key descriptions.
 * 2. Multi-page fetch: agent-style calls to query_graph and get_relationships where
 *    page 1 has hasMore=true and page 2 returns non-overlapping items.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

import { queryGraphDefinition, handleQueryGraph } from '../../../src/mcp/tools/graph/index.js';
import {
  getRelationshipsDefinition,
  handleGetRelationships,
} from '../../../src/mcp/tools/graph/index.js';
import { detectAnomaliesDefinition } from '../../../src/mcp/tools/graph/index.js';
import { codeOutlineDefinition } from '../../../src/mcp/tools/code-nav.js';
import { reviewChangesDefinition } from '../../../src/mcp/tools/review-changes.js';
import { runCodeReviewDefinition } from '../../../src/mcp/tools/review-pipeline.js';
import { gatherContextDefinition } from '../../../src/mcp/tools/gather-context.js';
import { getDecayTrendsDefinition } from '../../../src/mcp/tools/decay-trends.js';

// ── helpers ────────────────────────────────────────────────────────────

function assertPaginationSchema(
  def: { inputSchema: { properties: Record<string, { type?: string; description?: string }> } },
  toolName: string,
  expectedSortKeyFragment: string
) {
  const props = def.inputSchema.properties;
  expect(props, `${toolName}: offset missing from schema`).toHaveProperty('offset');
  expect(props, `${toolName}: limit missing from schema`).toHaveProperty('limit');
  expect(props.offset.type, `${toolName}: offset.type`).toBe('number');
  expect(props.limit.type, `${toolName}: limit.type`).toBe('number');
  expect(
    props.offset.description,
    `${toolName}: offset description must mention sort key`
  ).toContain(expectedSortKeyFragment);
  expect(props.limit.description, `${toolName}: limit description must mention default`).toMatch(
    /default:\s*\d+/i
  );
}

let tmpDir: string;

async function createTestGraph(dir: string) {
  const { GraphStore } = await import('@harness-engineering/graph');
  const store = new GraphStore();

  // 6 nodes with varying connectivity so sort order is deterministic
  const nodes = [
    { id: 'file:a.ts', name: 'a.ts', path: 'a.ts' },
    { id: 'file:b.ts', name: 'b.ts', path: 'b.ts' },
    { id: 'file:c.ts', name: 'c.ts', path: 'c.ts' },
    { id: 'file:d.ts', name: 'd.ts', path: 'd.ts' },
    { id: 'file:e.ts', name: 'e.ts', path: 'e.ts' },
    { id: 'file:f.ts', name: 'f.ts', path: 'f.ts' },
  ];
  for (const n of nodes) {
    store.addNode({ ...n, type: 'file', metadata: {} });
  }

  // Hub edges: a.ts has the most edges, b.ts has fewer, rest minimal
  store.addEdge({ from: 'file:a.ts', to: 'file:b.ts', type: 'imports' });
  store.addEdge({ from: 'file:a.ts', to: 'file:c.ts', type: 'imports' });
  store.addEdge({ from: 'file:a.ts', to: 'file:d.ts', type: 'imports' });
  store.addEdge({ from: 'file:b.ts', to: 'file:e.ts', type: 'imports' });
  store.addEdge({ from: 'file:b.ts', to: 'file:f.ts', type: 'imports' });

  const graphDir = path.join(dir, '.harness', 'graph');
  await store.save(graphDir);
  return store;
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pagination-integration-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── Part 1: Schema completeness ────────────────────────────────────────

describe('schema completeness — all 8 tools have offset/limit with sort-key docs', () => {
  it('query_graph schema: offset/limit present, sort key documented', () => {
    assertPaginationSchema(queryGraphDefinition, 'query_graph', 'connectivity');
  });

  it('get_relationships schema: offset/limit present, sort key documented', () => {
    assertPaginationSchema(getRelationshipsDefinition, 'get_relationships', 'weight');
  });

  it('detect_anomalies schema: offset/limit present, sort key documented', () => {
    assertPaginationSchema(detectAnomaliesDefinition, 'detect_anomalies', 'Z-score');
  });

  it('code_outline schema: offset/limit present, sort key documented', () => {
    assertPaginationSchema(codeOutlineDefinition, 'code_outline', 'modification time');
  });

  it('review_changes schema: offset/limit present, sort key documented', () => {
    assertPaginationSchema(reviewChangesDefinition, 'review_changes', 'severity');
  });

  it('run_code_review schema: offset/limit present, sort key documented', () => {
    assertPaginationSchema(runCodeReviewDefinition, 'run_code_review', 'severity');
  });

  it('gather_context schema: offset/limit/section present with sort key documented', () => {
    const props = gatherContextDefinition.inputSchema.properties as Record<
      string,
      { type?: string; description?: string; enum?: string[] }
    >;
    expect(props).toHaveProperty('offset');
    expect(props).toHaveProperty('limit');
    expect(props).toHaveProperty('section');
    expect(props.offset.type).toBe('number');
    expect(props.limit.type).toBe('number');
    // Offset description documents sort behaviour per section
    expect(props.offset.description).toMatch(/section/i);
    // Limit description documents its default
    expect(props.limit.description).toMatch(/default:\s*\d+/i);
    // Section enum is complete and ordered
    expect(props.section.enum).toEqual(['graphContext', 'learnings', 'sessionSections']);
  });

  it('get_decay_trends schema: offset/limit present, sort key documented', () => {
    assertPaginationSchema(getDecayTrendsDefinition, 'get_decay_trends', 'decay magnitude');
  });
});

// ── Part 2: Multi-page fetch (agent-style) ─────────────────────────────

describe('multi-page fetch — query_graph', () => {
  it('page 1 with limit=2 returns hasMore=true when graph has >2 nodes', async () => {
    await createTestGraph(tmpDir);
    const page1 = await handleQueryGraph({
      path: tmpDir,
      rootNodeIds: ['file:a.ts'],
      limit: 2,
    });

    expect(page1.isError).toBeUndefined();
    const data1 = JSON.parse(page1.content[0].text);
    expect(data1.nodes).toHaveLength(2);
    expect(data1.pagination.offset).toBe(0);
    expect(data1.pagination.limit).toBe(2);
    expect(data1.pagination.hasMore).toBe(true);
  });

  it('page 2 (offset=2, limit=2) returns non-overlapping nodes vs page 1', async () => {
    await createTestGraph(tmpDir);

    const page1 = await handleQueryGraph({
      path: tmpDir,
      rootNodeIds: ['file:a.ts'],
      limit: 2,
    });
    const data1 = JSON.parse(page1.content[0].text);
    const page1Ids = new Set(data1.nodes.map((n: { id: string }) => n.id));

    const page2 = await handleQueryGraph({
      path: tmpDir,
      rootNodeIds: ['file:a.ts'],
      offset: 2,
      limit: 2,
    });
    expect(page2.isError).toBeUndefined();
    const data2 = JSON.parse(page2.content[0].text);

    // page 2 offset is reported correctly
    expect(data2.pagination.offset).toBe(2);

    // No node id overlap between page 1 and page 2
    for (const node of data2.nodes as Array<{ id: string }>) {
      expect(page1Ids.has(node.id)).toBe(false);
    }
  });

  it('all pages combined cover the full node set', async () => {
    await createTestGraph(tmpDir);

    // Fetch all nodes in one call to know total
    const allResult = await handleQueryGraph({
      path: tmpDir,
      rootNodeIds: ['file:a.ts'],
      limit: 100,
    });
    const allData = JSON.parse(allResult.content[0].text);
    const totalNodes: number = allData.pagination.total;

    // Now page through with limit=2 and collect all ids
    const collectedIds = new Set<string>();
    let offset = 0;
    let hasMore = true;
    let iterations = 0;
    const MAX_ITERATIONS = 50;
    while (hasMore) {
      if (++iterations > MAX_ITERATIONS) throw new Error('pagination loop did not terminate');

      const result = await handleQueryGraph({
        path: tmpDir,
        rootNodeIds: ['file:a.ts'],
        offset,
        limit: 2,
      });
      const data = JSON.parse(result.content[0].text);
      for (const node of data.nodes as Array<{ id: string }>) {
        collectedIds.add(node.id);
      }
      hasMore = data.pagination.hasMore;
      offset += 2;
    }

    expect(collectedIds.size).toBe(totalNodes);
  });
});

describe('multi-page fetch — get_relationships', () => {
  it('page 1 with limit=1 returns hasMore=true when node has >1 outbound edge', async () => {
    await createTestGraph(tmpDir);
    const page1 = await handleGetRelationships({
      path: tmpDir,
      nodeId: 'file:a.ts',
      direction: 'outbound',
      limit: 1,
    });

    expect(page1.isError).toBeUndefined();
    const data1 = JSON.parse(page1.content[0].text);
    expect(data1.edges).toHaveLength(1);
    expect(data1.pagination.offset).toBe(0);
    expect(data1.pagination.limit).toBe(1);
    // a.ts has 3 outbound edges, so hasMore must be true
    expect(data1.pagination.hasMore).toBe(true);
  });

  it('page 2 (offset=1, limit=1) returns a different edge than page 1', async () => {
    await createTestGraph(tmpDir);

    const page1 = await handleGetRelationships({
      path: tmpDir,
      nodeId: 'file:a.ts',
      direction: 'outbound',
      limit: 1,
    });
    const data1 = JSON.parse(page1.content[0].text);
    const page1EdgeTo = data1.edges[0].to;

    const page2 = await handleGetRelationships({
      path: tmpDir,
      nodeId: 'file:a.ts',
      direction: 'outbound',
      offset: 1,
      limit: 1,
    });
    expect(page2.isError).toBeUndefined();
    const data2 = JSON.parse(page2.content[0].text);

    expect(data2.pagination.offset).toBe(1);
    expect(data2.edges).toHaveLength(1);
    // The edge on page 2 must be a different edge than page 1
    expect(data2.edges[0].to).not.toBe(page1EdgeTo);
  });

  it('all pages combined cover the complete edge set', async () => {
    await createTestGraph(tmpDir);

    const allResult = await handleGetRelationships({
      path: tmpDir,
      nodeId: 'file:a.ts',
      direction: 'outbound',
      limit: 100,
    });
    const allData = JSON.parse(allResult.content[0].text);
    const totalEdges: number = allData.pagination.total;

    const collectedEdges = new Set<string>();
    let offset = 0;
    let hasMore = true;
    let iterations = 0;
    const MAX_ITERATIONS = 50;
    while (hasMore) {
      if (++iterations > MAX_ITERATIONS) throw new Error('pagination loop did not terminate');

      const result = await handleGetRelationships({
        path: tmpDir,
        nodeId: 'file:a.ts',
        direction: 'outbound',
        offset,
        limit: 1,
      });
      const data = JSON.parse(result.content[0].text);
      for (const edge of data.edges as Array<{ from: string; to: string }>) {
        collectedEdges.add(`${edge.from}->${edge.to}`);
      }
      hasMore = data.pagination.hasMore;
      offset += 1;
    }

    expect(collectedEdges.size).toBe(totalEdges);
  });
});
