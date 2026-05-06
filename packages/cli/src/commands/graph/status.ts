import * as path from 'path';

export interface GraphStatusResult {
  status: string;
  message?: string;
  nodeCount?: number;
  edgeCount?: number;
  nodesByType?: Record<string, number>;
  lastScanTimestamp?: string;
  connectorSyncStatus?: Record<string, string>;
}

async function readConnectorSyncStatus(graphDir: string): Promise<Record<string, string>> {
  const fs = await import('node:fs/promises');
  const result: Record<string, string> = {};
  try {
    const syncMetaPath = path.join(graphDir, 'sync-metadata.json');
    const syncMeta = JSON.parse(await fs.readFile(syncMetaPath, 'utf-8'));
    for (const [name, data] of Object.entries(syncMeta.connectors ?? {})) {
      result[name] = (data as { lastSyncTimestamp: string }).lastSyncTimestamp;
    }
  } catch {
    /* no sync metadata — connectors not configured or never synced */
  }
  return result;
}

/**
 * Reports graph statistics. Reads `metadata.json` only — it carries node/edge
 * counts and per-type breakdowns (since schema v2). This avoids the streaming
 * graph.json read entirely, so `harness graph status` returns instantly even on
 * multi-GB graphs that would otherwise take seconds (or trip pre-v2 callers).
 *
 * Falls back to a full graph load only when the metadata file lacks `nodesByType`,
 * which happens for graphs written before that field was added.
 */
export async function runGraphStatus(projectPath: string): Promise<GraphStatusResult> {
  const { GraphStore, loadGraphMetadata } = await import('@harness-engineering/graph');
  const graphDir = path.join(projectPath, '.harness', 'graph');

  const metaResult = await loadGraphMetadata(graphDir);
  if (metaResult.status === 'not_found') {
    return { status: 'no_graph', message: 'No graph found. Run `harness scan` first.' };
  }
  if (metaResult.status === 'schema_mismatch') {
    return {
      status: 'schema_mismatch',
      message:
        `Graph schema version mismatch: file is v${metaResult.found}, CLI expects v${metaResult.expected}. ` +
        'Run `harness scan` to rebuild.',
    };
  }

  const meta = metaResult.metadata;
  const connectorSyncStatus = await readConnectorSyncStatus(graphDir);

  // Fast path: metadata carries everything we need.
  if (meta.nodesByType) {
    return {
      status: 'ok',
      nodeCount: meta.nodeCount,
      edgeCount: meta.edgeCount,
      nodesByType: { ...meta.nodesByType },
      lastScanTimestamp: meta.lastScanTimestamp,
      ...(Object.keys(connectorSyncStatus).length > 0 ? { connectorSyncStatus } : {}),
    };
  }

  // Slow path: pre-`nodesByType` metadata; load the graph to compute the breakdown.
  const store = new GraphStore();
  const loaded = await store.load(graphDir);
  if (!loaded) {
    return {
      status: 'ok',
      nodeCount: meta.nodeCount,
      edgeCount: meta.edgeCount,
      lastScanTimestamp: meta.lastScanTimestamp,
      ...(Object.keys(connectorSyncStatus).length > 0 ? { connectorSyncStatus } : {}),
    };
  }

  const nodesByType: Record<string, number> = {};
  for (const node of store.findNodes({})) {
    nodesByType[node.type] = (nodesByType[node.type] ?? 0) + 1;
  }

  return {
    status: 'ok',
    nodeCount: store.nodeCount,
    edgeCount: store.edgeCount,
    nodesByType,
    lastScanTimestamp: meta.lastScanTimestamp,
    ...(Object.keys(connectorSyncStatus).length > 0 ? { connectorSyncStatus } : {}),
  };
}
