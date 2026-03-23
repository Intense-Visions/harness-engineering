import * as fs from 'node:fs/promises';
import * as path from 'path';
import { loadGraphStore } from '../utils/graph-loader.js';

const MAX_ITEMS = 5000;

function formatStaleness(isoTimestamp: string): string {
  const then = new Date(isoTimestamp).getTime();
  const now = Date.now();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  return 'just now';
}

export async function getGraphResource(projectRoot: string): Promise<string> {
  const store = await loadGraphStore(projectRoot);

  if (!store) {
    return JSON.stringify({
      status: 'no_graph',
      message: 'No knowledge graph found. Run harness scan to build one.',
    });
  }

  const graphDir = path.join(projectRoot, '.harness', 'graph');
  const metadataPath = path.join(graphDir, 'metadata.json');
  let lastScanTimestamp: string | null = null;

  try {
    const raw = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    lastScanTimestamp = raw.lastScanTimestamp ?? null;
  } catch {
    // Ignore missing or malformed metadata
  }

  const allNodes = store.findNodes({});
  const allEdges = store.getEdges({});

  const nodesByType: Record<string, number> = {};
  for (const node of allNodes) {
    nodesByType[node.type] = (nodesByType[node.type] ?? 0) + 1;
  }

  const edgesByType: Record<string, number> = {};
  for (const edge of allEdges) {
    edgesByType[edge.type] = (edgesByType[edge.type] ?? 0) + 1;
  }

  let status: 'ok' | 'stale' = 'ok';
  let staleness = 'unknown';

  if (lastScanTimestamp) {
    const ageMs = Date.now() - new Date(lastScanTimestamp).getTime();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    if (ageMs > twentyFourHoursMs) {
      status = 'stale';
    }
    staleness = formatStaleness(lastScanTimestamp);
  }

  return JSON.stringify({
    status,
    nodeCount: store.nodeCount,
    edgeCount: store.edgeCount,
    nodesByType,
    edgesByType,
    lastScanTimestamp,
    staleness,
  });
}

export async function getEntitiesResource(projectRoot: string): Promise<string> {
  const store = await loadGraphStore(projectRoot);

  if (!store) {
    return '[]';
  }

  const nodes = store.findNodes({});
  const entities = nodes.slice(0, MAX_ITEMS).map((n) => ({
    id: n.id,
    type: n.type,
    name: n.name,
    path: n.path,
    metadata: n.metadata,
  }));

  if (nodes.length > MAX_ITEMS) {
    return JSON.stringify({ entities, _truncated: true, _total: nodes.length }, null, 2);
  }

  return JSON.stringify(entities);
}

export async function getRelationshipsResource(projectRoot: string): Promise<string> {
  const store = await loadGraphStore(projectRoot);

  if (!store) {
    return '[]';
  }

  const edges = store.getEdges({});
  const relationships = edges.slice(0, MAX_ITEMS).map((e) => ({
    from: e.from,
    to: e.to,
    type: e.type,
    confidence: e.confidence,
    metadata: e.metadata,
  }));

  if (edges.length > MAX_ITEMS) {
    return JSON.stringify({ relationships, _truncated: true, _total: edges.length }, null, 2);
  }

  return JSON.stringify(relationships);
}
