import { describe, it, expect } from 'vitest';
import { GraphStore, type GraphNode, type GraphEdge } from '@harness-engineering/graph';
import { createGraphBlastRadiusResolver } from './comprehension-blast-radius';

function fileNode(path: string): GraphNode {
  return { id: `file:${path}`, type: 'file', name: path, path, metadata: {} };
}

function importsEdge(fromPath: string, toPath: string): GraphEdge {
  return { from: `file:${fromPath}`, to: `file:${toPath}`, type: 'imports' };
}

/**
 * Graph shape (arrows = "imports"):
 *   packages/cli/src/bar.ts    ─▶ packages/core/src/foo.ts
 *   packages/api/src/baz.ts    ─▶ packages/core/src/foo.ts
 *   packages/web/src/deep.ts   ─▶ packages/cli/src/bar.ts     (2-hop from core)
 * So the 1-hop importers of module `packages/core/src` are the module dirs
 * `packages/cli/src` and `packages/api/src` — NOT `packages/web/src` (transitive).
 */
function buildStore(): GraphStore {
  const store = new GraphStore();
  for (const p of [
    'packages/core/src/foo.ts',
    'packages/cli/src/bar.ts',
    'packages/api/src/baz.ts',
    'packages/web/src/deep.ts',
  ]) {
    store.addNode(fileNode(p));
  }
  store.addEdge(importsEdge('packages/cli/src/bar.ts', 'packages/core/src/foo.ts'));
  store.addEdge(importsEdge('packages/api/src/baz.ts', 'packages/core/src/foo.ts'));
  store.addEdge(importsEdge('packages/web/src/deep.ts', 'packages/cli/src/bar.ts'));
  return store;
}

describe('createGraphBlastRadiusResolver — #1690 1-hop blast radius', () => {
  it('(SC4) returns the DIRECT (1-hop) importer module dirs of a module', () => {
    const resolve = createGraphBlastRadiusResolver(buildStore());
    expect(resolve('packages/core/src').sort()).toEqual(['packages/api/src', 'packages/cli/src']);
  });

  it('(SC4) does NOT include transitive (2-hop) importers', () => {
    const resolve = createGraphBlastRadiusResolver(buildStore());
    expect(resolve('packages/core/src')).not.toContain('packages/web/src');
  });

  it('reports the 1-hop importer of an intermediate module (cli imported by web)', () => {
    const resolve = createGraphBlastRadiusResolver(buildStore());
    expect(resolve('packages/cli/src')).toEqual(['packages/web/src']);
  });

  it('excludes the module itself when a file inside it imports a sibling in it', () => {
    const store = new GraphStore();
    store.addNode(fileNode('packages/core/src/a.ts'));
    store.addNode(fileNode('packages/core/src/b.ts'));
    store.addEdge(importsEdge('packages/core/src/a.ts', 'packages/core/src/b.ts'));
    const resolve = createGraphBlastRadiusResolver(store);
    expect(resolve('packages/core/src')).toEqual([]);
  });

  it('returns [] for a module with no importers and for an unknown module', () => {
    const resolve = createGraphBlastRadiusResolver(buildStore());
    expect(resolve('packages/web/src')).toEqual([]); // leaf importer, nobody imports it
    expect(resolve('packages/nope/src')).toEqual([]); // not in the graph
  });

  it('returns [] for an empty graph and never throws', () => {
    const resolve = createGraphBlastRadiusResolver(new GraphStore());
    expect(resolve('packages/core/src')).toEqual([]);
  });

  it('degrades to [] on a hostile store (never throws)', () => {
    const hostile = {
      findNodes: () => {
        throw new Error('boom');
      },
      getEdges: () => {
        throw new Error('boom');
      },
      getNode: () => {
        throw new Error('boom');
      },
    } as unknown as GraphStore;
    const resolve = createGraphBlastRadiusResolver(hostile);
    expect(resolve('packages/core/src')).toEqual([]);
  });
});
