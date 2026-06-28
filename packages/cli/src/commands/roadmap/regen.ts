import { Command } from 'commander';
import * as path from 'node:path';
import { Ok, Err, regenerate, writeRegeneratedRoadmap } from '@harness-engineering/core';
import type { Result } from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';
import { createNodeShardIO } from './shard-io';
import type { NodeShardIO } from './shard-io';

export interface RoadmapRegenOptions {
  cwd?: string;
  io?: NodeShardIO;
  /** Compute the regenerated aggregate and report it, but write nothing. */
  dryRun?: boolean;
  /** Output format: human-readable (default) or a single JSON object for CI. */
  format?: 'human' | 'json';
}

/** Summary of a regen (also the `--dry-run` preview). */
export interface RegenReport {
  /** Byte length the regenerated aggregate would have. */
  bytes: number;
}

/**
 * Regenerate the aggregate (`docs/roadmap.md`) deterministically from the shard
 * directory (`docs/roadmap.d/`). The shards remain the source of truth; the
 * aggregate is a derived read-view written ONLY via `writeRegeneratedRoadmap`
 * (`serializeRoadmap` under the hood) — never hand-edited — preserving the
 * read-source invariant R for Phase 3.
 *
 * `--dry-run` computes the regenerated content and reports its size without
 * touching disk, so CI can preview the result before a real run.
 */
export async function runRoadmapRegen(
  opts: RoadmapRegenOptions = {}
): Promise<Result<RegenReport, CLIError>> {
  const cwd = opts.cwd ?? process.cwd();
  const io = opts.io ?? createNodeShardIO();
  const dryRun = Boolean(opts.dryRun);
  const format: 'human' | 'json' = opts.format === 'json' ? 'json' : 'human';
  const shardDir = path.join(cwd, 'docs', 'roadmap.d');
  const roadmapPath = path.join(cwd, 'docs', 'roadmap.md');

  if (!(await io.exists(shardDir))) {
    return Err(new CLIError('docs/roadmap.d not found; project is not sharded', ExitCode.ERROR));
  }

  // Compute the regenerated content first — it is both the dry-run preview and
  // (on a real run) the deterministic content `writeRegeneratedRoadmap` re-derives.
  const regen = await regenerate(shardDir, io);
  if (!regen.ok) return Err(new CLIError(regen.error.message, ExitCode.ERROR));
  const report: RegenReport = { bytes: regen.value.length };

  if (!dryRun) {
    const written = await writeRegeneratedRoadmap(shardDir, roadmapPath, io);
    if (!written.ok) return Err(new CLIError(written.error.message, ExitCode.ERROR));
  }

  if (format === 'json') {
    console.log(JSON.stringify({ ok: true, ...report, dryRun }));
  } else {
    logger.success(
      `${dryRun ? '[dry-run] ' : ''}Regenerated the aggregate from docs/roadmap.d (${report.bytes} bytes)`
    );
  }
  return Ok(report);
}

/** Commander wrapper for `harness roadmap regen`. */
export function createRoadmapRegenCommand(): Command {
  return new Command('regen')
    .description('Regenerate the aggregate from the shard directory (docs/roadmap.d)')
    .option('--cwd <dir>', 'Project root (defaults to the current working directory)')
    .option('--dry-run', 'Report what would be regenerated without writing anything', false)
    .option(
      '--format <fmt>',
      'Output format: "human" (default) or "json" (single JSON object for CI consumers)',
      'human'
    )
    .action(async (options: { cwd?: string; dryRun?: boolean; format?: string }) => {
      const format: 'human' | 'json' = options.format === 'json' ? 'json' : 'human';
      const result = await runRoadmapRegen({
        ...(options.cwd ? { cwd: options.cwd } : {}),
        dryRun: Boolean(options.dryRun),
        format,
      });
      if (!result.ok) {
        if (format === 'json') {
          console.log(JSON.stringify({ ok: false, error: result.error.message }));
        } else {
          logger.error(result.error.message);
        }
        process.exit(result.error.exitCode);
      }
    });
}
