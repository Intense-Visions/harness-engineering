import type { Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import { serializeRoadmap } from '../serialize';
import {
  UnreadableAssignmentHistoryError,
  extractAssignmentHistorySection,
  stripAssignmentHistorySection,
} from '../assignment-history';
import { assembleRoadmap } from './assembler';
import { readShardDir, shardMetaPath } from './shard-store';
import type { ShardIO } from './shard-store';

/** Options shared by {@link regenerate} and {@link writeRegeneratedRoadmap}. */
export interface RegenerateOptions {
  /**
   * Escape hatch for an unreadable `## Assignment History` section (#1862).
   *
   * The refusal that keeps regen from silently deleting the section fails READS,
   * not just writes — so a `_meta.md` whose history this build cannot parse wedges
   * every consumer, including the pre-commit regen that the repair commit itself
   * has to pass. Without a way out, the only recovery is bypassing that gate.
   *
   * With this set, regeneration proceeds and the unreadable section is carried
   * into the aggregate VERBATIM. That is lossless: nothing is dropped, so the
   * hatch cannot reintroduce the deletion the guard exists to stop. It forgives
   * ONLY the history-parse failure — any other read error still fails.
   */
  allowUnreadableHistory?: boolean;
}

/**
 * Regenerate the aggregate `roadmap.md` content from a shard directory:
 * read `_meta` + shards → `assembleRoadmap` → `serializeRoadmap`.
 *
 * Determinism is inherited: `readShardDir` reads in sorted order, `assembleRoadmap`
 * sorts deterministically, and `serializeRoadmap` is a pure deterministic emitter,
 * so two consecutive calls on the same shards return byte-identical output.
 */
export async function regenerate(
  shardDir: string,
  io: ShardIO,
  options: RegenerateOptions = {}
): Promise<Result<string>> {
  const read = await readShardDir(shardDir, io);
  if (read.ok) {
    const roadmap = assembleRoadmap(read.value.shards, read.value.meta);
    return Ok(serializeRoadmap(roadmap));
  }
  if (
    !options.allowUnreadableHistory ||
    !(read.error instanceof UnreadableAssignmentHistoryError)
  ) {
    return read;
  }
  return regenerateCarryingHistoryVerbatim(shardDir, io, read.error);
}

/**
 * The `allowUnreadableHistory` path: re-read the shard dir with `_meta.md`'s
 * unreadable history section spliced OUT (so the parse succeeds and yields an
 * empty history), then append that exact section text back onto the regenerated
 * aggregate.
 *
 * `serializeRoadmap` emits the history section last and ends the document with a
 * newline, so appending a blank line plus the verbatim section reproduces the
 * spacing a readable section would have had.
 *
 * Any failure to salvage — the meta file cannot be re-read, the section cannot be
 * located, the stripped document still does not parse — reports the ORIGINAL
 * history error rather than a second-order one, because that is the failure the
 * operator has to fix.
 */
async function regenerateCarryingHistoryVerbatim(
  shardDir: string,
  io: ShardIO,
  originalError: UnreadableAssignmentHistoryError
): Promise<Result<string>> {
  const metaPath = shardMetaPath(shardDir);
  let metaContent: string;
  try {
    metaContent = await io.readFile(metaPath);
  } catch {
    return Err(originalError);
  }

  const section = extractAssignmentHistorySection(metaContent);
  if (section === null) return Err(originalError);
  const strippedMeta = stripAssignmentHistorySection(metaContent);

  const withoutHistory: ShardIO = {
    ...io,
    readFile: async (path) => (path === metaPath ? strippedMeta : io.readFile(path)),
  };
  const read = await readShardDir(shardDir, withoutHistory);
  if (!read.ok) return Err(originalError);

  const aggregate = serializeRoadmap(assembleRoadmap(read.value.shards, read.value.meta));
  return Ok(`${aggregate}\n${section}\n`);
}

/**
 * Regenerate and write the aggregate `roadmap.md` to `roadmapPath`. This is the
 * derived read-aggregate; the shards remain the source of truth.
 */
export async function writeRegeneratedRoadmap(
  shardDir: string,
  roadmapPath: string,
  io: ShardIO,
  options: RegenerateOptions = {}
): Promise<Result<void>> {
  const regenerated = await regenerate(shardDir, io, options);
  if (!regenerated.ok) return regenerated;
  try {
    await io.writeFile(roadmapPath, regenerated.value);
  } catch (err) {
    return Err(
      new Error(`Failed to write regenerated roadmap at ${roadmapPath}: ${(err as Error).message}`)
    );
  }
  return Ok(undefined);
}
