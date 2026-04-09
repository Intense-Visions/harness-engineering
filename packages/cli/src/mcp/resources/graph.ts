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

function countByType<T extends { type: string }>(items: T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
  }
  return counts;
}

async function readLastScanTimestamp(projectRoot: string): Promise<string | null> {
  const metadataPath = path.join(projectRoot, '.harness', 'graph', 'metadata.json');
  try {
    const raw = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    return raw.lastScanTimestamp ?? null;
  } catch {
    return null;
  }
}

function computeGraphStatus(lastScanTimestamp: string | null): {
  status: 'ok' | 'stale';
  staleness: string;
} {
  if (!lastScanTimestamp) return { status: 'ok', staleness: 'unknown' };
  const ageMs = Date.now() - new Date(lastScanTimestamp).getTime();
  const status: 'ok' | 'stale' = ageMs > 24 * 60 * 60 * 1000 ? 'stale' : 'ok';
  return { status, staleness: formatStaleness(lastScanTimestamp) };
}

export async function getGraphResource(projectRoot: string): Promise<string> {
  const store = await loadGraphStore(projectRoot);

  if (!store) {
    return JSON.stringify({
      status: 'no_graph',
      message: 'No knowledge graph found. Run harness scan to build one.',
    });
  }

  const lastScanTimestamp = await readLastScanTimestamp(projectRoot);
  const { status, staleness } = computeGraphStatus(lastScanTimestamp);

  return JSON.stringify({
    status,
    nodeCount: store.nodeCount,
    edgeCount: store.edgeCount,
    nodesByType: countByType(store.findNodes({})),
    edgesByType: countByType(store.getEdges({})),
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
