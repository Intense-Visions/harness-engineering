import type { Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import type { Shard } from './roadmap-store';
import { ARCHIVE_SUBDIR, type ShardIO } from './shard-store';
import { parseShard } from './shard';

/**
 * Sharded-archive motion for the roadmap store.
 *
 * The sharded roadmap (`docs/roadmap.d/<slug>.md`, one file per row) accumulates
 * `done` rows and bloats the active set. This module MOVES a `done` shard into a
 * sibling sharded archive `docs/roadmap.d/archive/<slug>.md`, preserving the
 * shard file byte-for-byte (full frontmatter + body) so the move is lossless and
 * reversible. `readShardDir` (the active read/regenerate path) already excludes
 * the `archive/` subdirectory, so archived shards never re-appear in the active
 * aggregate or in `load()`/active queries — the archive is history, not active
 * state. (Regenerating the aggregate after a move is the factory's job, so this
 * module never names or touches the aggregate file — invariant R.)
 *
 * Kept separate from the whole-file monolith archive (`docs/roadmap-archive.md`,
 * written by the CLI groom handler): the sharded path preserves the per-row shard
 * shape; the monolith path stays a single aggregate document.
 */

/** Normalized join used for archive IO paths (`/`-delimited on every OS). */
function joinPath(dir: string, name: string): string {
  const d = dir.replaceAll('\\', '/');
  return d.endsWith('/') ? `${d}${name}` : `${d}/${name}`;
}

/** The archive subdirectory path for a given active shard directory. */
export function archiveShardDir(shardDir: string): string {
  return joinPath(shardDir, ARCHIVE_SUBDIR);
}

/** Outcome of an archive/restore move: slugs actually moved, plus those skipped. */
export interface ShardArchiveResult {
  /** Slugs whose shard file was moved. */
  moved: string[];
  /** Slugs whose source shard was absent (no-op, never an error). */
  skipped: string[];
}

/**
 * Move `slugs` from the active shard dir into `archive/`, preserving each shard
 * file byte-for-byte. Idempotent per slug: a slug whose active shard is missing
 * (already archived, or never existed) is recorded in `skipped` rather than
 * failing, so a re-run after a partial move converges. Any other IO failure
 * (write/delete) short-circuits with `Err` — the source file is only deleted
 * once its archive copy has been written, so a failure cannot lose the row.
 */
export async function archiveShards(
  shardDir: string,
  io: ShardIO,
  slugs: string[]
): Promise<Result<ShardArchiveResult>> {
  return moveShards(shardDir, archiveShardDir(shardDir), io, slugs);
}

/**
 * Reverse of {@link archiveShards}: move `slugs` from `archive/` back into the
 * active shard dir, byte-for-byte. Makes the archive motion reversible (a done
 * row wrongly archived can be brought back into the active set). Same idempotent
 * / write-before-delete safety as archiving.
 */
export async function restoreShards(
  shardDir: string,
  io: ShardIO,
  slugs: string[]
): Promise<Result<ShardArchiveResult>> {
  return moveShards(archiveShardDir(shardDir), shardDir, io, slugs);
}

/**
 * Read + parse every shard currently under `archive/`. Returns an empty list
 * when the archive directory does not exist yet. Used to query archived history
 * without polluting the active read path. Reuses the same filename↔slug and
 * duplicate-slug integrity guards as the active reader.
 */
export async function readArchivedShards(shardDir: string, io: ShardIO): Promise<Result<Shard[]>> {
  const dir = archiveShardDir(shardDir);
  let entries: string[];
  try {
    entries = await io.listDir(dir);
  } catch {
    // No archive directory yet — nothing archived.
    return Ok([]);
  }

  const files = entries.filter((n) => n.endsWith('.md')).sort();
  const shards: Shard[] = [];
  const seen = new Set<string>();
  for (const name of files) {
    let content: string;
    try {
      content = await io.readFile(joinPath(dir, name));
    } catch (err) {
      return Err(new Error(`Failed to read archived shard ${name}: ${(err as Error).message}`));
    }
    const parsed = parseShard(content);
    if (!parsed.ok) return parsed;

    const slug = parsed.value.slug;
    if (seen.has(slug)) {
      return Err(new Error(`Duplicate archived shard slug "${slug}" in ${dir}`));
    }
    seen.add(slug);

    const base = name.slice(0, -'.md'.length);
    if (base !== slug) {
      return Err(
        new Error(
          `Archived shard file "${name}" has mismatched frontmatter slug "${slug}" (expected "${base}")`
        )
      );
    }
    shards.push(parsed.value);
  }
  return Ok(shards);
}

/**
 * Move `slugs` from `fromDir` to `toDir`, one `<slug>.md` at a time, preserving
 * bytes. Write-before-delete keeps the move crash-safe; a missing source is a
 * skip, not a failure (idempotent re-runs).
 */
async function moveShards(
  fromDir: string,
  toDir: string,
  io: ShardIO,
  slugs: string[]
): Promise<Result<ShardArchiveResult>> {
  const moved: string[] = [];
  const skipped: string[] = [];
  for (const slug of slugs) {
    const src = joinPath(fromDir, `${slug}.md`);
    let content: string;
    try {
      content = await io.readFile(src);
    } catch {
      // Source absent → already moved / never existed. Idempotent no-op.
      skipped.push(slug);
      continue;
    }
    const dest = joinPath(toDir, `${slug}.md`);
    try {
      await io.writeFile(dest, content);
    } catch (err) {
      return Err(new Error(`Failed to write shard ${dest}: ${(err as Error).message}`));
    }
    try {
      await io.deleteFile(src);
    } catch (err) {
      return Err(new Error(`Failed to remove source shard ${src}: ${(err as Error).message}`));
    }
    moved.push(slug);
  }
  return Ok({ moved, skipped });
}
