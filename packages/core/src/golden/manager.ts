import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import {
  GoldenSnapshotSchema,
  DEFAULT_GOLDEN_MANIFEST_PATH,
  DEFAULT_GOLDEN_REFERENCE_PATHS,
} from './types';
import type { GoldenSnapshot, GoldenFileEntry, GoldenDiffResult, GoldenFileChange } from './types';

/** Provenance recorded on a promote. Both are informational (ignored by verify). */
export interface GoldenProvenance {
  commit: string;
  branch: string;
}

/** SHA-256 of a file's bytes, or null if the file does not exist. */
function hashFile(absPath: string): string | null {
  if (!existsSync(absPath)) return null;
  const bytes = readFileSync(absPath);
  return createHash('sha256').update(bytes).digest('hex');
}

/** True iff two file-entry arrays describe the same fingerprint (order-insensitive). */
function fingerprintsEqual(a: GoldenFileEntry[], b: GoldenFileEntry[]): boolean {
  if (a.length !== b.length) return false;
  const mapA = new Map(a.map((e) => [e.path, e.sha256]));
  for (const e of b) {
    if (mapA.get(e.path) !== e.sha256) return false;
  }
  return true;
}

/**
 * Manages the golden build — the canonical known-good reference state — stored
 * on disk at `.harness/golden/manifest.json` (by default) relative to the
 * project root.
 *
 * A golden snapshot is a composite fingerprint (SHA-256 per reference file)
 * that sits *above* the per-metric baselines: metric baselines answer "did
 * metric X regress numerically?"; the golden answers "is the repo still the
 * exact known-good shape we last trusted?" — an immutable reference-tag
 * snapshot, not a moving ratchet.
 */
export class GoldenBuildManager {
  private readonly projectRoot: string;
  private readonly manifestPath: string;
  private readonly referencePaths: string[];

  constructor(projectRoot: string, options?: { manifestPath?: string; referencePaths?: string[] }) {
    this.projectRoot = projectRoot;
    this.manifestPath = join(projectRoot, options?.manifestPath ?? DEFAULT_GOLDEN_MANIFEST_PATH);
    this.referencePaths = options?.referencePaths ?? [...DEFAULT_GOLDEN_REFERENCE_PATHS];
  }

  /**
   * Hash the current working-tree content of every configured reference path
   * that exists. Absent paths are omitted. Result is sorted by path so the
   * fingerprint is a deterministic function of the *set*, not of collection
   * order — a prerequisite for byte-stable manifests.
   */
  captureFiles(): GoldenFileEntry[] {
    const entries: GoldenFileEntry[] = [];
    for (const rel of this.referencePaths) {
      const sha256 = hashFile(join(this.projectRoot, rel));
      if (sha256 !== null) entries.push({ path: rel, sha256 });
    }
    entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return entries;
  }

  /** Build a fresh snapshot from the current working tree. */
  capture(provenance: GoldenProvenance): GoldenSnapshot {
    return {
      version: 1,
      promotedAt: new Date().toISOString(),
      commit: provenance.commit,
      branch: provenance.branch,
      files: this.captureFiles(),
    };
  }

  /** Load the golden manifest, or null if absent / invalid. */
  load(): GoldenSnapshot | null {
    if (!existsSync(this.manifestPath)) return null;
    try {
      const raw = readFileSync(this.manifestPath, 'utf-8');
      const parsed = GoldenSnapshotSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /**
   * Promote the current working tree to be the new golden build.
   *
   * If a golden already exists and the fingerprint is unchanged, the volatile
   * provenance (`promotedAt`/`commit`/`branch`) is preserved so the committed
   * manifest is byte-identical — a no-op re-promote never churns the file.
   * Returns the snapshot that was written and whether it changed on disk.
   */
  promote(provenance: GoldenProvenance): { snapshot: GoldenSnapshot; changed: boolean } {
    const fresh = this.capture(provenance);
    const existing = this.load();
    if (existing && fingerprintsEqual(existing.files, fresh.files)) {
      // No fingerprint change — keep the file byte-stable.
      this.save(existing);
      return { snapshot: existing, changed: false };
    }
    this.save(fresh);
    return { snapshot: fresh, changed: true };
  }

  /** Atomically write a snapshot to disk (temp file + rename). */
  save(snapshot: GoldenSnapshot): void {
    const dir = dirname(this.manifestPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = this.manifestPath + '.' + randomBytes(4).toString('hex') + '.tmp';
    writeFileSync(tmp, JSON.stringify(snapshot, null, 2) + '\n');
    renameSync(tmp, this.manifestPath);
  }

  /**
   * Compare the current working tree against a golden snapshot.
   *
   * `clean` is true iff the current fingerprint equals the golden fingerprint
   * exactly. Only `files` are compared; provenance fields are ignored.
   */
  diff(golden: GoldenSnapshot): GoldenDiffResult {
    const current = this.captureFiles();
    const currentByPath = new Map(current.map((e) => [e.path, e.sha256]));
    const goldenByPath = new Map(golden.files.map((e) => [e.path, e.sha256]));

    const changed: GoldenFileChange[] = [];
    const missing: GoldenFileChange[] = [];
    const added: GoldenFileChange[] = [];

    for (const entry of golden.files) {
      const currentHash = currentByPath.get(entry.path);
      if (currentHash === undefined) {
        missing.push({ path: entry.path, status: 'missing', goldenHash: entry.sha256 });
      } else if (currentHash !== entry.sha256) {
        changed.push({
          path: entry.path,
          status: 'changed',
          goldenHash: entry.sha256,
          currentHash,
        });
      }
    }

    for (const entry of current) {
      if (!goldenByPath.has(entry.path)) {
        added.push({ path: entry.path, status: 'added', currentHash: entry.sha256 });
      }
    }

    return {
      clean: changed.length === 0 && missing.length === 0 && added.length === 0,
      changed,
      missing,
      added,
    };
  }
}
