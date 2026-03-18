import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { GraphNode, GraphEdge, GraphMetadata } from '../types.js';
import { CURRENT_SCHEMA_VERSION } from '../types.js';

interface SerializedGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

export async function saveGraph(
  dirPath: string,
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[]
): Promise<void> {
  await mkdir(dirPath, { recursive: true });

  const graphData: SerializedGraph = { nodes, edges };
  const metadata: GraphMetadata = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    lastScanTimestamp: new Date().toISOString(),
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };

  await Promise.all([
    writeFile(join(dirPath, 'graph.json'), JSON.stringify(graphData, null, 2), 'utf-8'),
    writeFile(join(dirPath, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8'),
  ]);
}

export async function loadGraph(dirPath: string): Promise<SerializedGraph | null> {
  const metaPath = join(dirPath, 'metadata.json');
  const graphPath = join(dirPath, 'graph.json');

  // Check files exist
  try {
    await access(metaPath);
    await access(graphPath);
  } catch {
    return null; // Files don't exist — expected for first run
  }

  // Parse metadata — let parse errors propagate
  const metaContent = await readFile(metaPath, 'utf-8');
  const metadata: GraphMetadata = JSON.parse(metaContent);
  if (metadata.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return null; // Schema mismatch — caller should rebuild
  }

  // Parse graph — let parse errors propagate
  const graphContent = await readFile(graphPath, 'utf-8');
  return JSON.parse(graphContent) as SerializedGraph;
}
