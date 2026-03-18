import * as path from 'path';

export interface GraphStatusResult {
  status: string;
  message?: string;
  nodeCount?: number;
  edgeCount?: number;
  nodesByType?: Record<string, number>;
  lastScanTimestamp?: string;
}

export async function runGraphStatus(projectPath: string): Promise<GraphStatusResult> {
  const { GraphStore } = await import('@harness-engineering/graph');
  const graphDir = path.join(projectPath, '.harness', 'graph');
  const store = new GraphStore();
  const loaded = await store.load(graphDir);
  if (!loaded) return { status: 'no_graph', message: 'No graph found. Run `harness scan` first.' };

  // Read metadata
  const fs = await import('node:fs/promises');
  const metaPath = path.join(graphDir, 'metadata.json');
  let lastScan = 'unknown';
  try {
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
    lastScan = meta.lastScanTimestamp;
  } catch {
    /* metadata file may not exist */
  }

  // Count by type
  const allNodes = store.findNodes({});
  const nodesByType: Record<string, number> = {};
  for (const node of allNodes) {
    nodesByType[node.type] = (nodesByType[node.type] ?? 0) + 1;
  }

  return {
    status: 'ok',
    nodeCount: store.nodeCount,
    edgeCount: store.edgeCount,
    nodesByType,
    lastScanTimestamp: lastScan,
  };
}
