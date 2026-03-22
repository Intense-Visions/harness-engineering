import * as path from 'path';
import { stat } from 'fs/promises';

interface CachedStore {
  store: Awaited<ReturnType<typeof doLoadGraphStore>>;
  mtimeMs: number;
}

const cache = new Map<string, CachedStore>();

export function clearGraphStoreCache(): void {
  cache.clear();
}

async function doLoadGraphStore(projectRoot: string) {
  const { GraphStore } = await import('@harness-engineering/graph');
  const graphDir = path.join(projectRoot, '.harness', 'graph');
  const store = new GraphStore();
  const loaded = await store.load(graphDir);
  if (!loaded) return null;
  return store;
}

export async function loadGraphStore(projectRoot: string) {
  const graphDir = path.join(projectRoot, '.harness', 'graph');
  const graphPath = path.join(graphDir, 'graph.json');

  let mtimeMs: number;
  try {
    const stats = await stat(graphPath);
    mtimeMs = stats.mtimeMs;
  } catch {
    // graph.json does not exist
    return null;
  }

  const cached = cache.get(projectRoot);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.store;
  }

  const store = await doLoadGraphStore(projectRoot);
  if (store !== null) {
    cache.set(projectRoot, { store, mtimeMs });
  }
  return store;
}
