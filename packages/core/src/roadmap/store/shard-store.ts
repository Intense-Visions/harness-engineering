import type { Roadmap, Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import type {
  RoadmapStore,
  FeatureMutation,
  AddFeatureInput,
  Shard,
  RoadmapMeta,
} from './roadmap-store';
import type { FileIO } from './monolith-store';
import { parseShard, serializeShard } from './shard';
import { parseMeta } from './meta';
import { assembleRoadmap } from './assembler';

/** File IO for a shard directory: adds directory listing to `FileIO`. */
export interface ShardIO extends FileIO {
  /** List the entries (basenames) directly under `dir`. */
  listDir(dir: string): Promise<string[]>;
}

const META_FILE = '_meta.md';

function joinPath(dir: string, name: string): string {
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
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

  async patchFeature(slug: string, mutate: FeatureMutation): Promise<Result<void>> {
    const path = joinPath(this.shardDir, `${slug}.md`);
    let content: string;
    try {
      content = await this.io.readFile(path);
    } catch (err) {
      return Err(new Error(`patchFeature: shard "${slug}" not found: ${(err as Error).message}`));
    }
    const parsed = parseShard(content);
    if (!parsed.ok) return parsed;

    const updated: Shard = { ...parsed.value, feature: mutate(parsed.value.feature) };
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

  private async writeShard(path: string, shard: Shard): Promise<Result<void>> {
    try {
      await this.io.writeFile(path, serializeShard(shard));
    } catch (err) {
      return Err(new Error(`Failed to write shard ${path}: ${(err as Error).message}`));
    }
    return Ok(undefined);
  }
}
