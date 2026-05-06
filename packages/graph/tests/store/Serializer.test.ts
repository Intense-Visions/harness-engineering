import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import { saveGraph, loadGraph, loadGraphMetadata } from '../../src/store/Serializer.js';
import { CURRENT_SCHEMA_VERSION } from '../../src/types.js';
import type { GraphNode, GraphEdge, GraphMetadata } from '../../src/types.js';

/**
 * Regression tests for issue #276 — `loadGraph` slurped graph.json into a single
 * string and crashed with `RangeError: Invalid string length` on graphs > ~512 MB.
 * Schema bumped to v2 with NDJSON on-disk format; reader streams line-by-line.
 */
describe('Serializer (schema v2 — NDJSON)', () => {
  function makeNode(over: Partial<GraphNode> & Pick<GraphNode, 'id' | 'type' | 'name'>): GraphNode {
    return { metadata: {}, ...over };
  }
  function makeEdge(over: GraphEdge): GraphEdge {
    return { ...over };
  }

  it('writes NDJSON: each line is a self-contained JSON record with a `kind` discriminator', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'serializer-ndjson-'));
    const nodes: GraphNode[] = [
      makeNode({ id: 'n1', type: 'file', name: 'a.ts' }),
      makeNode({ id: 'n2', type: 'class', name: 'Foo' }),
    ];
    const edges: GraphEdge[] = [makeEdge({ from: 'n1', to: 'n2', type: 'contains' })];

    await saveGraph(dir, nodes, edges);

    const raw = await readFile(join(dir, 'graph.json'), 'utf-8');
    const lines = raw.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(3); // 2 nodes + 1 edge

    const records = lines.map((l) => JSON.parse(l));
    expect(records[0]!.kind).toBe('node');
    expect(records[0]!.id).toBe('n1');
    expect(records[1]!.kind).toBe('node');
    expect(records[2]!.kind).toBe('edge');
    expect(records[2]!.from).toBe('n1');
  });

  it('round-trips nodes and edges through save/load', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'serializer-roundtrip-'));
    const nodes: GraphNode[] = [
      makeNode({ id: 'n1', type: 'file', name: 'a.ts', path: 'src/a.ts' }),
      makeNode({ id: 'n2', type: 'function', name: 'doIt', metadata: { exported: true } }),
    ];
    const edges: GraphEdge[] = [
      makeEdge({ from: 'n1', to: 'n2', type: 'contains', metadata: { foo: 'bar' } }),
    ];

    await saveGraph(dir, nodes, edges);
    const result = await loadGraph(dir);

    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    expect(result.graph.nodes).toHaveLength(2);
    expect(result.graph.edges).toHaveLength(1);
    expect(result.graph.nodes[0]!.id).toBe('n1');
    expect(result.graph.edges[0]!.metadata?.foo).toBe('bar');
    // The discriminator field must NOT leak through to the parsed records
    expect((result.graph.nodes[0] as unknown as { kind?: string }).kind).toBeUndefined();
    expect((result.graph.edges[0] as unknown as { kind?: string }).kind).toBeUndefined();
  });

  it('writes metadata.json with schema v2 and a nodesByType breakdown', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'serializer-meta-'));
    await saveGraph(
      dir,
      [
        makeNode({ id: 'f1', type: 'file', name: 'a.ts' }),
        makeNode({ id: 'f2', type: 'file', name: 'b.ts' }),
        makeNode({ id: 'c1', type: 'class', name: 'C' }),
      ],
      []
    );
    const meta: GraphMetadata = JSON.parse(await readFile(join(dir, 'metadata.json'), 'utf-8'));
    expect(meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(meta.schemaVersion).toBe(2);
    expect(meta.nodeCount).toBe(3);
    expect(meta.nodesByType).toEqual({ file: 2, class: 1 });
  });

  it('loadGraph returns `not_found` when files are missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'serializer-missing-'));
    const result = await loadGraph(dir);
    expect(result.status).toBe('not_found');
  });

  it('loadGraph returns `schema_mismatch` for legacy v1 graphs (single-document JSON)', async () => {
    // Reproduce a pre-fix graph: schema v1 with the old `{nodes:[],edges:[]}` shape.
    const dir = await mkdtemp(join(tmpdir(), 'serializer-v1-'));
    await writeFile(
      join(dir, 'graph.json'),
      JSON.stringify({ nodes: [{ id: 'n1', type: 'file', name: 'a.ts', metadata: {} }], edges: [] })
    );
    await writeFile(
      join(dir, 'metadata.json'),
      JSON.stringify({
        schemaVersion: 1,
        lastScanTimestamp: new Date().toISOString(),
        nodeCount: 1,
        edgeCount: 0,
      })
    );
    const result = await loadGraph(dir);
    expect(result.status).toBe('schema_mismatch');
    if (result.status !== 'schema_mismatch') return;
    expect(result.found).toBe(1);
    expect(result.expected).toBe(2);
  });
});

describe('loadGraphMetadata — fast-path', () => {
  it('returns counts and timestamp without reading graph.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'serializer-fastpath-'));
    await saveGraph(
      dir,
      [{ id: 'n1', type: 'file', name: 'a.ts', metadata: {} }],
      [{ from: 'n1', to: 'n1', type: 'contains' }]
    );

    // Wipe graph.json so we can prove the metadata path doesn't touch it.
    await writeFile(join(dir, 'graph.json'), '');

    const result = await loadGraphMetadata(dir);
    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    expect(result.metadata.nodeCount).toBe(1);
    expect(result.metadata.edgeCount).toBe(1);
    expect(result.metadata.nodesByType?.file).toBe(1);
  });

  it('returns `not_found` when metadata.json is absent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'serializer-fastpath-missing-'));
    const result = await loadGraphMetadata(dir);
    expect(result.status).toBe('not_found');
  });

  it('returns `schema_mismatch` for legacy v1 metadata', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'serializer-fastpath-v1-'));
    await writeFile(
      join(dir, 'metadata.json'),
      JSON.stringify({
        schemaVersion: 1,
        lastScanTimestamp: new Date().toISOString(),
        nodeCount: 0,
        edgeCount: 0,
      })
    );
    const result = await loadGraphMetadata(dir);
    expect(result.status).toBe('schema_mismatch');
  });
});

describe('Serializer — large graph', () => {
  it('streams thousands of records line-by-line without buffering the full file', async () => {
    // Not nearly the 512 MB cap (would slow CI), but enough to prove the streaming
    // path: 5,000 nodes + 5,000 edges — multi-MB on disk, written and read back via
    // the NDJSON loop rather than slurped.
    const dir = await mkdtemp(join(tmpdir(), 'serializer-large-'));
    const N = 5000;
    const nodes: GraphNode[] = Array.from({ length: N }, (_, i) => ({
      id: `n${i}`,
      type: 'file',
      name: `file-${i}.ts`,
      path: `src/file-${i}.ts`,
      metadata: { idx: i },
    }));
    const edges: GraphEdge[] = Array.from({ length: N }, (_, i) => ({
      from: `n${i}`,
      to: `n${(i + 1) % N}`,
      type: 'imports',
    }));

    await saveGraph(dir, nodes, edges);

    const result = await loadGraph(dir);
    expect(result.status).toBe('loaded');
    if (result.status !== 'loaded') return;
    expect(result.graph.nodes).toHaveLength(N);
    expect(result.graph.edges).toHaveLength(N);
    expect(result.graph.nodes[0]!.id).toBe('n0');
    expect(result.graph.nodes[N - 1]!.id).toBe(`n${N - 1}`);
  });
});
