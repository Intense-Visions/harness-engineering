import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  resolveRoadmapStore,
  roadmapSourceExists,
  roadmapAggregatePath,
  archiveDoneShardsForProject,
} from '../../../src/roadmap/store/factory';
import type { ShardIO } from '../../../src/roadmap/store/shard-store';
import { serializeShard } from '../../../src/roadmap/store/shard';
import { serializeMeta } from '../../../src/roadmap/store/meta';
import { feat } from './fixtures';
import { ASSEMBLER_SHARDS, ASSEMBLER_META } from './fixtures';

// The store normalizes every IO path to '/'; seed + assert with posix joins so
// these tests pass identically on Windows CI (plain path.join emits '\').
const PROJECT_ROOT = '/repo';
const SHARD_DIR = path.posix.join(PROJECT_ROOT, 'docs', 'roadmap.d');
const ROADMAP_PATH = path.posix.join(PROJECT_ROOT, 'docs', 'roadmap.md');
const ARCHIVE_DIR = path.posix.join(SHARD_DIR, 'archive');

function basename(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1);
}

/**
 * In-memory ShardIO seeded with the assembler shards + _meta.md. `listDir` returns
 * only IMMEDIATE children of `dir` (remainder after the prefix with no further
 * '/'), so nested `archive/<slug>.md` files never leak into the active shard glob —
 * matching a real directory listing. `onWrite` lets a test inject a write failure.
 */
function makeShardIO(onWrite?: (p: string) => void) {
  const files = new Map<string, string>();
  for (const shard of ASSEMBLER_SHARDS) {
    files.set(`${SHARD_DIR}/${shard.slug}.md`, serializeShard(shard));
  }
  files.set(`${SHARD_DIR}/_meta.md`, serializeMeta(ASSEMBLER_META));

  const writes: string[] = [];
  const io: ShardIO = {
    listDir: async (dir) =>
      [...files.keys()]
        .filter((p) => p.startsWith(`${dir}/`))
        .map((p) => p.slice(dir.length + 1))
        .filter((rem) => !rem.includes('/')),
    readFile: async (p) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    writeFile: async (p, d) => {
      if (onWrite) onWrite(p);
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

describe('roadmapSourceExists', () => {
  it('returns true (and short-circuits) when the sharded roadmap.d exists', () => {
    const probed: string[] = [];
    const exists = (target: string) => {
      probed.push(target);
      return target.endsWith('/roadmap.d');
    };
    expect(roadmapSourceExists(PROJECT_ROOT, exists)).toBe(true);
    // Short-circuit: the aggregate roadmap.md path is never probed once sharded.
    expect(probed.some((p) => p.endsWith('/roadmap.md'))).toBe(false);
  });

  it('returns true when only the monolith aggregate roadmap.md exists', () => {
    const exists = (target: string) => target.endsWith('/roadmap.md');
    expect(roadmapSourceExists(PROJECT_ROOT, exists)).toBe(true);
  });

  it('returns false when neither a shard dir nor an aggregate exists', () => {
    expect(roadmapSourceExists(PROJECT_ROOT, () => false)).toBe(false);
  });

  it('probes the aggregate with an OS-stable forward-slash path', () => {
    const probed: string[] = [];
    roadmapSourceExists(PROJECT_ROOT, (target) => {
      probed.push(target);
      return false;
    });
    expect(probed).toContain(`${PROJECT_ROOT}/docs/roadmap.md`);
    expect(probed.every((p) => !p.includes('\\'))).toBe(true);
  });

  it('defaults to fs.existsSync and reports false for a non-existent project root', () => {
    const missing = path.join(os.tmpdir(), `harness-no-roadmap-${Date.now()}`);
    expect(roadmapSourceExists(missing)).toBe(false);
  });
});

describe('roadmapAggregatePath', () => {
  it('returns <root>/docs/roadmap.md with OS-stable forward slashes', () => {
    expect(roadmapAggregatePath(PROJECT_ROOT)).toBe(`${PROJECT_ROOT}/docs/roadmap.md`);
    expect(roadmapAggregatePath('C:\\proj')).toBe('C:/proj/docs/roadmap.md');
  });
});

describe('withAggregateRegen decorator (sharded store)', () => {
  const sharded = (io: ShardIO) =>
    resolveRoadmapStore({ projectRoot: PROJECT_ROOT, io, exists: (p) => p === SHARD_DIR });

  it('regenerates the aggregate after addFeature', async () => {
    const { io, files, writes } = makeShardIO();
    const store = sharded(io);
    const r = await store.addFeature({
      slug: 'new-thing',
      milestone: 'MVP Release',
      order: 30,
      feature: feat('New thing', 'planned'),
    });
    expect(r.ok).toBe(true);
    expect(writes).toContain(`${SHARD_DIR}/new-thing.md`);
    expect(writes).toContain(ROADMAP_PATH);
    expect(files.get(ROADMAP_PATH)).toMatch(/New thing/);
  });

  it('regenerates the aggregate after removeFeature', async () => {
    const { io, files, writes } = makeShardIO();
    const store = sharded(io);
    const r = await store.removeFeature('hardening-x');
    expect(r.ok).toBe(true);
    expect(files.has(`${SHARD_DIR}/hardening-x.md`)).toBe(false);
    expect(writes).toContain(ROADMAP_PATH);
    // The removed feature is gone from the regenerated aggregate.
    expect(files.get(ROADMAP_PATH)).not.toMatch(/Hardening X/);
  });

  it('treats patchFrontmatter as a no-op that never regenerates the aggregate', async () => {
    const { io, writes } = makeShardIO();
    const store = sharded(io);
    const r = await store.patchFrontmatter((fm) => ({ ...fm, version: 99 }));
    expect(r.ok).toBe(true);
    // No-op in sharded mode: nothing written, aggregate untouched.
    expect(writes).toHaveLength(0);
    expect(writes).not.toContain(ROADMAP_PATH);
  });

  it('rewrites _meta.md and regenerates the aggregate on patchAssignmentHistory', async () => {
    const { io, writes } = makeShardIO();
    const store = sharded(io);
    const r = await store.patchAssignmentHistory([
      { feature: 'A feature', assignee: 'alice', action: 'assigned', date: '2026-01-02' },
    ]);
    expect(r.ok).toBe(true);
    expect(writes).toContain(`${SHARD_DIR}/_meta.md`);
    expect(writes).toContain(ROADMAP_PATH);
  });

  it('rewrites _meta.md and regenerates the aggregate on stampLastSynced', async () => {
    const { io, files, writes } = makeShardIO();
    const store = sharded(io);
    const r = await store.stampLastSynced('2026-08-18T00:00:00.000Z');
    expect(r.ok).toBe(true);
    expect(writes).toContain(`${SHARD_DIR}/_meta.md`);
    expect(writes).toContain(ROADMAP_PATH);
    expect(files.get(`${SHARD_DIR}/_meta.md`)).toMatch(/2026-08-18T00:00:00.000Z/);
  });

  it('skips regeneration when the underlying mutation fails', async () => {
    const { io, writes } = makeShardIO();
    const store = sharded(io);
    const r = await store.patchFeature('does-not-exist', (f) => ({ ...f, status: 'done' }));
    expect(r.ok).toBe(false);
    // Failed mutation => nothing changed => aggregate is NOT regenerated.
    expect(writes).not.toContain(ROADMAP_PATH);
    expect(writes).toHaveLength(0);
  });
});

describe('archiveDoneShardsForProject', () => {
  it('moves a done shard into archive/ and regenerates the active aggregate', async () => {
    const { io, files } = makeShardIO();
    const result = await archiveDoneShardsForProject(PROJECT_ROOT, ['hardening-x'], io);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.moved).toEqual(['hardening-x']);
      expect(result.value.skipped).toEqual([]);
    }
    // Byte-for-byte moved: source gone, archive copy present.
    expect(files.has(`${SHARD_DIR}/hardening-x.md`)).toBe(false);
    expect(files.get(`${ARCHIVE_DIR}/hardening-x.md`)).toBeDefined();
    // Aggregate regenerated without the archived row.
    expect(files.get(ROADMAP_PATH)).toBeDefined();
    expect(files.get(ROADMAP_PATH)).not.toMatch(/Hardening X/);
  });

  it('records an absent slug as skipped (idempotent no-op) yet still regenerates', async () => {
    const { io, files } = makeShardIO();
    const result = await archiveDoneShardsForProject(PROJECT_ROOT, ['no-such-slug'], io);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.moved).toEqual([]);
      expect(result.value.skipped).toEqual(['no-such-slug']);
    }
    // The aggregate is regenerated even when nothing moved.
    expect(files.get(ROADMAP_PATH)).toBeDefined();
  });

  it('short-circuits with Err when the archive move fails to write', async () => {
    const { io, files } = makeShardIO((p) => {
      if (p.startsWith(`${ARCHIVE_DIR}/`)) throw new Error('disk full');
    });
    const result = await archiveDoneShardsForProject(PROJECT_ROOT, ['hardening-x'], io);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/Failed to write shard/);
    // Write-before-delete safety: the source shard is not lost on move failure.
    expect(files.has(`${SHARD_DIR}/hardening-x.md`)).toBe(true);
  });

  it('propagates Err when the post-move aggregate regeneration fails', async () => {
    const { io } = makeShardIO((p) => {
      if (p === ROADMAP_PATH) throw new Error('aggregate write blocked');
    });
    const result = await archiveDoneShardsForProject(PROJECT_ROOT, ['hardening-x'], io);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/Failed to write regenerated roadmap/);
  });
});
