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
    // Find all file nodes
    const fileNodes = this.store.findNodes({ type: 'file' });
    const nodes = fileNodes.map((n) => n.path ?? n.id);

    // Only extract `imports` edges — matches existing constraint system behavior.
    // Other code relationship edges (calls, references) are not tracked by the constraint layer.
    const importsEdges = this.store.getEdges({ type: 'imports' });

    const edges = importsEdges.map((e) => {
      // Resolve edge endpoints to file paths
      const fromNode = this.store.getNode(e.from);
      const toNode = this.store.getNode(e.to);
      const fromPath = fromNode?.path ?? e.from;
      const toPath = toNode?.path ?? e.to;

      const importType = (e.metadata?.importType as 'static' | 'dynamic' | 'type-only') ?? 'static';
      const line = (e.metadata?.line as number) ?? 0;

      return { from: fromPath, to: toPath, importType, line };
    });

    return { nodes, edges };
  }

  computeLayerViolations(layers: LayerDef[], rootDir: string): GraphLayerViolation[] {
    const { edges } = this.computeDependencyGraph();
    const violations: GraphLayerViolation[] = [];

    for (const edge of edges) {
      const fromRelative = relative(rootDir, edge.from);
      const toRelative = relative(rootDir, edge.to);

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
