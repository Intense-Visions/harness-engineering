import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { ShardIO } from './shard-store';

/**
 * Node-fs `ShardIO` for core roadmap writers (sync-engine, prediction-engine,
 * the `resolveRoadmapStore` factory). Mirrors the CLI's `createNodeShardIO` but
 * lives in core so core writers get fs IO without depending on the CLI. Core
 * stays IO-injected; this thin adapter is the only node:fs binding.
 *
 * `writeFile` creates missing parent directories so first-time shard/aggregate
 * writes succeed; `deleteFile` rejects when the target is absent so the store's
 * not-found `Err` path is exercised.
 */
export function createNodeRoadmapIO(): ShardIO {
  return {
    readFile: (p) => fsp.readFile(p, 'utf-8'),
    writeFile: async (p, data) => {
      await fsp.mkdir(path.dirname(p), { recursive: true });
      await fsp.writeFile(p, data, 'utf-8');
    },
    listDir: (dir) => fsp.readdir(dir),
    deleteFile: (p) => fsp.rm(p),
  };
}
