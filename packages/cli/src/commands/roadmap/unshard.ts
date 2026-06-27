import { Command } from 'commander';
import * as path from 'node:path';
import { Ok, Err, writeRegeneratedRoadmap } from '@harness-engineering/core';
import type { Result } from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';
import { createNodeShardIO } from './shard-io';
import type { NodeShardIO } from './shard-io';

export interface RoadmapUnshardOptions {
  cwd?: string;
  io?: NodeShardIO;
}

/**
 * Losslessly reverse a `shard` migration: regenerate `docs/roadmap.md` from the
 * shards (so the monolith is byte-identical to a fresh `regen`), then remove
 * `docs/roadmap.d/`. The monolith is written ONLY via `writeRegeneratedRoadmap`
 * (read-source invariant R). The regenerate runs BEFORE the removal, so a write
 * failure leaves the shards intact.
 */
export async function runRoadmapUnshard(
  opts: RoadmapUnshardOptions = {}
): Promise<Result<void, CLIError>> {
  const cwd = opts.cwd ?? process.cwd();
  const io = opts.io ?? createNodeShardIO();
  const shardDir = path.join(cwd, 'docs', 'roadmap.d');
  const roadmapPath = path.join(cwd, 'docs', 'roadmap.md');

  if (!(await io.exists(shardDir))) {
    return Err(new CLIError('docs/roadmap.d not found; nothing to unshard', ExitCode.ERROR));
  }

  const regen = await writeRegeneratedRoadmap(shardDir, roadmapPath, io);
  if (!regen.ok) {
    return Err(new CLIError(regen.error.message, ExitCode.ERROR));
  }

  await io.rmrf(shardDir);

  logger.success('Unsharded docs/roadmap.d back into docs/roadmap.md');
  return Ok(undefined);
}

/** Commander wrapper for `harness roadmap unshard`. */
export function createRoadmapUnshardCommand(): Command {
  return new Command('unshard')
    .description('Reassemble docs/roadmap.md from shards and remove docs/roadmap.d')
    .option('--cwd <dir>', 'Project root (defaults to the current working directory)')
    .action(async (options: { cwd?: string }) => {
      const result = await runRoadmapUnshard(options.cwd ? { cwd: options.cwd } : {});
      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }
    });
}
