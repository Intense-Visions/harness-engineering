import { describe, it, expect } from 'vitest';
import { regenerate } from '../../../src/roadmap/store/regenerator';
import { assembleRoadmap } from '../../../src/roadmap/store/assembler';
import { ShardStore } from '../../../src/roadmap/store/shard-store';
import type { ShardIO } from '../../../src/roadmap/store/shard-store';
import { MonolithStore } from '../../../src/roadmap/store/monolith-store';
import { serializeShard } from '../../../src/roadmap/store/shard';
import { serializeMeta } from '../../../src/roadmap/store/meta';
import { parseRoadmap } from '../../../src/roadmap/parse';
import { MIGRATION_SHARDS, MIGRATION_META, OLD_ROADMAP_MD } from './fixtures';

const SHARD_DIR = '/repo/docs/roadmap.d';
const ROADMAP_PATH = '/repo/docs/roadmap.md';

function basename(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1);
}

function makeShardIO() {
  const files = new Map<string, string>();
  for (const shard of MIGRATION_SHARDS) {
    files.set(`${SHARD_DIR}/${shard.slug}.md`, serializeShard(shard));
  }
  files.set(`${SHARD_DIR}/_meta.md`, serializeMeta(MIGRATION_META));
  const io: ShardIO = {
    listDir: async (dir) => [...files.keys()].filter((p) => p.startsWith(`${dir}/`)).map(basename),
    readFile: async (p) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    writeFile: async (p, d) => void files.set(p, d),
  };
  return { io, files };
}

describe('migration round-trip + store parity proof', () => {
  it('the hand-authored monolith parses to the assembled shard roadmap', () => {
    const parsedOld = parseRoadmap(OLD_ROADMAP_MD);
    expect(parsedOld.ok).toBe(true);
    if (parsedOld.ok) {
      expect(parsedOld.value).toEqual(assembleRoadmap(MIGRATION_SHARDS, MIGRATION_META));
    }
  });

  it('semantic round-trip: parse(old) deep-equals parse(regen(shards))', async () => {
    const { io } = makeShardIO();
    const regen = await regenerate(SHARD_DIR, io);
    expect(regen.ok).toBe(true);
    if (regen.ok) {
      const fromRegen = parseRoadmap(regen.value);
      const fromOld = parseRoadmap(OLD_ROADMAP_MD);
      expect(fromRegen.ok && fromOld.ok).toBe(true);
      if (fromRegen.ok && fromOld.ok) {
        expect(fromRegen.value).toEqual(fromOld.value);
      }
    }
  });

  it('regeneration is byte-stable on rerun', async () => {
    const { io } = makeShardIO();
    const a = await regenerate(SHARD_DIR, io);
    const b = await regenerate(SHARD_DIR, io);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.value).toBe(a.value);
  });

  it('store parity end-to-end: MonolithStore.load() deep-equals ShardStore.load()', async () => {
    const { io: shardIO } = makeShardIO();
    const shardStore = new ShardStore({ shardDir: SHARD_DIR, io: shardIO });

    const monoFiles = new Map([[ROADMAP_PATH, OLD_ROADMAP_MD]]);
    const monolithStore = new MonolithStore({
      roadmapPath: ROADMAP_PATH,
      io: {
        readFile: async (p) => monoFiles.get(p)!,
        writeFile: async (p, d) => void monoFiles.set(p, d),
      },
    });

    const fromShards = await shardStore.load();
    const fromMonolith = await monolithStore.load();
    expect(fromShards.ok && fromMonolith.ok).toBe(true);
    if (fromShards.ok && fromMonolith.ok) {
      expect(fromShards.value).toEqual(fromMonolith.value);
    }
  });
});
