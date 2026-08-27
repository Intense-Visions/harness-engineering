import * as path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js';
import { TopologicalLinker } from '../../src/ingest/TopologicalLinker.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../__fixtures__/sample-project');

describe('Ingest-time edge provenance', () => {
  let store: GraphStore;

  beforeEach(async () => {
    store = new GraphStore();
    await new CodeIngestor(store).ingest(FIXTURE_DIR);
  });

  it('marks AST-explicit contains edges as EXTRACTED', () => {
    const contains = store.getEdges({ type: 'contains' });
    expect(contains.length).toBeGreaterThan(0);
    // File-structure contains edges are read directly from source.
    for (const edge of contains) {
      expect(edge.provenance).toBe('EXTRACTED');
    }
  });

  it('marks resolver-derived import edges as INFERRED', () => {
    const imports = store.getEdges({ type: 'imports' });
    expect(imports.length).toBeGreaterThan(0);
    for (const edge of imports) {
      expect(edge.provenance).toBe('INFERRED');
    }
  });

  it('marks regex-heuristic calls edges as INFERRED', () => {
    const calls = store.getEdges({ type: 'calls' });
    // The fixture may or may not produce calls edges; only assert when present.
    for (const edge of calls) {
      expect(edge.provenance).toBe('INFERRED');
    }
  });

  it('marks directory-derived module contains edges as INFERRED', () => {
    new TopologicalLinker(store).link();
    const moduleContains = store
      .getEdges({ type: 'contains' })
      .filter((e) => e.from.startsWith('module:'));
    expect(moduleContains.length).toBeGreaterThan(0);
    for (const edge of moduleContains) {
      expect(edge.provenance).toBe('INFERRED');
    }
  });

  it('provenance survives round-tripping through the store', () => {
    const [edge] = store.getEdges({ type: 'contains' });
    expect(edge).toBeDefined();
    expect(edge!.provenance).toBe('EXTRACTED');
  });
});
