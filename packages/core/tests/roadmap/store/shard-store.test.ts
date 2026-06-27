import { describe, it, expect } from 'vitest';
import { ShardStore, readShardDir } from '../../../src/roadmap/store/shard-store';
import type { ShardIO } from '../../../src/roadmap/store/shard-store';
import { MonolithStore } from '../../../src/roadmap/store/monolith-store';
import { assembleRoadmap } from '../../../src/roadmap/store/assembler';
import { serializeShard } from '../../../src/roadmap/store/shard';
import { serializeMeta } from '../../../src/roadmap/store/meta';
import { serializeRoadmap } from '../../../src/roadmap/serialize';
import { ASSEMBLER_SHARDS, ASSEMBLER_META } from './fixtures';

const SHARD_DIR = '/repo/docs/roadmap.d';

function basename(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1);
}

/** In-memory shard dir seeded with serialized shards + _meta.md. */
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
  };
  return { io, files, writes };
}

describe('ShardStore', () => {
  it('load() assembles shards + _meta (deep-equal to assembleRoadmap)', async () => {
    const { io } = makeShardIO();
    const store = new ShardStore({ shardDir: SHARD_DIR, io });
    const r = await store.load();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual(assembleRoadmap(ASSEMBLER_SHARDS, ASSEMBLER_META));
    }
  });

  it('store parity: ShardStore.load() deep-equals MonolithStore.load()', async () => {
    const { io: shardIO } = makeShardIO();
    const shardStore = new ShardStore({ shardDir: SHARD_DIR, io: shardIO });
    const shardLoaded = await shardStore.load();

    const assembled = assembleRoadmap(ASSEMBLER_SHARDS, ASSEMBLER_META);
    const roadmapPath = '/repo/docs/roadmap.md';
    const monoFiles = new Map([[roadmapPath, serializeRoadmap(assembled)]]);
    const monolithStore = new MonolithStore({
      roadmapPath,
      io: {
        readFile: async (p) => monoFiles.get(p)!,
        writeFile: async (p, d) => void monoFiles.set(p, d),
      },
    });
    const monoLoaded = await monolithStore.load();

    expect(shardLoaded.ok && monoLoaded.ok).toBe(true);
    if (shardLoaded.ok && monoLoaded.ok) {
      expect(shardLoaded.value).toEqual(monoLoaded.value);
    }
  });

  it('patchFeature() writes ONLY the one shard file', async () => {
    const { io, files, writes } = makeShardIO();
    const store = new ShardStore({ shardDir: SHARD_DIR, io });
    const r = await store.patchFeature('a-feature', (f) => ({ ...f, status: 'done' }));
    expect(r.ok).toBe(true);
    expect(writes).toHaveLength(1);
    expect(basename(writes[0]!)).toBe('a-feature.md');

    const reparsed = files.get(`${SHARD_DIR}/a-feature.md`)!;
    expect(reparsed).toMatch(/- \*\*Status:\*\* done/);
  });

  it('addFeature() creates a new shard without touching existing files or _meta', async () => {
    const { io, files, writes } = makeShardIO();
    const store = new ShardStore({ shardDir: SHARD_DIR, io });
    const r = await store.addFeature({
      slug: 'new-thing',
      milestone: 'MVP Release',
      order: 99,
      feature: {
        name: 'New thing',
        status: 'planned',
        spec: null,
        plans: [],
        blockedBy: [],
        summary: 'A brand new shard',
        assignee: null,
        priority: null,
        externalId: null,
        updatedAt: null,
      },
    });
    expect(r.ok).toBe(true);
    expect(writes).toEqual([`${SHARD_DIR}/new-thing.md`]);
    expect(files.has(`${SHARD_DIR}/new-thing.md`)).toBe(true);
  });

  it('excludes _meta.md from the shard glob', async () => {
    const { io } = makeShardIO();
    const store = new ShardStore({ shardDir: SHARD_DIR, io });
    const r = await store.load();
    expect(r.ok).toBe(true);
    if (r.ok) {
      // _meta.md must never surface as a feature/milestone row.
      const allNames = r.value.milestones.flatMap((m) => m.features.map((f) => f.name));
      expect(allNames).not.toContain('_meta');
      expect(r.value.milestones.map((m) => m.name)).not.toContain('_meta');
    }
  });

  // Guard: addFeature must not silently overwrite an existing shard (Phase 4 data
  // loss). A slug that already has a shard file returns Err.
  it('addFeature() returns Err on a duplicate slug instead of overwriting', async () => {
    const { io, files, writes } = makeShardIO();
    const store = new ShardStore({ shardDir: SHARD_DIR, io });
    const before = files.get(`${SHARD_DIR}/a-feature.md`);
    const r = await store.addFeature({
      slug: 'a-feature', // already present in ASSEMBLER_SHARDS
      milestone: 'MVP Release',
      order: 1,
      feature: {
        name: 'Clobbering feature',
        status: 'planned',
        spec: null,
        plans: [],
        blockedBy: [],
        summary: 'Should not overwrite',
        assignee: null,
        priority: null,
        externalId: null,
        updatedAt: null,
      },
    });
    expect(r.ok).toBe(false);
    expect(writes).toHaveLength(0);
    expect(files.get(`${SHARD_DIR}/a-feature.md`)).toBe(before);
  });
});

describe('readShardDir() integrity guards', () => {
  /** Build a ShardIO from an explicit map of basename -> file contents. */
  function ioFromFiles(byName: Record<string, string>): ShardIO {
    const files = new Map(Object.entries(byName).map(([n, c]) => [`${SHARD_DIR}/${n}`, c]));
    return {
      listDir: async (dir) =>
        [...files.keys()].filter((p) => p.startsWith(`${dir}/`)).map(basename),
      readFile: async (p) => {
        const v = files.get(p);
        if (v === undefined) throw new Error(`ENOENT: ${p}`);
        return v;
      },
      writeFile: async () => {},
    };
  }

  const META = serializeMeta(ASSEMBLER_META);

  it('returns Err when a shard filename does not match its frontmatter slug', async () => {
    // File named wrong-name.md but frontmatter slug is right-slug.
    const content = serializeShard({
      slug: 'right-slug',
      milestone: 'MVP Release',
      order: 1,
      feature: ASSEMBLER_SHARDS[0]!.feature,
    });
    const io = ioFromFiles({ 'wrong-name.md': content, '_meta.md': META });
    const r = await readShardDir(SHARD_DIR, io);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/slug|filename/i);
  });

  it('returns Err when two shards declare the same slug', async () => {
    const a = serializeShard({
      slug: 'dup',
      milestone: 'MVP Release',
      order: 1,
      feature: ASSEMBLER_SHARDS[0]!.feature,
    });
    const b = serializeShard({
      slug: 'dup',
      milestone: 'MVP Release',
      order: 2,
      feature: ASSEMBLER_SHARDS[1]!.feature,
    });
    // dup.md matches its slug; dup-2.md also declares slug "dup" -> duplicate.
    const io = ioFromFiles({ 'dup.md': a, 'dup-2.md': b, '_meta.md': META });
    const r = await readShardDir(SHARD_DIR, io);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/duplicate|slug/i);
  });
});
