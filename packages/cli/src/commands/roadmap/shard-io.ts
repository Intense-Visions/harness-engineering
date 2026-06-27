import * as fsp from 'node:fs/promises';
import type { ShardIO } from '@harness-engineering/core';

/**
 * Node-fs `ShardIO` for the roadmap CLI commands. Extends the core `ShardIO`
 * (`readFile`/`writeFile`/`listDir`) with the directory primitives the migration
 * and unshard commands need (`mkdirp`/`rmrf`/`exists`). Keeping the node:fs
 * bindings in this thin adapter lets core stay IO-injected and node-free.
 */
export interface NodeShardIO extends ShardIO {
  /** Create `dir` (and any missing parents); idempotent. */
  mkdirp(dir: string): Promise<void>;
  /** Recursively remove `path`; no error if it does not exist. */
  rmrf(path: string): Promise<void>;
  /** True if `path` exists on disk. */
  exists(path: string): Promise<boolean>;
}

/** Construct a `NodeShardIO` backed by `node:fs/promises`. */
export function createNodeShardIO(): NodeShardIO {
  return {
    readFile: (path) => fsp.readFile(path, 'utf-8'),
    writeFile: (path, data) => fsp.writeFile(path, data, 'utf-8'),
    listDir: (dir) => fsp.readdir(dir),
    mkdirp: async (dir) => {
      await fsp.mkdir(dir, { recursive: true });
    },
    rmrf: (path) => fsp.rm(path, { recursive: true, force: true }),
    exists: async (path) => {
      try {
        await fsp.access(path);
        return true;
      } catch {
        return false;
      }
    },
  };
}
