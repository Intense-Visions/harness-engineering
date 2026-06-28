import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { resolveRoadmapStore } from '../../../src/roadmap/store/factory';
import type { ShardIO } from '../../../src/roadmap/store/shard-store';
import { assembleRoadmap } from '../../../src/roadmap/store/assembler';
import { serializeShard } from '../../../src/roadmap/store/shard';
import { serializeMeta } from '../../../src/roadmap/store/meta';
import { serializeRoadmap } from '../../../src/roadmap/serialize';
import { ASSEMBLER_SHARDS, ASSEMBLER_META, MONOLITH_ROADMAP_MD } from './fixtures';

const PROJECT_ROOT = '/repo';
const SHARD_DIR = path.join(PROJECT_ROOT, 'docs', 'roadmap.d');
const ROADMAP_PATH = path.join(PROJECT_ROOT, 'docs', 'roadmap.md');

function basename(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1);
}

/** In-memory ShardIO seeded with serialized shards + _meta.md. */
function makeShardIO() {
  const files = new Map<string, string>();
  for (const shard of ASSEMBLER_SHARDS) {
    files.set(`${SHARD_DIR}/${shard.slug}.md`, serializeShard(shard));
  }
  files.set(`${SHARD_DIR}/_meta.md`, serializeMeta(ASSEMBLER_META));

  const writes: string[] = [];
  const io: ShardIO = {
    listDir: async (dir) => [...files.keys()].filter((p) => p.startsWith(`${dir}/`)).map(basename),
    readFile: async (p) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    writeFile: async (p, d) => {
      files.set(p, d);
      writes.push(p);
    },
    deleteFile: async (p) => {
      if (!files.has(p)) throw new Error(`ENOENT: ${p}`);
      files.delete(p);
    },
  };
  return { io, files, writes };
}

describe('resolveRoadmapStore', () => {
  it('returns a ShardStore-backed store when docs/roadmap.d exists', async () => {
    const { io } = makeShardIO();
    const store = resolveRoadmapStore({
      projectRoot: PROJECT_ROOT,
      io,
      exists: (p) => p === SHARD_DIR,
    });
    const loaded = await store.load();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value).toEqual(assembleRoadmap(ASSEMBLER_SHARDS, ASSEMBLER_META));
    }
  });

  it('regenerates the aggregate roadmap.md after a sharded patch', async () => {
    const { io, files, writes } = makeShardIO();
    const store = resolveRoadmapStore({
      projectRoot: PROJECT_ROOT,
      io,
      exists: (p) => p === SHARD_DIR,
    });
    const r = await store.patchFeature('a-feature', (f) => ({ ...f, status: 'done' }));
    expect(r.ok).toBe(true);
    // The one shard is written AND the aggregate is regenerated.
    expect(writes).toContain(`${SHARD_DIR}/a-feature.md`);
    expect(writes).toContain(ROADMAP_PATH);
    expect(files.get(ROADMAP_PATH)).toMatch(/A feature/);
  });

  it('returns a MonolithStore-backed store when only docs/roadmap.md exists', async () => {
    const files = new Map<string, string>([[ROADMAP_PATH, MONOLITH_ROADMAP_MD]]);
    const io: ShardIO = {
      listDir: async () => [],
      readFile: async (p) => {
        const v = files.get(p);
        if (v === undefined) throw new Error(`ENOENT: ${p}`);
        return v;
      },
      writeFile: async (p, d) => void files.set(p, d),
      deleteFile: async (p) => void files.delete(p),
    };
    const writes: string[] = [];
    const trackingIO: ShardIO = {
      ...io,
      writeFile: async (p, d) => void (files.set(p, d), writes.push(p)),
    };
    const store = resolveRoadmapStore({
      projectRoot: PROJECT_ROOT,
      io: trackingIO,
      exists: () => false,
    });
    const loaded = await store.load();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      const parsed = serializeRoadmap(loaded.value);
      expect(parsed).toBe(MONOLITH_ROADMAP_MD);
      // Monolith patch is a single whole-file rewrite at the aggregate path —
      // no separate regenerate (the aggregate IS the source).
      const r = await store.patchFeature('a-feature', (f) => ({ ...f, status: 'done' }));
      expect(r.ok).toBe(true);
      expect(writes).toEqual([ROADMAP_PATH]);
      expect(files.get(ROADMAP_PATH)).toMatch(/done/);
    }
  });
});
