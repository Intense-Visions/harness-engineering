import { Command } from 'commander';
import * as path from 'node:path';
import {
  Ok,
  Err,
  parseRoadmap,
  roadmapToShards,
  assertSemanticRoundTrip,
  serializeShard,
  serializeMeta,
  writeRegeneratedRoadmap,
} from '@harness-engineering/core';
import type { Result } from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';
import { createNodeShardIO } from './shard-io';
import type { NodeShardIO } from './shard-io';

export interface RoadmapShardOptions {
  cwd?: string;
  dryRun?: boolean;
  format?: 'human' | 'json';
  force?: boolean;
  io?: NodeShardIO;
}

/** Summary of a shard migration (also the `--dry-run` plan). */
export interface ShardReport {
  shardCount: number;
  milestoneCount: number;
  /** The disambiguated shard slugs, in document order. */
  disambiguated: string[];
  roundTrip: boolean;
}

/**
 * Migrate a monolith `docs/roadmap.md` to per-row shards under `docs/roadmap.d/`
 * plus a `_meta.md`, then regenerate the monolith from those shards.
 *
 * Safety: the semantic round-trip is asserted BEFORE any destructive write. If
 * it fails, the command aborts and leaves `docs/roadmap.md` byte-unchanged with
 * no shard files written (proven in shard.test.ts). The monolith is rewritten
 * ONLY via `writeRegeneratedRoadmap`, never hand-edited (read-source invariant R).
 */
export async function runRoadmapShard(
  opts: RoadmapShardOptions = {}
): Promise<Result<ShardReport, CLIError>> {
  const cwd = opts.cwd ?? process.cwd();
  const io = opts.io ?? createNodeShardIO();
  const roadmapPath = path.join(cwd, 'docs', 'roadmap.md');
  const shardDir = path.join(cwd, 'docs', 'roadmap.d');

  if (!(await io.exists(roadmapPath))) {
    return Err(new CLIError('docs/roadmap.md not found', ExitCode.ERROR));
  }

  let raw: string;
  try {
    raw = await io.readFile(roadmapPath);
  } catch (err) {
    return Err(new CLIError(`Failed to read docs/roadmap.md: ${(err as Error).message}`));
  }

  const parsed = parseRoadmap(raw);
  if (!parsed.ok) {
    return Err(new CLIError(`Failed to parse docs/roadmap.md: ${parsed.error.message}`));
  }

  const { shards, meta } = roadmapToShards(parsed.value);

  // Load-bearing: assert the round-trip BEFORE any write. On failure, abort with
  // the monolith untouched.
  const rt = assertSemanticRoundTrip(parsed.value, shards, meta);
  if (!rt.ok) {
    return Err(new CLIError(rt.error.message, ExitCode.ERROR));
  }

  const report: ShardReport = {
    shardCount: shards.length,
    milestoneCount: meta.milestones.length,
    disambiguated: shards.map((s) => s.slug),
    roundTrip: true,
  };

  // Write phase (Task 10 gates this on !dryRun and an already-sharded check).
  await io.mkdirp(shardDir);
  for (const shard of shards) {
    await io.writeFile(path.join(shardDir, `${shard.slug}.md`), serializeShard(shard));
  }
  await io.writeFile(path.join(shardDir, '_meta.md'), serializeMeta(meta));

  const regen = await writeRegeneratedRoadmap(shardDir, roadmapPath, io);
  if (!regen.ok) {
    return Err(new CLIError(regen.error.message, ExitCode.ERROR));
  }

  logger.success(
    `Sharded docs/roadmap.md into ${report.shardCount} shards across ${report.milestoneCount} milestones`
  );
  return Ok(report);
}

/** Commander wrapper for `harness roadmap shard` (flags finalized in Task 10). */
export function createRoadmapShardCommand(): Command {
  return new Command('shard')
    .description('Migrate docs/roadmap.md to per-row shards under docs/roadmap.d')
    .option('--cwd <dir>', 'Project root (defaults to the current working directory)')
    .action(async (options: { cwd?: string }) => {
      const result = await runRoadmapShard(options.cwd ? { cwd: options.cwd } : {});
      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }
    });
}
