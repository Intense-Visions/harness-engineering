import { minimatch } from 'minimatch';
import { relative } from 'node:path';
import type { GraphStore } from '../store/GraphStore.js';

export interface GraphDependencyData {
  readonly nodes: readonly string[];
  readonly edges: ReadonlyArray<{
    from: string;
    to: string;
    importType: 'static' | 'dynamic' | 'type-only';
    line: number;
  }>;
}

export interface GraphLayerViolation {
  file: string;
  imports: string;
  fromLayer: string;
  toLayer: string;
  reason: 'WRONG_LAYER';
  line: number;
}

interface LayerDef {
  name: string;
  patterns: string[];
  allowedDependencies: string[];
}

export class GraphConstraintAdapter {
  constructor(private readonly store: GraphStore) {}

  computeDependencyGraph(): GraphDependencyData {
    const nodes = this.collectFileNodePaths();
    const edges = this.collectImportEdges();
    return { nodes, edges };
  }

  private collectFileNodePaths(): string[] {
    return this.store.findNodes({ type: 'file' }).map((n) => n.path ?? n.id);
  }

  private collectImportEdges(): GraphDependencyData['edges'][number][] {
    return this.store.getEdges({ type: 'imports' }).map((e) => {
      const fromNode = this.store.getNode(e.from);
      const toNode = this.store.getNode(e.to);
      const fromPath = fromNode?.path ?? e.from;
      const toPath = toNode?.path ?? e.to;
      const importType = (e.metadata?.importType as 'static' | 'dynamic' | 'type-only') ?? 'static';
      const line = (e.metadata?.line as number) ?? 0;
      return { from: fromPath, to: toPath, importType, line };
    });
  }

  computeLayerViolations(layers: LayerDef[], rootDir: string): GraphLayerViolation[] {
    const { edges } = this.computeDependencyGraph();
    const violations: GraphLayerViolation[] = [];

    for (const edge of edges) {
      const fromRelative = relative(rootDir, edge.from).replaceAll('\\', '/');
      const toRelative = relative(rootDir, edge.to).replaceAll('\\', '/');

      const fromLayer = this.resolveLayer(fromRelative, layers);
      const toLayer = this.resolveLayer(toRelative, layers);

      if (!fromLayer || !toLayer) continue;
      if (fromLayer.name === toLayer.name) continue;

      if (!fromLayer.allowedDependencies.includes(toLayer.name)) {
        violations.push({
          file: edge.from,
          imports: edge.to,
          fromLayer: fromLayer.name,
          toLayer: toLayer.name,
          reason: 'WRONG_LAYER',
          line: edge.line,
        });
      }
    }

    return violations;
  }

  private resolveLayer(filePath: string, layers: LayerDef[]): LayerDef | undefined {
    for (const layer of layers) {
      for (const pattern of layer.patterns) {
        if (minimatch(filePath, pattern)) {
          return layer;
        }
      }
    }
    return undefined;
  }
}
