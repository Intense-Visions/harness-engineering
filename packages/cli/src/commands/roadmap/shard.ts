import { Command } from 'commander';
import * as path from 'node:path';
import {
  Ok,
  Err,
  parseRoadmap,
  roadmapToShards,
  assertSemanticRoundTrip,
  assertRegeneratedRoundTrip,
  regenerate,
  serializeShard,
  serializeMeta,
  writeRegeneratedRoadmap,
} from '@harness-engineering/core';
import type { Result, Roadmap, Shard, RoadmapMeta } from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';
import { createNodeShardIO } from './shard-io';
import type { NodeShardIO } from './shard-io';

/** Round-trip assertion seam (defaults to the core implementation; injectable for tests). */
type AssertRoundTrip = (original: Roadmap, shards: Shard[], meta: RoadmapMeta) => Result<void>;

export interface RoadmapShardOptions {
  cwd?: string;
  dryRun?: boolean;
  format?: 'human' | 'json';
  force?: boolean;
  io?: NodeShardIO;
  /** Test seam: override the round-trip assertion. */
  assertRoundTrip?: AssertRoundTrip;
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
 * Safety (two layers): the semantic round-trip is asserted BEFORE any
 * destructive write; on failure the command aborts leaving `docs/roadmap.md`
 * byte-unchanged with no shard files written. Then, AFTER the shards + `_meta`
 * are on disk but BEFORE the monolith is overwritten, the roadmap is regenerated
 * from the shard dir on disk and re-asserted to deep-equal the original — this
 * exercises serializeShard/parseShard + serializeMeta/parseMeta, the exact layer
 * whose output replaces the monolith. If the disk re-assert fails the monolith is
 * left untouched and the just-written shard dir is cleaned up. The monolith is
 * rewritten ONLY via `writeRegeneratedRoadmap`, last and never hand-edited
 * (read-source invariant R).
 */
export async function runRoadmapShard(
  opts: RoadmapShardOptions = {}
): Promise<Result<ShardReport, CLIError>> {
  const cwd = opts.cwd ?? process.cwd();
  const io = opts.io ?? createNodeShardIO();
  const dryRun = Boolean(opts.dryRun);
  const force = Boolean(opts.force);
  const format: 'human' | 'json' = opts.format === 'json' ? 'json' : 'human';
  const assertRoundTrip = opts.assertRoundTrip ?? assertSemanticRoundTrip;
  // Normalize to '/' so all IO paths are OS-stable (the injected-IO contract +
  // tests expect '/'; Node fs accepts '/' on Windows).
  const roadmapPath = path.join(cwd, 'docs', 'roadmap.md').replaceAll('\\', '/');
  const shardDir = path.join(cwd, 'docs', 'roadmap.d').replaceAll('\\', '/');

  if (!(await io.exists(roadmapPath))) {
    return Err(new CLIError('docs/roadmap.md not found', ExitCode.ERROR));
  }

  // Refuse to clobber an existing shard dir unless forced. Checked BEFORE any
  // write (and before the round-trip) so an already-sharded repo is never touched.
  if (!dryRun && !force && (await io.exists(shardDir))) {
    return Err(
      new CLIError('already sharded; remove docs/roadmap.d or pass --force', ExitCode.ERROR)
    );
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
  // the monolith untouched (no shard dir created).
  const rt = assertRoundTrip(parsed.value, shards, meta);
  if (!rt.ok) {
    return Err(new CLIError(rt.error.message, ExitCode.ERROR));
  }

  const report: ShardReport = {
    shardCount: shards.length,
    milestoneCount: meta.milestones.length,
    disambiguated: shards.map((s) => s.slug),
    roundTrip: true,
  };

  // Dry-run: report the plan, write nothing.
  if (!dryRun) {
    // H1: under --force, an existing shard dir may hold ORPHAN shards (slugs no
    // longer in the roadmap). `mkdirp` is a no-op on an existing dir and we only
    // write new-slug shards, so an orphan would survive and `readShardDir` would
    // later merge it as a phantom row. Remove the dir first — the in-memory
    // round-trip above has already passed — so the new shard set is authoritative.
    // The monolith remains the source of truth and is untouched until the very end
    // (after the disk re-assert), so a crash here leaves the repo re-shardable,
    // never worse than before.
    if (force && (await io.exists(shardDir))) {
      await io.rmrf(shardDir);
    }

    await io.mkdirp(shardDir);
    // Use '/' templates (not path.join, which re-introduces '\' on Windows) so the
    // shard IO paths stay OS-stable and match the regenerator's readShardDir joins.
    for (const shard of shards) {
      await io.writeFile(`${shardDir}/${shard.slug}.md`, serializeShard(shard));
    }
    await io.writeFile(`${shardDir}/_meta.md`, serializeMeta(meta));

    // H2: re-assert the round-trip against the bytes ON DISK before overwriting
    // the monolith. The in-memory assert never exercised serializeShard/parseShard
    // + serializeMeta/parseMeta — the exact layer whose output replaces the
    // monolith. Regenerate from the shard dir on disk and require it to deep-equal
    // the original. On failure: leave roadmap.md untouched, clean up the
    // just-written shard dir, and abort.
    const diskRegen = await regenerate(shardDir, io);
    if (!diskRegen.ok) {
      await io.rmrf(shardDir);
      return Err(new CLIError(diskRegen.error.message, ExitCode.ERROR));
    }
    const diskAssert = assertRegeneratedRoundTrip(parsed.value, diskRegen.value);
    if (!diskAssert.ok) {
      await io.rmrf(shardDir);
      return Err(new CLIError(diskAssert.error.message, ExitCode.ERROR));
    }

    // Monolith is overwritten LAST, only after the disk re-assert has passed.
    const regen = await writeRegeneratedRoadmap(shardDir, roadmapPath, io);
    if (!regen.ok) {
      return Err(new CLIError(regen.error.message, ExitCode.ERROR));
    }
  }

  if (format === 'json') {
    // Deliberately bypass `logger` (and its `raw`, which pretty-prints multi-line):
    // machine consumers want exactly ONE single-line JSON object on stdout, which
    // the logger abstraction cannot emit cleanly.
    console.log(JSON.stringify({ ok: true, ...report, dryRun }));
  } else {
    logger.success(
      `${dryRun ? '[dry-run] ' : ''}Sharded docs/roadmap.md into ${report.shardCount} shards across ${report.milestoneCount} milestones`
    );
  }
  return Ok(report);
}

/** Commander wrapper for `harness roadmap shard`. */
export function createRoadmapShardCommand(): Command {
  return new Command('shard')
    .description('Migrate docs/roadmap.md to per-row shards under docs/roadmap.d')
    .option('--cwd <dir>', 'Project root (defaults to the current working directory)')
    .option('--dry-run', 'Report the migration plan without writing anything', false)
    .option('--force', 'Proceed even if docs/roadmap.d already exists', false)
    .option(
      '--format <fmt>',
      'Output format: "human" (default) or "json" (single JSON object for CI consumers)',
      'human'
    )
    .action(
      async (options: { cwd?: string; dryRun?: boolean; force?: boolean; format?: string }) => {
        const format: 'human' | 'json' = options.format === 'json' ? 'json' : 'human';
        const result = await runRoadmapShard({
          ...(options.cwd ? { cwd: options.cwd } : {}),
          dryRun: Boolean(options.dryRun),
          force: Boolean(options.force),
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
      }
    );
}
