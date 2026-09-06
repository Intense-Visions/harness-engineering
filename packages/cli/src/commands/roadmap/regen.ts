import { Command } from 'commander';
import * as path from 'node:path';
import { Ok, Err, regenerate, writeRegeneratedRoadmap } from '@harness-engineering/core';
import { envEnabled } from '../../utils/env-flag';
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
  /**
   * Carry an unreadable `## Assignment History` section into the aggregate
   * verbatim instead of refusing to regenerate (#1862). Defaults to the
   * {@link ALLOW_UNREADABLE_HISTORY_ENV} environment variable.
   */
  allowUnreadableHistory?: boolean;
}

/**
 * Environment escape hatch for {@link RoadmapRegenOptions.allowUnreadableHistory}.
 *
 * The pre-commit hook that `harness roadmap install-hook` writes runs the bare
 * `harness roadmap regen`, so a flag alone cannot unwedge a repo whose `_meta.md`
 * history this build cannot read — every shard-touching commit would stay blocked,
 * including the one that repairs it, leaving a gate bypass as the only way out.
 * An env var reaches that invocation: `HARNESS_ROADMAP_ALLOW_UNREADABLE_HISTORY=1
 * git commit ...`.
 */
export const ALLOW_UNREADABLE_HISTORY_ENV = 'HARNESS_ROADMAP_ALLOW_UNREADABLE_HISTORY';

/**
 * True when the env escape hatch is set to a truthy value.
 *
 * `envEnabled` is an ALLOWLIST (`1`/`true`/`yes`/`on`) and the repo convention for
 * every other `HARNESS_*` flag. A denylist here would fail OPEN — `=off`, `=no`
 * and `=disabled` would all switch a data-loss guard off — which is the wrong
 * direction for this particular flag.
 */
function allowUnreadableHistoryFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return envEnabled(env[ALLOW_UNREADABLE_HISTORY_ENV]);
}

/**
 * The recovery sentence the CLI appends to core's diagnosis.
 *
 * Core deliberately names no CLI surface (it is a grammar helper shared with the
 * MCP tool and the dashboard), so the flag and env var are spelled here, from the
 * constant that defines them.
 */
function recoveryHint(): string {
  return (
    ` To regenerate meanwhile without losing the section, re-run with ` +
    `--allow-unreadable-history (or set ${ALLOW_UNREADABLE_HISTORY_ENV}=1, which the ` +
    `pre-commit hook's bare invocation also honours): the section is carried into the ` +
    `aggregate verbatim instead of being dropped. That unwedges "roadmap regen" only — ` +
    `the aggregate still holds the unreadable section, so other roadmap readers stay ` +
    `blocked until you repair it.`
  );
}

/** Summary of a regen (also the `--dry-run` preview). */
export interface RegenReport {
  /** Byte length the regenerated aggregate would have. */
  bytes: number;
  /**
   * True when the recovery hatch fired — the aggregate carries an unreadable
   * `## Assignment History` section verbatim and does not itself parse.
   */
  carriedUnreadableHistory: boolean;
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
 *
 * `--allow-unreadable-history` (or `HARNESS_ROADMAP_ALLOW_UNREADABLE_HISTORY=1`)
 * is the documented recovery for a `_meta.md` whose `## Assignment History`
 * section this build cannot parse: the section is carried into the aggregate
 * verbatim — losslessly — instead of the regen refusing outright. Without it that
 * refusal blocks every shard-touching commit, including the repair commit, and
 * bypassing the pre-commit gate becomes the only escape.
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
  const allowUnreadableHistory = opts.allowUnreadableHistory ?? allowUnreadableHistoryFromEnv();
  // An array, not a `let`: control-flow analysis narrows a closure-assigned `let`
  // to its initializer at every later read, which makes the result unusable.
  const carried: Error[] = [];
  const regenOptions = {
    allowUnreadableHistory,
    onUnreadableHistoryCarried: (error: Error) => {
      carried.push(error);
    },
  };
  const regen = await regenerate(shardDir, io, regenOptions);
  if (!regen.ok) return Err(new CLIError(regen.error.message + recoveryHint(), ExitCode.ERROR));
  const report: RegenReport = { bytes: regen.value.length, carriedUnreadableHistory: false };

  if (!dryRun) {
    const written = await writeRegeneratedRoadmap(shardDir, roadmapPath, io, regenOptions);
    if (!written.ok) {
      return Err(new CLIError(written.error.message + recoveryHint(), ExitCode.ERROR));
    }
  }

  // A hatch that regenerates silently is the same silence the guard exists to end,
  // so say so on every run it fires — loudly enough that an exported env var
  // cannot disable a data-loss guard without a trace.
  const carriedError = carried[0];
  if (carriedError !== undefined) {
    report.carriedUnreadableHistory = true;
    if (format !== 'json') {
      logger.warn(
        `Carried an unreadable "## Assignment History" section into the aggregate VERBATIM ` +
          `because --allow-unreadable-history is in effect. Nothing was dropped, but ` +
          `docs/roadmap.md still does not parse, so every other roadmap reader stays blocked ` +
          `until the section is repaired. ${carriedError.message}`
      );
    }
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
      '--allow-unreadable-history',
      `Recovery hatch: carry an unparseable "## Assignment History" section into the aggregate verbatim instead of refusing (also settable as ${ALLOW_UNREADABLE_HISTORY_ENV}=1)`,
      false
    )
    .option(
      '--format <fmt>',
      'Output format: "human" (default) or "json" (single JSON object for CI consumers)',
      'human'
    )
    .action(
      async (options: {
        cwd?: string;
        dryRun?: boolean;
        allowUnreadableHistory?: boolean;
        format?: string;
      }) => {
        const format: 'human' | 'json' = options.format === 'json' ? 'json' : 'human';
        const result = await runRoadmapRegen({
          ...(options.cwd ? { cwd: options.cwd } : {}),
          dryRun: Boolean(options.dryRun),
          ...(options.allowUnreadableHistory ? { allowUnreadableHistory: true } : {}),
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
