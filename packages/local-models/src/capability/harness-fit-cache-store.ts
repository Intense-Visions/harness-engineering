// packages/local-models/src/capability/harness-fit-cache-store.ts
//
// The persistent buildQuality cache + cadence store (harness-fit-probe D5, Task 2).
// The pure probe policy (probe-policy.ts) depends only on the `HarnessFitCacheStore`
// INTERFACE + `probeCacheKey` freshness; this file is the concrete disk-backed impl the
// composition root injects, mirroring `PoolStateStore`'s pattern: an in-memory map, a
// narrow `Filesystem` port for testability, atomic `writeFile(tmp) → rename` semantics,
// and graceful degradation (missing / malformed / version-mismatched file ⇒ empty
// in-memory store + one structured warning, never a throw).
//
// It also owns the probe CADENCE timestamp (`lastProbeAt`) — the scheduler's
// `getLastProbeAt`/`setLastProbeAt` seam — so a single JSON file under
// `~/.harness/local-models/` carries both the per-model `buildQuality` cache and "when
// the probe pass last ran". Kept synchronous for `get`/`set` so the pure policy can
// consult it inline; only `load`/`persist` touch disk.
//
// FAIL-OPEN throughout: a read/parse failure degrades to an empty store, so a corrupt
// cache can only cause a re-probe, never break the refresh tick.
//
// @see docs/changes/harness-fit-probe/proposal.md (D5, D6)

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

import type {
  HarnessFitCacheEntry,
  HarnessFitCacheStore as HarnessFitCacheStoreApi,
} from './probe-policy.js';

/** Schema version of the persisted file. Bumped when the on-disk shape changes. */
export const HARNESS_FIT_CACHE_VERSION = 1;

/** Default on-disk cache path. Mirrors `PoolStateStore`'s `~/.harness/local-models/`. */
export const DEFAULT_HARNESS_FIT_CACHE_PATH = join(
  homedir(),
  '.harness',
  'local-models',
  'harness-fit-cache.json'
);

/** Envelope written to disk — `version` lets a future migration distinguish layouts. */
export interface HarnessFitCacheFile {
  version: number;
  /** Per-model+version `buildQuality` cache, keyed by {@link probeCacheKey}. */
  entries: Record<string, HarnessFitCacheEntry>;
  /** Epoch-ms the probe pass last ran, or absent if it never has. */
  lastProbeAt?: number;
}

/** Narrow filesystem surface the store needs (mirrors `PoolFilesystem`). */
export interface HarnessFitCacheFilesystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, contents: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  mkdir(path: string, options: { recursive: boolean }): Promise<void>;
}

const defaultFs: HarnessFitCacheFilesystem = {
  readFile: (path) => readFile(path, 'utf-8'),
  writeFile: (path, contents) => writeFile(path, contents, 'utf-8'),
  rename: (from, to) => rename(from, to),
  mkdir: (path, options) => mkdir(path, options).then(() => undefined),
};

/** Optional path + filesystem + warn sink; every default falls through to production. */
export interface HarnessFitCacheStoreOptions {
  /** Absolute path to the cache file. Defaults to `~/.harness/local-models/harness-fit-cache.json`. */
  path?: string;
  /** Filesystem port. Defaults to `node:fs/promises` adapter. */
  fs?: HarnessFitCacheFilesystem;
  /** Optional structured logger; defaults to a silent no-op. */
  onWarn?: (message: string, cause?: unknown) => void;
}

/**
 * Disk-backed {@link HarnessFitCacheStoreApi} + cadence persistence. Satisfies the pure
 * policy's synchronous `get`/`set` cache interface AND the scheduler's async
 * `getLastProbeAt`/`setLastProbeAt` cadence seam. `set`/`setLastProbeAt` mutate the
 * in-memory record and persist best-effort; `load` hydrates from disk (idempotent,
 * degrades to empty on any failure).
 */
export class HarnessFitCacheFileStore implements HarnessFitCacheStoreApi {
  private readonly path: string;
  private readonly fs: HarnessFitCacheFilesystem;
  private readonly onWarn: (message: string, cause?: unknown) => void;
  private entries = new Map<string, HarnessFitCacheEntry>();
  private lastProbeAt: number | undefined;
  private loaded = false;
  /** Serializes persists so a fire-and-forget `set` write can't race an explicit one. */
  private persistChain: Promise<void> = Promise.resolve();

  constructor(options: HarnessFitCacheStoreOptions = {}) {
    this.path = options.path ?? DEFAULT_HARNESS_FIT_CACHE_PATH;
    this.fs = options.fs ?? defaultFs;
    this.onWarn = options.onWarn ?? (() => undefined);
  }

  /**
   * Hydrate from the on-disk file. Idempotent — repeated calls are no-ops. Tolerates:
   * missing file (no warn — first run), malformed JSON, version mismatch, shape
   * mismatch. None throw; all reset to an empty store and (except missing file) warn.
   */
  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    let raw: string;
    try {
      raw = await this.fs.readFile(this.path);
    } catch (err) {
      if (!isNotFound(err)) {
        this.onWarn(`harness-fit cache read failed at ${this.path}`, err);
      }
      this.resetEmpty();
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      this.onWarn(`harness-fit cache file is not valid JSON at ${this.path}`, err);
      this.resetEmpty();
      return;
    }
    if (!isCacheFile(parsed)) {
      this.onWarn(`harness-fit cache file has an unexpected shape at ${this.path}`);
      this.resetEmpty();
      return;
    }
    if (parsed.version !== HARNESS_FIT_CACHE_VERSION) {
      this.onWarn(
        `harness-fit cache schema version ${String(parsed.version)} at ${this.path} ` +
          `does not match expected ${String(HARNESS_FIT_CACHE_VERSION)}; ignoring on-disk record`
      );
      this.resetEmpty();
      return;
    }
    this.entries = new Map(Object.entries(parsed.entries));
    this.lastProbeAt = parsed.lastProbeAt;
  }

  /** Look up a cached `buildQuality` for `key` (synchronous — the pure policy consults inline). */
  get(key: string): HarnessFitCacheEntry | undefined {
    return this.entries.get(key);
  }

  /** Record `entry` for `key`, then persist best-effort (the scheduler awaits nothing here). */
  set(key: string, entry: HarnessFitCacheEntry): void {
    this.entries.set(key, entry);
    void this.persist();
  }

  /** When the probe pass last ran, or `undefined` if it never has (⇒ due). */
  async getLastProbeAt(): Promise<number | undefined> {
    await this.load(); // idempotent; guarantees the persisted cadence is hydrated first
    return this.lastProbeAt;
  }

  /** Persist the cadence timestamp after a pass runs. */
  async setLastProbeAt(at: number): Promise<void> {
    this.lastProbeAt = at;
    await this.persist();
  }

  /**
   * Atomically persist the current record to disk (`${path}.tmp` then rename). Failures
   * are swallowed to a warning — a persistence miss can only cost a re-probe, never
   * break the tick. Persists are SERIALIZED on an internal chain so a fire-and-forget
   * `set()` write cannot interleave its tmp+rename with an explicit `persist()` (the
   * two-writers-one-tmp race that would drop the file).
   */
  async persist(): Promise<void> {
    this.persistChain = this.persistChain.then(() => this.persistNow());
    return this.persistChain;
  }

  private async persistNow(): Promise<void> {
    const file: HarnessFitCacheFile = {
      version: HARNESS_FIT_CACHE_VERSION,
      entries: Object.fromEntries(this.entries),
      ...(this.lastProbeAt !== undefined ? { lastProbeAt: this.lastProbeAt } : {}),
    };
    const tmp = `${this.path}.tmp`;
    try {
      await this.fs.mkdir(dirname(this.path), { recursive: true });
      await this.fs.writeFile(tmp, JSON.stringify(file, null, 2));
      await this.fs.rename(tmp, this.path);
    } catch (err) {
      this.onWarn(`harness-fit cache persist failed at ${this.path}`, err);
    }
  }

  private resetEmpty(): void {
    this.entries = new Map();
    this.lastProbeAt = undefined;
  }
}

/** Type guard for the persisted envelope — a hand-edited/corrupt file degrades gracefully. */
function isCacheFile(value: unknown): value is HarnessFitCacheFile {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.version !== 'number') return false;
  if (typeof obj.entries !== 'object' || obj.entries === null) return false;
  if (obj.lastProbeAt !== undefined && typeof obj.lastProbeAt !== 'number') return false;
  return Object.values(obj.entries as Record<string, unknown>).every(isCacheEntry);
}

function isCacheEntry(value: unknown): value is HarnessFitCacheEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  if (typeof e.probedAt !== 'number') return false;
  return e.buildQuality === undefined || typeof e.buildQuality === 'number';
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'ENOENT'
  );
}
