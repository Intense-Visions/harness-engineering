import { describe, it, expect } from 'vitest';

import {
  HarnessFitCacheFileStore,
  type HarnessFitCacheFilesystem,
} from '../../src/capability/harness-fit-cache-store.js';
import { isCacheFresh, probeCacheKey } from '../../src/capability/probe-policy.js';

/**
 * The persistent buildQuality cache + cadence store (Task 2 wiring). Backed by a
 * JSON file under the local-models state dir, with an in-memory fallback. Every
 * test drives an injected in-memory filesystem — NO real disk. Proves:
 *   - set/get round-trips a `buildQuality` entry keyed by model+version;
 *   - the entry survives a persist → reload (a NEW store over the same fs);
 *   - freshness (via the pure `isCacheFresh`) works against a persisted entry;
 *   - `getLastProbeAt` / `setLastProbeAt` cadence persistence round-trips;
 *   - a missing / malformed file degrades to an empty in-memory store (fail-open).
 */

const PATH = '/tmp/lmlm-hf/harness-fit-cache.json';

function memFs(seed: Record<string, string> = {}): {
  fs: HarnessFitCacheFilesystem;
  files: Record<string, string>;
} {
  const files: Record<string, string> = { ...seed };
  const fs: HarnessFitCacheFilesystem = {
    async readFile(path) {
      if (path in files) return files[path] as string;
      const err = new Error(`ENOENT: ${path}`) as Error & { code: string };
      err.code = 'ENOENT';
      throw err;
    },
    async writeFile(path, contents) {
      files[path] = contents;
    },
    async rename(from, to) {
      files[to] = files[from] as string;
      delete files[from];
    },
    async mkdir() {},
  };
  return { fs, files };
}

const KEY = probeCacheKey({ hfRepoId: 'Org/Builder', ollamaName: 'builder:1', quant: 'Q4_K_M' });

describe('HarnessFitCacheStore — buildQuality persistence', () => {
  it('set/get round-trips an entry (in-memory, before any persist)', async () => {
    const { fs } = memFs();
    const store = new HarnessFitCacheFileStore({ path: PATH, fs });
    await store.load();
    expect(store.get(KEY)).toBeUndefined();

    store.set(KEY, { buildQuality: 0.95, probedAt: 1000 });
    expect(store.get(KEY)).toEqual({ buildQuality: 0.95, probedAt: 1000 });
  });

  it('persists then reloads across a fresh store over the same filesystem', async () => {
    const { fs, files } = memFs();
    const a = new HarnessFitCacheFileStore({ path: PATH, fs });
    await a.load();
    a.set(KEY, { buildQuality: 0.42, probedAt: 5000 });
    await a.persist();
    expect(files[PATH]).toBeTruthy(); // physically written

    const b = new HarnessFitCacheFileStore({ path: PATH, fs });
    await b.load();
    expect(b.get(KEY)).toEqual({ buildQuality: 0.42, probedAt: 5000 });
  });

  it('a persisted entry is judged fresh/stale by the pure isCacheFresh predicate', async () => {
    const { fs } = memFs();
    const a = new HarnessFitCacheFileStore({ path: PATH, fs });
    await a.load();
    a.set(KEY, { buildQuality: 0.9, probedAt: 1_000 });
    await a.persist();

    const b = new HarnessFitCacheFileStore({ path: PATH, fs });
    await b.load();
    const entry = b.get(KEY)!;
    expect(isCacheFresh(entry, 1_500, 1_000)).toBe(true); // age 500 < ttl 1000
    expect(isCacheFresh(entry, 3_000, 1_000)).toBe(false); // age 2000 >= ttl 1000
  });

  it('cadence persistence: getLastProbeAt / setLastProbeAt round-trip across reload', async () => {
    const { fs } = memFs();
    const a = new HarnessFitCacheFileStore({ path: PATH, fs });
    await a.load();
    expect(await a.getLastProbeAt()).toBeUndefined();

    await a.setLastProbeAt(1_700_000_000_000);
    expect(await a.getLastProbeAt()).toBe(1_700_000_000_000);

    const b = new HarnessFitCacheFileStore({ path: PATH, fs });
    await b.load();
    expect(await b.getLastProbeAt()).toBe(1_700_000_000_000);
  });

  it('degrades to an empty store on a missing file (first run — no throw)', async () => {
    const { fs } = memFs();
    const store = new HarnessFitCacheFileStore({ path: PATH, fs });
    await expect(store.load()).resolves.toBeUndefined();
    expect(store.get(KEY)).toBeUndefined();
    expect(await store.getLastProbeAt()).toBeUndefined();
  });

  it('degrades to an empty store on a malformed file (fail-open + warn)', async () => {
    const warnings: string[] = [];
    const { fs } = memFs({ [PATH]: '{ this is not json' });
    const store = new HarnessFitCacheFileStore({
      path: PATH,
      fs,
      onWarn: (m) => warnings.push(m),
    });
    await store.load();
    expect(store.get(KEY)).toBeUndefined();
    expect(warnings.length).toBeGreaterThan(0);
  });
});
