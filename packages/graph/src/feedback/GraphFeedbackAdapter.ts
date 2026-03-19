import type { GraphStore } from '../store/GraphStore.js';

export interface GraphImpactData {
  readonly affectedTests: ReadonlyArray<{
    testFile: string;
    coversFile: string;
  }>;
  readonly affectedDocs: ReadonlyArray<{
    docFile: string;
    documentsFile: string;
  }>;
  readonly impactScope: number;
}

export interface GraphHarnessCheckData {
  readonly graphExists: boolean;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly constraintViolations: number;
  readonly undocumentedFiles: number;
  readonly unreachableNodes: number;
}

export class GraphFeedbackAdapter {
  constructor(private readonly store: GraphStore) {}

  computeImpactData(changedFiles: string[]): GraphImpactData {
    const affectedTests: Array<{ testFile: string; coversFile: string }> = [];
    const affectedDocs: Array<{ docFile: string; documentsFile: string }> = [];
    let impactScope = 0;

    for (const filePath of changedFiles) {
      // Find file node by path
      const fileNodes = this.store.findNodes({ path: filePath });
      if (fileNodes.length === 0) continue;
      const fileNode = fileNodes[0]!;

      // Find inbound imports edges — nodes that import this file
      const inboundImports = this.store.getEdges({ to: fileNode.id, type: 'imports' });
      for (const edge of inboundImports) {
        const importerNode = this.store.getNode(edge.from);
        if (importerNode?.path && /test/i.test(importerNode.path)) {
          affectedTests.push({
            testFile: importerNode.path,
            coversFile: filePath,
          });
        }
        impactScope++;
      }

      // Find inbound documents edges — docs that document this file
      const docsEdges = this.store.getEdges({ to: fileNode.id, type: 'documents' });
      for (const edge of docsEdges) {
        const docNode = this.store.getNode(edge.from);
        if (docNode) {
          affectedDocs.push({
            docFile: docNode.path ?? docNode.name,
            documentsFile: filePath,
          });
        }
      }
    }

    return { affectedTests, affectedDocs, impactScope };
  }

  computeHarnessCheckData(): GraphHarnessCheckData {
    const nodeCount = this.store.nodeCount;
    const edgeCount = this.store.edgeCount;

    // Count constraint violations (edges of type 'violates')
    const violatesEdges = this.store.getEdges({ type: 'violates' });
    const constraintViolations = violatesEdges.length;

    // Count undocumented file nodes (no inbound 'documents' edge)
    const fileNodes = this.store.findNodes({ type: 'file' });
    let undocumentedFiles = 0;
    for (const node of fileNodes) {
      const docsEdges = this.store.getEdges({ to: node.id, type: 'documents' });
      if (docsEdges.length === 0) {
        undocumentedFiles++;
      }
    }

    // Count unreachable file nodes (no inbound 'imports' edge and not entry point)
    let unreachableNodes = 0;
    for (const node of fileNodes) {
      const inboundImports = this.store.getEdges({ to: node.id, type: 'imports' });
      if (inboundImports.length === 0) {
        const isEntryPoint =
          node.name === 'index.ts' ||
          (node.path !== undefined && node.path.endsWith('/index.ts')) ||
          node.metadata?.entryPoint === true;
        if (!isEntryPoint) {
          unreachableNodes++;
        }
      }
    }

    return {
      graphExists: true,
      nodeCount,
      edgeCount,
      constraintViolations,
      undocumentedFiles,
      unreachableNodes,
    };
  }
}
