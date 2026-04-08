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
      const fileNode = this.store.findNodes({ path: filePath })[0];
      if (!fileNode) continue;
      const counts = this.collectFileImpact(fileNode.id, filePath, affectedTests, affectedDocs);
      impactScope += counts.impactScope;
    }

    return { affectedTests, affectedDocs, impactScope };
  }

  private collectFileImpact(
    fileNodeId: string,
    filePath: string,
    affectedTests: Array<{ testFile: string; coversFile: string }>,
    affectedDocs: Array<{ docFile: string; documentsFile: string }>
  ): { impactScope: number } {
    const inboundImports = this.store.getEdges({ to: fileNodeId, type: 'imports' });
    for (const edge of inboundImports) {
      const importerNode = this.store.getNode(edge.from);
      if (importerNode?.path && /test/i.test(importerNode.path)) {
        affectedTests.push({ testFile: importerNode.path, coversFile: filePath });
      }
    }

    const docsEdges = this.store.getEdges({ to: fileNodeId, type: 'documents' });
    for (const edge of docsEdges) {
      const docNode = this.store.getNode(edge.from);
      if (docNode) {
        affectedDocs.push({ docFile: docNode.path ?? docNode.name, documentsFile: filePath });
      }
    }

    return { impactScope: inboundImports.length };
  }

  computeHarnessCheckData(): GraphHarnessCheckData {
    const fileNodes = this.store.findNodes({ type: 'file' });
    return {
      graphExists: true,
      nodeCount: this.store.nodeCount,
      edgeCount: this.store.edgeCount,
      constraintViolations: this.store.getEdges({ type: 'violates' }).length,
      undocumentedFiles: this.countUndocumentedFiles(fileNodes),
      unreachableNodes: this.countUnreachableNodes(fileNodes),
    };
  }

  private countUndocumentedFiles(fileNodes: Array<{ id: string }>): number {
    return fileNodes.filter(
      (node) => this.store.getEdges({ to: node.id, type: 'documents' }).length === 0
    ).length;
  }

  private countUnreachableNodes(
    fileNodes: Array<{
      id: string;
      name: string;
      path?: string;
      metadata?: Record<string, unknown>;
    }>
  ): number {
    return fileNodes.filter((node) => {
      if (this.store.getEdges({ to: node.id, type: 'imports' }).length > 0) return false;
      const isEntryPoint =
        node.name === 'index.ts' ||
        (node.path !== undefined && node.path.endsWith('/index.ts')) ||
        node.metadata?.entryPoint === true;
      return !isEntryPoint;
    }).length;
  }
}
