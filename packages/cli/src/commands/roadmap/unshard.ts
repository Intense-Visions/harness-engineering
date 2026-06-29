import { Command } from 'commander';
import * as path from 'node:path';
import { Ok, Err, regenerate, writeRegeneratedRoadmap } from '@harness-engineering/core';
import type { Result } from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';
import { createNodeShardIO } from './shard-io';
import type { NodeShardIO } from './shard-io';

export interface RoadmapUnshardOptions {
  cwd?: string;
  io?: NodeShardIO;
  /** Preview the reassembly without writing the aggregate or deleting the shard dir. */
  dryRun?: boolean;
  /** Output format: human-readable (default) or a single JSON object for CI. */
  format?: 'human' | 'json';
}

/** Summary of an unshard (also the `--dry-run` preview). */
export interface UnshardReport {
  /** Number of row shards (excluding `_meta.md`) that would be reassembled. */
  shardCount: number;
  /** Byte length the reassembled aggregate would have. */
  bytes: number;
}

/**
 * Losslessly reverse a `shard` migration: regenerate the aggregate from the
 * shards (so it is byte-identical to a fresh `regen`), then remove
 * `docs/roadmap.d/`. The aggregate is written ONLY via `writeRegeneratedRoadmap`
 * (read-source invariant R). The regenerate runs BEFORE the removal, so a write
 * failure leaves the shards intact.
 *
 * `--dry-run` validates the reassembly (it computes the regenerated content and
 * counts the shards) but writes nothing and removes nothing — a safe preview
 * before the destructive shard-dir deletion.
 */
export async function runRoadmapUnshard(
  opts: RoadmapUnshardOptions = {}
): Promise<Result<UnshardReport, CLIError>> {
  const cwd = opts.cwd ?? process.cwd();
  const io = opts.io ?? createNodeShardIO();
  const dryRun = Boolean(opts.dryRun);
  const format: 'human' | 'json' = opts.format === 'json' ? 'json' : 'human';
  const shardDir = path.join(cwd, 'docs', 'roadmap.d');
  const roadmapPath = path.join(cwd, 'docs', 'roadmap.md');

  if (!(await io.exists(shardDir))) {
    return Err(new CLIError('docs/roadmap.d not found; nothing to unshard', ExitCode.ERROR));
  }

  // Count row shards and compute the reassembled content up front: both feed the
  // report, and computing the regenerate first validates the round-trip BEFORE we
  // delete anything (and is the exact content a real run will write).
  const entries = await io.listDir(shardDir);
  const shardCount = entries.filter((e) => e.endsWith('.md') && e !== '_meta.md').length;

  const regen = await regenerate(shardDir, io);
  if (!regen.ok) return Err(new CLIError(regen.error.message, ExitCode.ERROR));
  const report: UnshardReport = { shardCount, bytes: regen.value.length };

  if (!dryRun) {
    const written = await writeRegeneratedRoadmap(shardDir, roadmapPath, io);
    if (!written.ok) return Err(new CLIError(written.error.message, ExitCode.ERROR));
    await io.rmrf(shardDir);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ ok: true, ...report, dryRun }));
  } else {
    logger.success(
      `${dryRun ? '[dry-run] ' : ''}Unsharded docs/roadmap.d (${report.shardCount} shards) back into the aggregate`
    );
  }
  return Ok(report);
}

/** Commander wrapper for `harness roadmap unshard`. */
export function createRoadmapUnshardCommand(): Command {
  return new Command('unshard')
    .description('Reassemble the aggregate from shards and remove docs/roadmap.d')
    .option('--cwd <dir>', 'Project root (defaults to the current working directory)')
    .option('--dry-run', 'Preview the reassembly without writing or deleting the shard dir', false)
    .option(
      '--format <fmt>',
      'Output format: "human" (default) or "json" (single JSON object for CI consumers)',
      'human'
    )
    .action(async (options: { cwd?: string; dryRun?: boolean; format?: string }) => {
      const format: 'human' | 'json' = options.format === 'json' ? 'json' : 'human';
      const result = await runRoadmapUnshard({
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
