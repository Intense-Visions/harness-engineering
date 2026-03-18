import * as path from 'node:path';
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
      const dir = path.dirname(file.path);
      if (!directories.has(dir)) {
        directories.set(dir, []);
      }
      directories.get(dir)!.push(file.id);
    }

    // Create module nodes for directories with files
    for (const [dir, fileIds] of directories) {
      if (fileIds.length < 1) continue;
      const moduleId = `module:${dir}`;
      const moduleName = dir === '.' ? 'root' : path.basename(dir);

      this.store.addNode({
        id: moduleId,
        type: 'module',
        name: moduleName,
        path: dir,
        metadata: { fileCount: fileIds.length },
      });

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
    const stack: string[] = [];

    const dfs = (nodeId: string): void => {
      if (inStack.has(nodeId)) {
        // Found a cycle
        const cycleStart = stack.indexOf(nodeId);
        if (cycleStart !== -1) {
          cycles.push(stack.slice(cycleStart).concat(nodeId));
        }
        return;
      }

      if (visited.has(nodeId)) return;

      visited.add(nodeId);
      inStack.add(nodeId);
      stack.push(nodeId);

      const importEdges = this.store.getEdges({ from: nodeId, type: 'imports' });
      for (const edge of importEdges) {
        dfs(edge.to);
      }

      stack.pop();
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
