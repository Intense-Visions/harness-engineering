import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import type { GraphNode, GraphEdge, GraphMetadata } from '../types.js';
import { CURRENT_SCHEMA_VERSION } from '../types.js';

interface SerializedGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/**
 * Write graph JSON as a stream to avoid holding the entire serialized string
 * in memory. For large graphs (100MB+) this prevents OOM during serialization.
 */
function streamGraphJson(
  filePath: string,
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(filePath, { encoding: 'utf-8' });
    stream.on('error', reject);

    stream.write('{"nodes":[');
    for (let i = 0; i < nodes.length; i++) {
      if (i > 0) stream.write(',');
      stream.write(JSON.stringify(nodes[i]));
    }
    stream.write('],"edges":[');
    for (let i = 0; i < edges.length; i++) {
      if (i > 0) stream.write(',');
      stream.write(JSON.stringify(edges[i]));
    }
    stream.write(']}');
    stream.end(() => resolve());
  });
}

export async function saveGraph(
  dirPath: string,
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[]
): Promise<void> {
  await mkdir(dirPath, { recursive: true });

  const metadata: GraphMetadata = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    lastScanTimestamp: new Date().toISOString(),
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };

  await Promise.all([
    streamGraphJson(join(dirPath, 'graph.json'), nodes, edges),
    writeFile(join(dirPath, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8'),
  ]);
}

export type LoadGraphResult =
  | { status: 'loaded'; graph: SerializedGraph }
  | { status: 'not_found' }
  | { status: 'schema_mismatch'; found: number; expected: number };

export async function loadGraph(dirPath: string): Promise<LoadGraphResult> {
  const metaPath = join(dirPath, 'metadata.json');
  const graphPath = join(dirPath, 'graph.json');

  // Check files exist
  try {
    await access(metaPath);
    await access(graphPath);
  } catch {
    return { status: 'not_found' }; // Files don't exist — expected for first run
  }

  // Parse metadata — let parse errors propagate
  const metaContent = await readFile(metaPath, 'utf-8');
  const metadata: GraphMetadata = JSON.parse(metaContent);
  if (metadata.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return {
      status: 'schema_mismatch',
      found: metadata.schemaVersion,
      expected: CURRENT_SCHEMA_VERSION,
    };
  }

  // Parse graph — let parse errors propagate
  const graphContent = await readFile(graphPath, 'utf-8');
  return { status: 'loaded', graph: JSON.parse(graphContent) as SerializedGraph };
}
