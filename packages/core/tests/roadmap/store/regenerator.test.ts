import { describe, it, expect } from 'vitest';
import { regenerate, writeRegeneratedRoadmap } from '../../../src/roadmap/store/regenerator';
import type { ShardIO } from '../../../src/roadmap/store/shard-store';
import { assembleRoadmap } from '../../../src/roadmap/store/assembler';
import { serializeShard } from '../../../src/roadmap/store/shard';
import { serializeMeta } from '../../../src/roadmap/store/meta';
import { parseRoadmap } from '../../../src/roadmap/parse';
import { ASSEMBLER_SHARDS, ASSEMBLER_META } from './fixtures';

const SHARD_DIR = '/repo/docs/roadmap.d';

function basename(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1);
}

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

describe('regenerate()', () => {
  it('is byte-stable across two consecutive calls', async () => {
    const { io } = makeShardIO();
    const a = await regenerate(SHARD_DIR, io);
    const b = await regenerate(SHARD_DIR, io);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.value).toBe(a.value);
  });

  it('produces prettier-clean output', async () => {
    const { io } = makeShardIO();
    const r = await regenerate(SHARD_DIR, io);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const md = r.value;
      expect(/[ \t]+$/m.test(md)).toBe(false); // no trailing whitespace
      expect(md.endsWith('\n')).toBe(true); // a trailing newline
      expect(md.endsWith('\n\n')).toBe(false); // exactly one
      expect(/\n{3,}/.test(md)).toBe(false); // no 3+ consecutive newlines
    }
  });

  it('satisfies the semantic round-trip vs assembleRoadmap', async () => {
    const { io } = makeShardIO();
    const r = await regenerate(SHARD_DIR, io);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const reparsed = parseRoadmap(r.value);
      expect(reparsed.ok).toBe(true);
      if (reparsed.ok) {
        expect(reparsed.value).toEqual(assembleRoadmap(ASSEMBLER_SHARDS, ASSEMBLER_META));
      }
    }
  });
});

describe('writeRegeneratedRoadmap()', () => {
  it('writes the regenerated aggregate to the roadmap path', async () => {
    const { io, files } = makeShardIO();
    const roadmapPath = '/repo/docs/roadmap.md';
    const r = await writeRegeneratedRoadmap(SHARD_DIR, roadmapPath, io);
    expect(r.ok).toBe(true);
    const regen = await regenerate(SHARD_DIR, io);
    if (regen.ok) expect(files.get(roadmapPath)).toBe(regen.value);
  });
});
