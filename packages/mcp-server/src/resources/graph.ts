import * as fs from 'fs';
import * as path from 'path';

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
  const { GraphStore } = await import('@harness-engineering/graph');

  const graphDir = path.join(projectRoot, '.harness', 'graph');
  const store = new GraphStore();
  const loaded = await store.load(graphDir);

  if (!loaded) {
    return JSON.stringify({
      status: 'no_graph',
      message: 'No knowledge graph found. Run harness scan to build one.',
    });
  }

  const metadataPath = path.join(graphDir, 'metadata.json');
  let lastScanTimestamp: string | null = null;

  if (fs.existsSync(metadataPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      lastScanTimestamp = raw.lastScanTimestamp ?? null;
    } catch {
      // Ignore malformed metadata
    }
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
  const { GraphStore } = await import('@harness-engineering/graph');

  const graphDir = path.join(projectRoot, '.harness', 'graph');
  const store = new GraphStore();
  const loaded = await store.load(graphDir);

  if (!loaded) {
    return '[]';
  }

  const nodes = store.findNodes({});
  const slim = nodes.map((n) => ({
    id: n.id,
    type: n.type,
    name: n.name,
    path: n.path,
    metadata: n.metadata,
  }));

  return JSON.stringify(slim);
}

export async function getRelationshipsResource(projectRoot: string): Promise<string> {
  const { GraphStore } = await import('@harness-engineering/graph');

  const graphDir = path.join(projectRoot, '.harness', 'graph');
  const store = new GraphStore();
  const loaded = await store.load(graphDir);

  if (!loaded) {
    return '[]';
  }

  const edges = store.getEdges({});
  const mapped = edges.map((e) => ({
    from: e.from,
    to: e.to,
    type: e.type,
    confidence: e.confidence,
    metadata: e.metadata,
  }));

  return JSON.stringify(mapped);
}
