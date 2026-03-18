import * as path from 'path';

export async function loadGraphStore(projectRoot: string) {
  const { GraphStore } = await import('@harness-engineering/graph');
  const graphDir = path.join(projectRoot, '.harness', 'graph');
  const store = new GraphStore();
  const loaded = await store.load(graphDir);
  if (!loaded) return null;
  return store;
}
