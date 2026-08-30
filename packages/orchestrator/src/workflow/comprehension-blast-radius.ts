/**
 * #1690 — graph-backed 1-hop blast-radius resolver for the dispatch pre-warm.
 *
 * The compiled-comprehension pre-warm (`resolveLeafPrewarm`) can enrich a leaf's
 * seed modules with their DIRECT importers — the code that depends on the leaf,
 * i.e. its 1-hop blast radius (F3=a: 1-hop, NOT the transitive closure). This
 * module builds that `resolveBlastRadius` seam over a `@harness-engineering/graph`
 * `GraphStore`.
 *
 * Given a module DIRECTORY it: (1) finds the file nodes under that directory,
 * (2) reads their inbound `imports` edges (each edge's `from` node is a direct
 * importer), (3) maps each importer file path to its owning module directory,
 * and returns those directories (excluding the seed module itself), de-duped and
 * sorted. It NEVER throws — a hostile/empty graph yields `[]` — so it can be
 * wired into the best-effort dispatch pre-warm.
 */

import type { GraphStore, GraphNode } from '@harness-engineering/graph';

/** Posix-normalize a path and strip a trailing slash. */
function toPosix(p: string): string {
  return p.replaceAll('\\', '/').replace(/\/+$/, '');
}

/**
 * Owning module DIRECTORY of a file path: the dirname when the last segment is a
 * `name.ext` file, else the path itself (already a directory). Mirrors the
 * seed-derivation contract in `comprehension-prewarm.ts` so importer modules key
 * the same committed comprehension units.
 */
function moduleDirOfFile(filePath: string): string | null {
  const posix = toPosix(filePath);
  const slash = posix.lastIndexOf('/');
  if (slash === -1) return null;
  const last = posix.slice(slash + 1);
  return last.lastIndexOf('.') > 0 ? posix.slice(0, slash) : posix;
}

/** Whether `filePath` lives under module directory `dir` (or is that dir). */
function isUnderModuleDir(filePath: string, dir: string): boolean {
  const posix = toPosix(filePath);
  return posix === dir || posix.startsWith(`${dir}/`);
}

export interface GraphBlastRadiusResolver {
  (module: string): string[];
}

/**
 * Build a `resolveBlastRadius(module) => string[]` over a loaded `GraphStore`.
 * Returns the 1-hop importer module directories of the given module directory.
 * Best-effort: any failure (or an empty graph) degrades to `[]`.
 */
export function createGraphBlastRadiusResolver(store: GraphStore): GraphBlastRadiusResolver {
  // Snapshot the file nodes once; a dispatch pre-warm resolves only a handful of
  // seed modules, and the graph is immutable for the life of the resolver.
  let fileNodes: GraphNode[] = [];
  try {
    fileNodes = store.findNodes({ type: 'file' });
  } catch {
    fileNodes = [];
  }

  return (module: string): string[] => {
    try {
      const dir = toPosix(module);
      if (!dir) return [];
      const importerDirs = new Set<string>();
      for (const node of fileNodes) {
        if (!node.path || !isUnderModuleDir(node.path, dir)) continue;
        // Inbound `imports` edges: each `from` node imports this file.
        for (const edge of store.getEdges({ to: node.id, type: 'imports' })) {
          const importer = store.getNode(edge.from);
          if (!importer?.path) continue;
          const importerDir = moduleDirOfFile(importer.path);
          // 1-hop only, and never the seed module itself.
          if (importerDir && importerDir !== dir) importerDirs.add(importerDir);
        }
      }
      return [...importerDirs].sort();
    } catch {
      return [];
    }
  };
}
