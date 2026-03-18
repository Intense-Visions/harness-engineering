import type { GraphNode, ProjectionSpec } from '../types.js';

export function project(
  nodes: readonly GraphNode[],
  spec: ProjectionSpec | undefined
): Partial<GraphNode>[] {
  if (!spec) return nodes.map((n) => ({ ...n }));

  return nodes.map((node) => {
    const projected: Record<string, unknown> = {};
    for (const field of spec.fields) {
      if (field in node) {
        projected[field] = node[field];
      }
    }
    return projected as Partial<GraphNode>;
  });
}
