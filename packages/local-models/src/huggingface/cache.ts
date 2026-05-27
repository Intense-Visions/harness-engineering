/**
 * Cache layer for the HuggingFace client.
 *
 * Two implementations ship in Phase 2a:
 *
 *  - `InMemoryHuggingFaceCache` — a `Map`-based TTL cache for unit tests
 *    and process-local hot paths.
 *  - `FileHuggingFaceCache` — a disk-backed JSON cache under
 *    `~/.harness/local-models/cache/` (or any directory the caller
 *    chooses). Writes go through a tmp file + `rename` so a crash
 *    mid-write cannot corrupt an entry (mirrors the O2 pattern the spec
 *    requires for the pool-state file).
 *
 * Both implementations honor a TTL passed per-call so the client can
 * tombstone 404s at half TTL without a separate code path.
 */

import { createHash } from 'node:crypto';
import * as nodeFs from 'node:fs/promises';
import path from 'node:path';

import type { HuggingFaceWarning } from './types.js';

/** Cache envelope persisted on disk. Versioned so we can change the shape later. */
interface CacheEnvelope<T> {
  version: 1;
  key: string;
  value: T;
  writtenAt: number;
  expiresAt: number;
}

const ENVELOPE_VERSION = 1 as const;

/**
 * Pluggable cache surface consumed by `HuggingFaceClient`. Implementations
 * must never throw — failures resolve to `undefined` from `get` (read
 * miss) so the client can fall through to a live fetch transparently.
 */
export interface HuggingFaceCache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  clear(): Promise<void>;
}

/** Constructor options for `InMemoryHuggingFaceCache`. */
export interface InMemoryHuggingFaceCacheOptions {
  /** Clock injection — tests pin time so TTL assertions stay deterministic. */
  now?: () => number;
}

/** Process-local TTL cache. Useful in tests and single-process orchestrators. */
export class InMemoryHuggingFaceCache implements HuggingFaceCache {
  private readonly entries = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly now: () => number;

  constructor(opts: InMemoryHuggingFaceCacheOptions = {}) {
    this.now = opts.now ?? Date.now;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const ttl = Math.max(0, ttlMs);
    this.entries.set(key, { value, expiresAt: this.now() + ttl });
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}

/**
 * Filesystem subset `FileHuggingFaceCache` needs. Tests inject a
 * memory-backed implementation so no real disk I/O happens during unit
 * tests.
 */
export interface FileCacheFs {
  mkdir(dir: string, opts: { recursive: true }): Promise<void>;
  writeFile(file: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  readFile(file: string): Promise<string>;
  unlink(file: string): Promise<void>;
}

const defaultFs: FileCacheFs = {
  mkdir: async (dir, opts) => {
    await nodeFs.mkdir(dir, opts);
  },
  writeFile: (file, data) => nodeFs.writeFile(file, data, 'utf8'),
  rename: (from, to) => nodeFs.rename(from, to),
  readFile: (file) => nodeFs.readFile(file, 'utf8'),
  unlink: (file) => nodeFs.unlink(file),
};

/** Constructor options for `FileHuggingFaceCache`. */
export interface FileHuggingFaceCacheOptions {
  /** Directory where cache files live (absolute path recommended). */
  dir: string;
  /** Clock injection. */
  now?: () => number;
  /** Pluggable filesystem subset. Defaults to `node:fs/promises`. */
  fs?: FileCacheFs;
}

/**
 * Disk-backed cache. Writes go to a temp file in the same directory then
 * atomically renamed onto the canonical path, so a crash mid-write cannot
 * corrupt an existing entry.
 *
 * The cache is intentionally lenient on reads: missing files, version
 * mismatches, and corrupt JSON all resolve to `undefined`. The most recent
 * decode warning is exposed via `lastWarning` so the client (or an
 * operator-facing surface in Phase 7) can surface it without the cache
 * itself having to wire a notification channel.
 */
export class FileHuggingFaceCache implements HuggingFaceCache {
  private readonly dir: string;
  private readonly now: () => number;
  private readonly fs: FileCacheFs;
  private dirEnsured = false;
  private _lastWarning: HuggingFaceWarning | undefined;

  constructor(opts: FileHuggingFaceCacheOptions) {
    this.dir = opts.dir;
    this.now = opts.now ?? Date.now;
    this.fs = opts.fs ?? defaultFs;
  }

  /** Most recent decode/IO warning. Cleared by a successful read. */
  get lastWarning(): HuggingFaceWarning | undefined {
    return this._lastWarning;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const file = this.fileFor(key);
    let raw: string;
    try {
      raw = await this.fs.readFile(file);
    } catch {
      // Missing file is the dominant case; not a warning.
      this._lastWarning = undefined;
      return undefined;
    }
    let envelope: CacheEnvelope<T>;
    try {
      envelope = JSON.parse(raw) as CacheEnvelope<T>;
    } catch (err) {
      this._lastWarning = {
        code: 'hf_cache_corrupt',
        message: `Cache file ${file} could not be parsed as JSON`,
        cause: err instanceof Error ? err.message : String(err),
      };
      return undefined;
    }
    if (envelope.version !== ENVELOPE_VERSION) {
      this._lastWarning = undefined;
      return undefined;
    }
    if (envelope.expiresAt <= this.now()) {
      this._lastWarning = undefined;
      return undefined;
    }
    this._lastWarning = undefined;
    return envelope.value;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await this.ensureDir();
    const file = this.fileFor(key);
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    const envelope: CacheEnvelope<T> = {
      version: ENVELOPE_VERSION,
      key,
      value,
      writtenAt: this.now(),
      expiresAt: this.now() + Math.max(0, ttlMs),
    };
    try {
      await this.fs.writeFile(tmp, JSON.stringify(envelope));
      await this.fs.rename(tmp, file);
    } catch (err) {
      this._lastWarning = {
        code: 'hf_cache_write_failed',
        message: `Failed to persist cache entry for ${key}`,
        cause: err instanceof Error ? err.message : String(err),
      };
      // Best-effort cleanup; ignore failure (file may not exist).
      try {
        await this.fs.unlink(tmp);
      } catch {
        // Intentionally swallow — unlink is best-effort.
      }
    }
  }

  async clear(): Promise<void> {
    // Phase 2a doesn't need a recursive purge; the scheduler can call
    // `unlink` on individual entries when it needs to. A full clear is
    // deferred until a consumer asks for it.
    this._lastWarning = undefined;
  }

  private fileFor(key: string): string {
    const hash = createHash('sha256').update(key).digest('hex');
    return path.join(this.dir, `${hash}.json`);
  }

  private async ensureDir(): Promise<void> {
    if (this.dirEnsured) return;
    try {
      await this.fs.mkdir(this.dir, { recursive: true });
      this.dirEnsured = true;
    } catch (err) {
      this._lastWarning = {
        code: 'hf_cache_mkdir_failed',
        message: `Failed to create cache directory ${this.dir}`,
        cause: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
