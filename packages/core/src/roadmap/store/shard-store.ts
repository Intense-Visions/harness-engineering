import type {
  Roadmap,
  RoadmapFrontmatter,
  AssignmentRecord,
  Result,
} from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import type {
  RoadmapStore,
  FeatureMutation,
  AddFeatureInput,
  Shard,
  RoadmapMeta,
} from './roadmap-store';
import type { FileIO } from './monolith-store';
import { slugifyFeatureName } from './monolith-store';
import { parseShard, serializeShard } from './shard';
import { parseMeta, serializeMeta } from './meta';
import { assembleRoadmap } from './assembler';

/** File IO for a shard directory: adds directory listing + delete to `FileIO`. */
export interface ShardIO extends FileIO {
  /** List the entries (basenames) directly under `dir`. */
  listDir(dir: string): Promise<string[]>;
  /** Delete a single file. Should reject if the file does not exist. */
  deleteFile(path: string): Promise<void>;
}

const META_FILE = '_meta.md';

function joinPath(dir: string, name: string): string {
  // Normalize Windows backslashes so shard IO paths are '/'-delimited on every OS
  // (the injected-IO contract expects '/'; Node fs accepts '/' on Windows).
  const d = dir.replaceAll('\\', '/');
  return d.endsWith('/') ? `${d}${name}` : `${d}/${name}`;
}

/**
 * Read + parse every shard plus `_meta.md` from a shard directory. Shared by
 * `ShardStore.load()` and the regenerator so directory globbing/parsing lives in
 * one place. `_meta.md` is excluded from the shard glob (load-bearing: parsing it
 * as a row would corrupt assembly). Shard files are read in sorted order for
 * deterministic error reporting; final ordering is the assembler's job.
 */
export async function readShardDir(
  shardDir: string,
  io: ShardIO
): Promise<Result<{ shards: Shard[]; meta: RoadmapMeta }>> {
  let entries: string[];
  try {
    entries = await io.listDir(shardDir);
  } catch (err) {
    return Err(new Error(`Failed to list shard dir ${shardDir}: ${(err as Error).message}`));
  }

  const shardFiles = entries.filter((n) => n.endsWith('.md') && n !== META_FILE).sort();

  const shards: Shard[] = [];
  const seenSlugs = new Set<string>();
  for (const name of shardFiles) {
    let content: string;
    try {
      content = await io.readFile(joinPath(shardDir, name));
    } catch (err) {
      return Err(new Error(`Failed to read shard ${name}: ${(err as Error).message}`));
    }
    const parsed = parseShard(content);
    if (!parsed.ok) return parsed;

    // Integrity guards (prevent silent data loss): the filename must match the
    // frontmatter slug (the slug is the file's identity), and no two shards may
    // declare the same slug.
    const slug = parsed.value.slug;
    if (seenSlugs.has(slug)) {
      return Err(new Error(`Duplicate shard slug "${slug}" across files in ${shardDir}`));
    }
    seenSlugs.add(slug);

    const base = name.slice(0, -'.md'.length);
    if (base !== slug) {
      return Err(
        new Error(
          `Shard file "${name}" has mismatched frontmatter slug "${slug}" (expected "${base}")`
        )
      );
    }

    shards.push(parsed.value);
  }

  let metaContent: string;
  try {
    metaContent = await io.readFile(joinPath(shardDir, META_FILE));
  } catch (err) {
    return Err(new Error(`Failed to read ${META_FILE} in ${shardDir}: ${(err as Error).message}`));
  }
  const meta = parseMeta(metaContent);
  if (!meta.ok) return meta;

  return Ok({ shards, meta: meta.value });
}

/**
 * Sharded backend: one file per row under `shardDir` plus a `_meta.md`. `load()`
 * assembles them into the same in-memory `Roadmap` as `MonolithStore` (store
 * parity). `patchFeature`/`addFeature` rewrite exactly one shard file — the
 * conflict-free single-row write guarantee.
 */
export class ShardStore implements RoadmapStore {
  private readonly shardDir: string;
  private readonly io: ShardIO;

  constructor(options: { shardDir: string; io: ShardIO }) {
    this.shardDir = options.shardDir;
    this.io = options.io;
  }

  async load(): Promise<Result<Roadmap>> {
    const read = await readShardDir(this.shardDir, this.io);
    if (!read.ok) return read;
    return Ok(assembleRoadmap(read.value.shards, read.value.meta));
  }

  /**
   * Resolve the on-disk shard addressed by a diff-supplied `slug`. `applyRoadmapDiff`
   * computes the slug as `slugifyFeatureName(feature.name)`, but a shard's real file
   * identity is its frontmatter `slug` — frequently a hand-shortened / length-truncated
   * form of the title, so the two diverge for many rows (#1036). Try the direct
   * `{slug}.md` first (the common case where they match); on a miss, scan the shard dir
   * for the shard whose feature name slugifies to `slug` and address it by its real
   * frontmatter slug. Returns the resolved path + parsed shard, or `Err` when no shard
   * matches (a genuinely absent row) or the directory/shard fails to read/parse.
   *
   * Prior to this the slug mismatch surfaced as an ENOENT that aborted the whole
   * writeback batch — silently dropping every external-ID backfill and, worst case,
   * re-creating a duplicate tracker issue on the next run.
   */
  private async resolveShard(slug: string): Promise<Result<{ path: string; shard: Shard }>> {
    const direct = joinPath(this.shardDir, `${slug}.md`);
    let directContent: string | null = null;
    try {
      directContent = await this.io.readFile(direct);
    } catch {
      // Not addressable by the diff slug as a filename — fall through to the
      // name-slug scan below (the title-slug ≠ frontmatter-slug case, #1036).
    }
    if (directContent !== null) {
      const parsed = parseShard(directContent);
      if (!parsed.ok) return parsed;
      return Ok({ path: direct, shard: parsed.value });
    }

    const read = await readShardDir(this.shardDir, this.io);
    if (!read.ok) return read;
    for (const shard of read.value.shards) {
      if (slugifyFeatureName(shard.feature.name) === slug) {
        return Ok({ path: joinPath(this.shardDir, `${shard.slug}.md`), shard });
      }
    }
    return Err(
      new Error(
        `shard "${slug}" not found: no file named "${slug}.md" and no row whose name ` +
          `slugifies to it in ${this.shardDir}`
      )
    );
  }

  async patchFeature(slug: string, mutate: FeatureMutation): Promise<Result<void>> {
    const resolved = await this.resolveShard(slug);
    if (!resolved.ok) return Err(new Error(`patchFeature: ${resolved.error.message}`));
    const { path, shard } = resolved.value;

    const updated: Shard = { ...shard, feature: mutate(shard.feature) };
    return this.writeShard(path, updated);
  }

  async addFeature(input: AddFeatureInput): Promise<Result<void>> {
    const path = joinPath(this.shardDir, `${input.slug}.md`);

    // Collision guard (prevent silent overwrite / data loss): refuse to add when a
    // shard already exists for this slug. A successful read means the file exists.
    try {
      await this.io.readFile(path);
      return Err(new Error(`addFeature: shard "${input.slug}" already exists`));
    } catch {
      // Not found -> safe to create.
    }

    const shard: Shard = {
      slug: input.slug,
      milestone: input.milestone,
      order: input.order,
      feature: input.feature,
    };
    return this.writeShard(path, shard);
  }

  async removeFeature(slug: string): Promise<Result<void>> {
    // Resolve the real file first so a title-slug ≠ frontmatter-slug row (#1036)
    // deletes the correct shard instead of ENOENT-ing on the diff slug.
    const resolved = await this.resolveShard(slug);
    if (!resolved.ok) return Err(new Error(`removeFeature: ${resolved.error.message}`));
    try {
      await this.io.deleteFile(resolved.value.path);
    } catch (err) {
      return Err(
        new Error(`removeFeature: failed to delete shard "${slug}": ${(err as Error).message}`)
      );
    }
    return Ok(undefined);
  }

  // Frontmatter in sharded mode lives in `_meta.md`, and the aggregate is
  // regenerated from it. Per-feature writes deliberately do NOT touch `_meta`
  // so that a single-feature mutation rewrites exactly one shard (conflict-free).
  // Bumping roadmap-level frontmatter is therefore a no-op here.
  async patchFrontmatter(
    _mutate: (frontmatter: RoadmapFrontmatter) => RoadmapFrontmatter
  ): Promise<Result<void>> {
    return Ok(undefined);
  }

  // The assignment audit log is roadmap-level and NOT derivable from shards, so it
  // genuinely persists — to `_meta.md`, never a feature shard. Concurrent writers
  // that only mutate feature shards never touch `_meta`, so this stays off the
  // single-shard write path for ordinary status edits.
  async patchAssignmentHistory(history: AssignmentRecord[]): Promise<Result<void>> {
    const metaPath = joinPath(this.shardDir, META_FILE);
    let content: string;
    try {
      content = await this.io.readFile(metaPath);
    } catch (err) {
      return Err(
        new Error(`Failed to read ${META_FILE} in ${this.shardDir}: ${(err as Error).message}`)
      );
    }
    const parsed = parseMeta(content);
    if (!parsed.ok) return parsed;
    const updated = { ...parsed.value, assignmentHistory: history };
    try {
      await this.io.writeFile(metaPath, serializeMeta(updated));
    } catch (err) {
      return Err(new Error(`Failed to write ${metaPath}: ${(err as Error).message}`));
    }
    return Ok(undefined);
  }

  // `lastSynced` is roadmap-level and lives in `_meta.md` in sharded mode (the
  // aggregate's frontmatter is regenerated from it), so — unlike `patchFrontmatter`,
  // which no-ops here to keep per-feature writes off `_meta` — stamping it must
  // genuinely rewrite `_meta.md`. No feature shard is touched, so ordinary status
  // edits still stay off this path (#1037).
  async stampLastSynced(timestamp: string): Promise<Result<void>> {
    const metaPath = joinPath(this.shardDir, META_FILE);
    let content: string;
    try {
      content = await this.io.readFile(metaPath);
    } catch (err) {
      return Err(
        new Error(`Failed to read ${META_FILE} in ${this.shardDir}: ${(err as Error).message}`)
      );
    }
    const parsed = parseMeta(content);
    if (!parsed.ok) return parsed;
    const updated: RoadmapMeta = {
      ...parsed.value,
      frontmatter: { ...parsed.value.frontmatter, lastSynced: timestamp },
    };
    try {
      await this.io.writeFile(metaPath, serializeMeta(updated));
    } catch (err) {
      return Err(new Error(`Failed to write ${metaPath}: ${(err as Error).message}`));
    }
    return Ok(undefined);
  }

  private async writeShard(path: string, shard: Shard): Promise<Result<void>> {
    try {
      await this.io.writeFile(path, serializeShard(shard));
    } catch (err) {
      return Err(new Error(`Failed to write shard ${path}: ${(err as Error).message}`));
    }
    return Ok(undefined);
  }
}
