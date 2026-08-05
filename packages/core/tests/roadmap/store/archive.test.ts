import { describe, it, expect } from 'vitest';
import {
  archiveShards,
  restoreShards,
  readArchivedShards,
  archiveShardDir,
} from '../../../src/roadmap/store/archive';
import { readShardDir } from '../../../src/roadmap/store/shard-store';
import type { ShardIO } from '../../../src/roadmap/store/shard-store';
import { regenerate } from '../../../src/roadmap/store/regenerator';
import { serializeShard } from '../../../src/roadmap/store/shard';
import { serializeMeta } from '../../../src/roadmap/store/meta';
import { ASSEMBLER_SHARDS, ASSEMBLER_META } from './fixtures';

const SHARD_DIR = '/repo/docs/roadmap.d';

function basename(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1);
}

/**
 * In-memory `ShardIO` whose `listDir` mimics `fsp.readdir` (SHALLOW): it returns
 * only IMMEDIATE children, so a nested `archive/<slug>.md` surfaces as the single
 * entry `archive` (a directory name), never as a `.md` file in the parent — the
 * exact behavior the exclusion of archived shards relies on. `writeFile` creates
 * parent dirs implicitly (map has no dir entries); `deleteFile` throws ENOENT.
 */
function makeShardIO() {
  const files = new Map<string, string>();
  for (const shard of ASSEMBLER_SHARDS) {
    files.set(`${SHARD_DIR}/${shard.slug}.md`, serializeShard(shard));
  }
  files.set(`${SHARD_DIR}/_meta.md`, serializeMeta(ASSEMBLER_META));

  const io: ShardIO = {
    listDir: async (dir) => {
      const prefix = `${dir}/`;
      const children = new Set<string>();
      let any = false;
      for (const p of files.keys()) {
        if (!p.startsWith(prefix)) continue;
        any = true;
        const rest = p.slice(prefix.length);
        const slash = rest.indexOf('/');
        children.add(slash === -1 ? rest : rest.slice(0, slash));
      }
      if (!any) throw new Error(`ENOENT: ${dir}`);
      return [...children];
    },
    readFile: async (p) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    writeFile: async (p, d) => {
      files.set(p, d);
    },
    deleteFile: async (p) => {
      if (!files.has(p)) throw new Error(`ENOENT: ${p}`);
      files.delete(p);
    },
  };
  return { io, files };
}

describe('archiveShards', () => {
  it('MOVES a shard into archive/ byte-for-byte and removes the original', async () => {
    const { io, files } = makeShardIO();
    const original = files.get(`${SHARD_DIR}/hardening-x.md`)!;

    const res = await archiveShards(SHARD_DIR, io, ['hardening-x']);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual({ moved: ['hardening-x'], skipped: [] });

    // Original gone from the active dir; identical bytes now under archive/.
    expect(files.has(`${SHARD_DIR}/hardening-x.md`)).toBe(false);
    expect(files.get(`${archiveShardDir(SHARD_DIR)}/hardening-x.md`)).toBe(original);
  });

  it('excludes archived shards from the active read + aggregate regeneration', async () => {
    const { io } = makeShardIO();
    await archiveShards(SHARD_DIR, io, ['hardening-x']);

    const read = await readShardDir(SHARD_DIR, io);
    expect(read.ok).toBe(true);
    if (read.ok) {
      const slugs = read.value.shards.map((s) => s.slug);
      expect(slugs).not.toContain('hardening-x'); // archived → absent from active
      expect(slugs).toContain('a-feature'); // non-archived → still active
    }

    const regen = await regenerate(SHARD_DIR, io);
    expect(regen.ok).toBe(true);
    if (regen.ok) {
      expect(regen.value).not.toContain('Hardening X'); // dropped from active aggregate
      expect(regen.value).toContain('A feature'); // active rows remain
    }
  });

  it('readArchivedShards returns archived history (and [] before any archive)', async () => {
    const { io } = makeShardIO();
    const empty = await readArchivedShards(SHARD_DIR, io);
    expect(empty.ok && empty.value).toEqual([]);

    await archiveShards(SHARD_DIR, io, ['hardening-x']);
    const archived = await readArchivedShards(SHARD_DIR, io);
    expect(archived.ok).toBe(true);
    if (archived.ok) {
      expect(archived.value.map((s) => s.slug)).toEqual(['hardening-x']);
      // Full frontmatter + body preserved (status/order/milestone intact).
      expect(archived.value[0]!.feature.status).toBe('done');
      expect(archived.value[0]!.milestone).toBe('v5.0 Hardening');
      expect(archived.value[0]!.order).toBe(15);
    }
  });

  it('round-trips: restoreShards brings the shard back identical', async () => {
    const { io, files } = makeShardIO();
    const original = files.get(`${SHARD_DIR}/hardening-x.md`)!;

    await archiveShards(SHARD_DIR, io, ['hardening-x']);
    const restored = await restoreShards(SHARD_DIR, io, ['hardening-x']);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.value).toEqual({ moved: ['hardening-x'], skipped: [] });

    // Back in the active dir, byte-identical; archive copy gone.
    expect(files.get(`${SHARD_DIR}/hardening-x.md`)).toBe(original);
    expect(files.has(`${archiveShardDir(SHARD_DIR)}/hardening-x.md`)).toBe(false);
  });

  it('is idempotent per slug: a missing source is skipped, not an error', async () => {
    const { io } = makeShardIO();
    const res = await archiveShards(SHARD_DIR, io, ['does-not-exist']);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual({ moved: [], skipped: ['does-not-exist'] });
  });

  it('archives multiple slugs and leaves the rest active', async () => {
    const { io, files } = makeShardIO();
    const res = await archiveShards(SHARD_DIR, io, ['hardening-x', 'backlog-item']);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.moved.sort()).toEqual(['backlog-item', 'hardening-x']);

    const read = await readShardDir(SHARD_DIR, io);
    if (read.ok) {
      const slugs = read.value.shards.map((s) => s.slug);
      expect(slugs).not.toContain('hardening-x');
      expect(slugs).not.toContain('backlog-item');
      expect(slugs).toContain('a-feature');
    }
    expect(files.has(`${archiveShardDir(SHARD_DIR)}/backlog-item.md`)).toBe(true);
  });
});
