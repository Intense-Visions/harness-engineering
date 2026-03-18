import * as path from 'path';

export async function runGraphExport(projectPath: string, format: string): Promise<string> {
  const { GraphStore } = await import('@harness-engineering/graph');
  const graphDir = path.join(projectPath, '.harness', 'graph');
  const store = new GraphStore();
  const loaded = await store.load(graphDir);
  if (!loaded) throw new Error('No graph found. Run `harness scan` first.');

  if (format === 'json') {
    const nodes = store.findNodes({});
    const edges = store.getEdges({});
    return JSON.stringify({ nodes, edges }, null, 2);
  }

  if (format === 'mermaid') {
    const nodes = store.findNodes({});
    const edges = store.getEdges({});
    const lines = ['graph TD'];
    // Add nodes with sanitized IDs
    for (const node of nodes.slice(0, 200)) {
      const safeId = node.id.replace(/[^a-zA-Z0-9]/g, '_');
      lines.push(`  ${safeId}["${node.name}"]`);
    }
    // Add edges
    for (const edge of edges.slice(0, 500)) {
      const safeFrom = edge.from.replace(/[^a-zA-Z0-9]/g, '_');
      const safeTo = edge.to.replace(/[^a-zA-Z0-9]/g, '_');
      lines.push(`  ${safeFrom} -->|${edge.type}| ${safeTo}`);
    }
    return lines.join('\n');
  }

  throw new Error(`Unknown format: ${format}. Available: json, mermaid`);
}
