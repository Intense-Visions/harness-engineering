import * as path from 'path';
import { stat } from 'fs/promises';

const MAX_CACHE_ENTRIES = 8;

interface CachedStore {
  store: Awaited<ReturnType<typeof doLoadGraphStore>>;
  mtimeMs: number;
}

interface PendingLoad {
  promise: Promise<Awaited<ReturnType<typeof doLoadGraphStore>>>;
  mtimeMs: number; // mtime that triggered this load
}

const cache = new Map<string, CachedStore>();
const pending = new Map<string, PendingLoad>();

export function clearGraphStoreCache(): void {
  cache.clear();
  pending.clear();
}

/** Evict oldest entry when cache exceeds MAX_CACHE_ENTRIES. */
function evictIfNeeded(): void {
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
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

  // Dedup concurrent loads for the same projectRoot.
  // Only reuse a pending promise if it was initiated for the same mtime.
  // If the file changed between callers' stat() calls, start a fresh load.
  const pendingLoad = pending.get(projectRoot);
  let promise: Promise<Awaited<ReturnType<typeof doLoadGraphStore>>>;

  if (pendingLoad && pendingLoad.mtimeMs === mtimeMs) {
    promise = pendingLoad.promise;
  } else {
    promise = doLoadGraphStore(projectRoot);
    pending.set(projectRoot, { promise, mtimeMs });
  }

  const store = await promise;

  // Only clean up pending if we are the load that set it
  const currentPending = pending.get(projectRoot);
  if (currentPending && currentPending.promise === promise) {
    pending.delete(projectRoot);
  }

  if (store !== null) {
    cache.set(projectRoot, { store, mtimeMs });
    evictIfNeeded();
  }
  return store;
}
