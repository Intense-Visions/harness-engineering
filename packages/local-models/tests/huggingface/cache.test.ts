import { describe, expect, it } from 'vitest';

import { FileHuggingFaceCache, InMemoryHuggingFaceCache } from '../../src/huggingface/cache.js';
import type { FileCacheFs } from '../../src/huggingface/cache.js';

/** In-memory file system honoring the `FileCacheFs` interface for deterministic tests. */
function memoryFs(): FileCacheFs & {
  files: Map<string, string>;
  dirs: Set<string>;
  ops: { kind: 'write' | 'rename' | 'mkdir' | 'unlink' | 'read'; arg: string }[];
} {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const ops: { kind: 'write' | 'rename' | 'mkdir' | 'unlink' | 'read'; arg: string }[] = [];
  return {
    files,
    dirs,
    ops,
    mkdir: async (dir) => {
      ops.push({ kind: 'mkdir', arg: dir });
      dirs.add(dir);
    },
    writeFile: async (file, data) => {
      ops.push({ kind: 'write', arg: file });
      files.set(file, data);
    },
    rename: async (from, to) => {
      ops.push({ kind: 'rename', arg: `${from}->${to}` });
      const data = files.get(from);
      if (data === undefined) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      files.set(to, data);
      files.delete(from);
    },
    readFile: async (file) => {
      ops.push({ kind: 'read', arg: file });
      const data = files.get(file);
      if (data === undefined) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return data;
    },
    unlink: async (file) => {
      ops.push({ kind: 'unlink', arg: file });
      files.delete(file);
    },
  };
}

describe('InMemoryHuggingFaceCache', () => {
  it('returns set values within TTL and undefined after expiry (OT6)', async () => {
    let now = 1_000_000;
    const cache = new InMemoryHuggingFaceCache({ now: () => now });
    await cache.set('k', { a: 1 }, 5_000);
    expect(await cache.get('k')).toEqual({ a: 1 });
    now += 5_001;
    expect(await cache.get('k')).toBeUndefined();
  });

  it('clear() drops all entries', async () => {
    const cache = new InMemoryHuggingFaceCache();
    await cache.set('a', 1, 10_000);
    await cache.set('b', 2, 10_000);
    await cache.clear();
    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBeUndefined();
  });

  it('treats negative TTL as immediate expiry', async () => {
    const cache = new InMemoryHuggingFaceCache({ now: () => 100 });
    await cache.set('k', 1, -1);
    expect(await cache.get('k')).toBeUndefined();
  });
});

describe('FileHuggingFaceCache', () => {
  it('writes via tmp+rename so a crash mid-write cannot corrupt (OT7)', async () => {
    const fs = memoryFs();
    const cache = new FileHuggingFaceCache({ dir: '/cache', fs, now: () => 1_000 });
    await cache.set('hf:list:author=Qwen', [{ id: 'Qwen/X' }], 60_000);

    const renameOp = fs.ops.find((op) => op.kind === 'rename');
    expect(renameOp).toBeDefined();
    expect(renameOp?.arg).toMatch(/\.tmp->.*\.json$/);
    expect(fs.dirs.has('/cache')).toBe(true);
    // Exactly one canonical .json file should exist after the rename completes.
    const canonical = [...fs.files.keys()].filter((f) => f.endsWith('.json'));
    expect(canonical).toHaveLength(1);
  });

  it('round-trips through write → read (OT7)', async () => {
    const fs = memoryFs();
    const cache = new FileHuggingFaceCache({ dir: '/cache', fs, now: () => 1_000 });
    await cache.set('hf:list:author=Qwen', [{ id: 'Qwen/X' }], 60_000);
    const value = await cache.get<{ id: string }[]>('hf:list:author=Qwen');
    expect(value).toEqual([{ id: 'Qwen/X' }]);
  });

  it('returns undefined when the file is missing (OT8)', async () => {
    const fs = memoryFs();
    const cache = new FileHuggingFaceCache({ dir: '/cache', fs });
    expect(await cache.get('missing')).toBeUndefined();
    expect(cache.lastWarning).toBeUndefined();
  });

  it('returns undefined when the envelope version does not match (OT8)', async () => {
    const fs = memoryFs();
    const cache = new FileHuggingFaceCache({ dir: '/cache', fs, now: () => 1_000 });
    // Seed a v0 envelope by hand to simulate an older format.
    await cache.set('seed', 1, 60_000);
    const file = [...fs.files.keys()][0]!;
    fs.files.set(
      file,
      JSON.stringify({ version: 0, key: 'seed', value: 1, writtenAt: 0, expiresAt: 99_999_999 })
    );
    expect(await cache.get('seed')).toBeUndefined();
    expect(cache.lastWarning).toBeUndefined();
  });

  it('returns undefined and emits a warning on corrupt JSON (OT8)', async () => {
    const fs = memoryFs();
    const cache = new FileHuggingFaceCache({ dir: '/cache', fs, now: () => 1_000 });
    await cache.set('seed', 1, 60_000);
    const file = [...fs.files.keys()][0]!;
    fs.files.set(file, '{ not valid json');
    expect(await cache.get('seed')).toBeUndefined();
    expect(cache.lastWarning?.code).toBe('hf_cache_corrupt');
  });

  it('treats expired entries as misses', async () => {
    const fs = memoryFs();
    let now = 1_000;
    const cache = new FileHuggingFaceCache({ dir: '/cache', fs, now: () => now });
    await cache.set('seed', 1, 5_000);
    expect(await cache.get('seed')).toBe(1);
    now += 5_001;
    expect(await cache.get('seed')).toBeUndefined();
  });

  it('surfaces a warning when mkdir fails and continues to degrade gracefully', async () => {
    const fs = memoryFs();
    const breaking: FileCacheFs = {
      ...fs,
      mkdir: () => Promise.reject(new Error('EACCES: read-only fs')),
    };
    const cache = new FileHuggingFaceCache({ dir: '/cache', fs: breaking });
    await cache.set('k', 1, 60_000);
    expect(cache.lastWarning?.code).toBe('hf_cache_mkdir_failed');
  });

  it('keys files via SHA-256 hex of the cache key', async () => {
    const fs = memoryFs();
    const cache = new FileHuggingFaceCache({ dir: '/cache', fs });
    await cache.set('hf:list:author=Qwen', { a: 1 }, 60_000);
    const file = [...fs.files.keys()][0]!;
    expect(file).toMatch(/^\/cache\/[a-f0-9]{64}\.json$/);
  });
});
