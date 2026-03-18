import type { GraphStore } from '../../store/GraphStore.js';
import type { EdgeType } from '../../types.js';

const CODE_NODE_TYPES = ['file', 'function', 'class', 'method', 'interface', 'variable'] as const;

export function linkToCode(
  store: GraphStore,
  content: string,
  sourceNodeId: string,
  edgeType: EdgeType,
  options?: { checkPaths?: boolean }
): number {
  let edgesCreated = 0;
  for (const type of CODE_NODE_TYPES) {
    const nodes = store.findNodes({ type });
    for (const node of nodes) {
      if (node.name.length < 3) continue;
      const escaped = node.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
      let matched = pattern.test(content);
      if (!matched && options?.checkPaths && node.path) {
        matched = content.includes(node.path);
      }
      if (matched) {
        store.addEdge({ from: sourceNodeId, to: node.id, type: edgeType });
        edgesCreated++;
      }
    }
  }
  return edgesCreated;
}
