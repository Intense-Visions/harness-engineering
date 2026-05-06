import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import type { GraphNode, GraphEdge, GraphMetadata } from '../types.js';
import { CURRENT_SCHEMA_VERSION } from '../types.js';

interface SerializedGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/**
 * Stream-write the graph as NDJSON — one node or edge per line, each line a
 * self-contained JSON object with a `kind` discriminator.
 *
 * Format chosen to dodge V8's ~512 MB single-string cap, which the previous
 * "one giant JSON document" format hit on production monorepos (issue #276).
 * NDJSON also lets the reader stream the file with bounded per-line memory.
 */
function streamGraphNdjson(
  filePath: string,
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(filePath, { encoding: 'utf-8' });
    stream.on('error', reject);

    for (const node of nodes) {
      stream.write(JSON.stringify({ kind: 'node', ...node }));
      stream.write('\n');
    }
    for (const edge of edges) {
      stream.write(JSON.stringify({ kind: 'edge', ...edge }));
      stream.write('\n');
    }
    stream.end(() => resolve());
  });
}

function countNodesByType(nodes: readonly GraphNode[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of nodes) {
    counts[node.type] = (counts[node.type] ?? 0) + 1;
  }
  return counts;
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
    nodesByType: countNodesByType(nodes),
  };

  await Promise.all([
    streamGraphNdjson(join(dirPath, 'graph.json'), nodes, edges),
    writeFile(join(dirPath, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8'),
  ]);
}

export type LoadGraphResult =
  | { status: 'loaded'; graph: SerializedGraph }
  | { status: 'not_found' }
  | { status: 'schema_mismatch'; found: number; expected: number };

export type LoadMetadataResult =
  | { status: 'loaded'; metadata: GraphMetadata }
  | { status: 'not_found' }
  | { status: 'schema_mismatch'; found: number; expected: number };

/**
 * Read just `metadata.json` — fast-path for callers that only need counts/timestamps
 * (e.g. `harness graph status`). Avoids the streaming graph.json read entirely.
 *
 * Returns `not_found` when the metadata file is missing or unreadable.
 * Returns `schema_mismatch` when the graph was written by a different schema version,
 * letting callers either rebuild or surface the version skew without loading nodes.
 */
export async function loadGraphMetadata(dirPath: string): Promise<LoadMetadataResult> {
  const metaPath = join(dirPath, 'metadata.json');
  try {
    await access(metaPath);
  } catch {
    return { status: 'not_found' };
  }

  let metadata: GraphMetadata;
  try {
    const content = await readFile(metaPath, 'utf-8');
    metadata = JSON.parse(content);
  } catch {
    return { status: 'not_found' };
  }

  if (metadata.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return {
      status: 'schema_mismatch',
      found: metadata.schemaVersion,
      expected: CURRENT_SCHEMA_VERSION,
    };
  }
  return { status: 'loaded', metadata };
}

interface NdjsonRecord {
  kind?: string;
  [key: string]: unknown;
}

/**
 * Stream-read the NDJSON graph file line-by-line. Each line is parsed independently,
 * so peak string size stays bounded by the largest single record rather than the
 * total file — which is what got us into trouble in the v1 single-document format.
 */
async function streamReadGraph(filePath: string): Promise<SerializedGraph> {
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (line === '') continue;
      const record = JSON.parse(line) as NdjsonRecord;
      if (record.kind === 'node') {
        const { kind: _kind, ...rest } = record;
        nodes.push(rest as unknown as GraphNode);
      } else if (record.kind === 'edge') {
        const { kind: _kind, ...rest } = record;
        edges.push(rest as unknown as GraphEdge);
      }
      // Unknown `kind` values are silently skipped to keep older readers
      // forward-compatible with future record kinds.
    }
  } catch (err) {
    if (err instanceof RangeError && /invalid string length/i.test(err.message)) {
      throw new Error(
        `Graph contains a record larger than V8 can hold in a single string (~512 MB). ` +
          `This usually means a node or edge has a multi-hundred-MB content/embedding field. ` +
          `Inspect ${filePath} for the offending record.`,
        { cause: err }
      );
    }
    throw err;
  } finally {
    rl.close();
    stream.close();
  }

  return { nodes, edges };
}

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

  // Stream-read NDJSON graph — never builds a single string > one line
  const graph = await streamReadGraph(graphPath);
  return { status: 'loaded', graph };
}
