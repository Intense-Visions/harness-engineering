import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GraphStore, resolveGraphDir } from '@harness-engineering/graph';
import { handleGetImpact } from './get-impact.js';
import { handleQueryGraph } from './query-graph.js';
import { handleComputeBlastRadius } from './compute-blast-radius.js';
import { clearGraphStoreCache } from '../../utils/graph-loader.js';

/**
 * WIRED proof for issue #1591: detailed-mode output of the graph retrieval
 * handlers is bounded on hub (high-degree) nodes.
 *
 * A hub file node is wired to 10 neighbors (above the configured ceiling of 3);
 * a small file node in a separate component has 2 neighbors (below it). The
 * ceiling is set via `graph.detailedMode.maxItems` in harness.config.json, which
 * also proves the config → resolveDetailCeiling wiring is live.
 */

const CEILING = 3;
const HUB_DEGREE = 10;

let projectDir: string;

function parse(res: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(res.content[0]!.text) as Record<string, unknown>;
}

beforeEach(async () => {
  clearGraphStoreCache();
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detail-ceiling-'));

  fs.writeFileSync(
    path.join(projectDir, 'harness.config.json'),
    JSON.stringify({ version: 1, graph: { detailedMode: { maxItems: CEILING } } })
  );

  const store = new GraphStore();
  const fileNode = (id: string, name: string, p: string) => ({
    id,
    type: 'file' as const,
    name,
    path: p,
    metadata: {},
  });
  // Hub component: file:hub.ts imports HUB_DEGREE neighbors (above the ceiling).
  store.addNode(fileNode('file:hub.ts', 'hub.ts', 'hub.ts'));
  for (let i = 0; i < HUB_DEGREE; i++) {
    store.addNode(fileNode(`file:nbr${i}.ts`, `nbr${i}.ts`, `nbr${i}.ts`));
    store.addEdge({ from: 'file:hub.ts', to: `file:nbr${i}.ts`, type: 'imports' });
  }
  // Small component: file:small.ts imports 2 neighbors (below the ceiling).
  store.addNode(fileNode('file:small.ts', 'small.ts', 'small.ts'));
  for (let i = 0; i < 2; i++) {
    store.addNode(fileNode(`file:s${i}.ts`, `s${i}.ts`, `s${i}.ts`));
    store.addEdge({ from: 'file:small.ts', to: `file:s${i}.ts`, type: 'imports' });
  }
  await store.save(resolveGraphDir(projectDir, 'write'));
  clearGraphStoreCache();
});

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true });
});

describe('get_impact detailed mode is bounded on hub nodes (#1591)', () => {
  it('truncates node + edge arrays and flags truncated with a continuation signal', async () => {
    const res = await handleGetImpact({
      path: projectDir,
      filePath: 'hub.ts',
      mode: 'detailed',
    });
    const body = parse(res);
    const impact = body['impact'] as Record<string, unknown[]>;
    const totalNodes = Object.values(impact).reduce((n, arr) => n + arr.length, 0);

    expect(totalNodes).toBeLessThanOrEqual(CEILING);
    expect((body['edges'] as unknown[]).length).toBeLessThanOrEqual(CEILING);
    expect(body['truncated']).toBe(true);
    const continuation = body['continuation'] as Record<string, unknown>;
    expect(continuation).toBeDefined();
    expect(continuation['maxItems']).toBe(CEILING);
  });

  it('leaves a small node (below the ceiling) unchanged', async () => {
    const res = await handleGetImpact({
      path: projectDir,
      filePath: 'small.ts',
      mode: 'detailed',
    });
    const body = parse(res);
    const impact = body['impact'] as Record<string, unknown[]>;
    const totalNodes = Object.values(impact).reduce((n, arr) => n + arr.length, 0);

    expect(totalNodes).toBe(2);
    expect(body['truncated']).toBe(false);
    expect(body['continuation']).toBeUndefined();
  });
});

describe('query_graph detailed mode bounds the edge array on hub nodes (#1591)', () => {
  it('truncates edges and flags truncated', async () => {
    const res = await handleQueryGraph({
      path: projectDir,
      rootNodeIds: ['file:hub.ts'],
      bidirectional: true,
      mode: 'detailed',
    });
    const body = parse(res);
    expect((body['edges'] as unknown[]).length).toBeLessThanOrEqual(CEILING);
    expect(body['truncated']).toBe(true);
    expect(body['continuation']).toBeDefined();
  });

  it('leaves a small node unchanged', async () => {
    const res = await handleQueryGraph({
      path: projectDir,
      rootNodeIds: ['file:small.ts'],
      bidirectional: true,
      mode: 'detailed',
    });
    const body = parse(res);
    expect((body['edges'] as unknown[]).length).toBe(2);
    expect(body['truncated']).toBe(false);
  });
});

describe('compute_blast_radius detailed mode is bounded on hub nodes (#1591)', () => {
  it('truncates the cascade payload and flags truncated', async () => {
    const res = await handleComputeBlastRadius({
      path: projectDir,
      nodeId: 'file:hub.ts',
      mode: 'detailed',
    });
    const body = parse(res);
    expect((body['flatSummary'] as unknown[]).length).toBeLessThanOrEqual(CEILING);
    for (const layer of body['layers'] as Array<{ nodes: unknown[] }>) {
      expect(layer.nodes.length).toBeLessThanOrEqual(CEILING);
    }
    expect(body['truncated']).toBe(true);
    expect(body['continuation']).toBeDefined();
  });

  it('leaves a small node unchanged', async () => {
    const res = await handleComputeBlastRadius({
      path: projectDir,
      nodeId: 'file:small.ts',
      mode: 'detailed',
    });
    const body = parse(res);
    expect((body['flatSummary'] as unknown[]).length).toBe(2);
    expect(body['truncated']).toBe(false);
    expect(body['continuation']).toBeUndefined();
  });
});
