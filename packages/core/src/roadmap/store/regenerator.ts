import type { Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import { serializeRoadmap } from '../serialize';
import { assembleRoadmap } from './assembler';
import { readShardDir } from './shard-store';
import type { ShardIO } from './shard-store';

/**
 * Regenerate the aggregate `roadmap.md` content from a shard directory:
 * read `_meta` + shards → `assembleRoadmap` → `serializeRoadmap`.
 *
 * Determinism is inherited: `readShardDir` reads in sorted order, `assembleRoadmap`
 * sorts deterministically, and `serializeRoadmap` is a pure deterministic emitter,
 * so two consecutive calls on the same shards return byte-identical output.
 */
export async function regenerate(shardDir: string, io: ShardIO): Promise<Result<string>> {
  const read = await readShardDir(shardDir, io);
  if (!read.ok) return read;
  const roadmap = assembleRoadmap(read.value.shards, read.value.meta);
  return Ok(serializeRoadmap(roadmap));
}

/**
 * Regenerate and write the aggregate `roadmap.md` to `roadmapPath`. This is the
 * derived read-aggregate; the shards remain the source of truth.
 */
export async function writeRegeneratedRoadmap(
  shardDir: string,
  roadmapPath: string,
  io: ShardIO
): Promise<Result<void>> {
  const regenerated = await regenerate(shardDir, io);
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
