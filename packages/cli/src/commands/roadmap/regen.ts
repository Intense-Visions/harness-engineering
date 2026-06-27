import { Command } from 'commander';
import * as path from 'node:path';
import { Ok, Err, writeRegeneratedRoadmap } from '@harness-engineering/core';
import type { Result } from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';
import { createNodeShardIO } from './shard-io';
import type { NodeShardIO } from './shard-io';

export interface RoadmapRegenOptions {
  cwd?: string;
  io?: NodeShardIO;
}

/**
 * Regenerate `docs/roadmap.md` deterministically from the shard directory
 * (`docs/roadmap.d/`). The shards remain the source of truth; the monolith is a
 * derived read-aggregate written ONLY via `writeRegeneratedRoadmap`
 * (`serializeRoadmap` under the hood) — never hand-edited — preserving the
 * read-source invariant R for Phase 3.
 */
export async function runRoadmapRegen(
  opts: RoadmapRegenOptions = {}
): Promise<Result<void, CLIError>> {
  const cwd = opts.cwd ?? process.cwd();
  const io = opts.io ?? createNodeShardIO();
  const shardDir = path.join(cwd, 'docs', 'roadmap.d');
  const roadmapPath = path.join(cwd, 'docs', 'roadmap.md');

  if (!(await io.exists(shardDir))) {
    return Err(new CLIError('docs/roadmap.d not found; project is not sharded', ExitCode.ERROR));
  }

  const result = await writeRegeneratedRoadmap(shardDir, roadmapPath, io);
  if (!result.ok) {
    return Err(new CLIError(result.error.message, ExitCode.ERROR));
  }

  logger.success('Regenerated docs/roadmap.md from docs/roadmap.d');
  return Ok(undefined);
}

/** Commander wrapper for `harness roadmap regen`. */
export function createRoadmapRegenCommand(): Command {
  return new Command('regen')
    .description('Regenerate docs/roadmap.md from the shard directory (docs/roadmap.d)')
    .option('--cwd <dir>', 'Project root (defaults to the current working directory)')
    .action(async (options: { cwd?: string }) => {
      const result = await runRoadmapRegen(options.cwd ? { cwd: options.cwd } : {});
      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }
    });
}
