import { Command } from 'commander';
import { Ok, Err, roadmapSourceExists, fullSync } from '@harness-engineering/core';
import type {
  Result,
  SyncResult,
  TrackerSyncConfig,
  TrackerSyncAdapter,
  ExternalSyncOptions,
} from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';
import { buildReport, logSyncReport, type RoadmapSyncReport } from './sync-report';
import { verdictFor } from './sync-verdict';
import { resolveConfig, resolveAdapter } from './sync-deps';

/**
 * `harness roadmap sync` — the CLI entry point to the full bidirectional
 * roadmap↔tracker sync that was previously reachable only through the
 * `manage_roadmap action:"sync"` MCP tool.
 *
 * Without this, CI could only ever flip rows to `done` (`roadmap reconcile`);
 * every other transition and the whole tracker-label push depended on a human
 * remembering to run an MCP tool. That gap is how a downstream repo ended up
 * with `last_synced` 22 days behind `last_manual_edit` and 22 issues carrying no
 * tracker labels at all — invisible to a tracker scoped by a selector label.
 *
 * ## Safe by default
 *
 * The default is a DRY RUN. `--apply` is required to write anything. Two
 * further guards exist because an unattended nightly sync is only safe if both
 * destructive powers can be switched off:
 *
 * - `--no-state-change` — the tracker `statusMap` maps `done → closed`, so a
 *   mis-set roadmap row can close a live issue. This omits the issue `state`
 *   field from every patch: labels converge, nothing is ever closed or reopened.
 * - `--no-create` — `syncToExternal` creates tickets for rows with no
 *   externalId. A cron that invents issues is unacceptable; this reports each
 *   such row instead of creating it.
 *
 * ## Module layout
 *
 * This file is the thin entry point: flag mapping, orchestration, and the
 * commander definition. The rest lives in siblings, matching the
 * `triage.ts` + `triage-*.ts` convention used elsewhere in this directory:
 *
 * - {@link ./sync-report} — the report shape, its `--json` projection, and its rendering.
 * - {@link ./sync-verdict} — the pass / abstain / fail decision and the exit-code contract.
 * - {@link ./sync-deps} — resolving the tracker config and adapter from the environment.
 *
 * Exit codes are documented in `sync-verdict.ts` and mirrored in `--help`:
 * `0` converged, `2` error/misconfiguration, `3` ZERO DENOMINATOR.
 */

/** The `fullSync` surface this command depends on — injectable for tests. */
export type FullSyncFn = (
  projectRoot: string,
  adapter: TrackerSyncAdapter,
  config: TrackerSyncConfig,
  options?: ExternalSyncOptions
) => Promise<SyncResult>;

export interface RoadmapSyncOptions {
  /** Project root (defaults to `process.cwd()`). */
  cwd?: string;
  /** Perform writes. Default false — the command is dry-run unless asked. */
  apply?: boolean;
  /** Allow ticket creation for rows lacking an externalId. Default true. */
  allowCreate?: boolean;
  /** Allow the push to change issue open/closed state. Default true. */
  syncIssueState?: boolean;
  /** Allow status regressions (overrides human-always-wins). Default false. */
  force?: boolean;
  /** Emit the machine-readable report instead of prose. */
  json?: boolean;
  /** Injectable tracker adapter (defaults to a GitHub adapter built from config + token). */
  adapter?: TrackerSyncAdapter;
  /** Injectable tracker config (defaults to the `roadmap.tracker` block under `cwd`). */
  config?: TrackerSyncConfig;
  /** Injectable sync implementation (defaults to {@link fullSync}). */
  syncFn?: FullSyncFn;
}

/**
 * A sync outcome. Carries the report even on the failure paths that produced
 * one, so callers can still print what was examined when the run abstains or
 * fails — the denominator matters most precisely when the answer is not
 * "success".
 */
export type RoadmapSyncOutcome = Result<RoadmapSyncReport, CLIError> & {
  report?: RoadmapSyncReport;
};

/** Run the bidirectional sync and report on it. */
export async function runRoadmapSync(opts: RoadmapSyncOptions = {}): Promise<RoadmapSyncOutcome> {
  const cwd = opts.cwd ?? process.cwd();

  if (!roadmapSourceExists(cwd)) {
    return Err(
      new CLIError(
        'No roadmap found (no docs/roadmap.d shards or generated aggregate); nothing to sync',
        ExitCode.ERROR
      )
    );
  }

  const configResult = resolveConfig(opts, cwd);
  if (!configResult.ok) return configResult;
  const config = configResult.value;

  const adapterResult = await resolveAdapter(opts, cwd, config);
  if (!adapterResult.ok) return adapterResult;

  const syncOptions: ExternalSyncOptions = {
    dryRun: opts.apply !== true,
    allowCreate: opts.allowCreate ?? true,
    syncIssueState: opts.syncIssueState ?? true,
    forceSync: opts.force ?? false,
  };

  const syncFn = opts.syncFn ?? fullSync;
  const result = await syncFn(cwd, adapterResult.value, config, syncOptions);
  const report = buildReport(result, syncOptions);

  const verdict = verdictFor(report);
  if (verdict) return { ...Err(verdict), report };
  return { ...Ok(report), report };
}

/** Raw Commander option bag for this command, before interpretation. */
export interface RawSyncFlags {
  cwd?: string;
  apply?: boolean;
  create?: boolean;
  stateChange?: boolean;
  force?: boolean;
  json?: boolean;
}

/**
 * Translate the raw Commander options into {@link RoadmapSyncOptions}.
 *
 * `globalFlags` carries the ROOT-level option bag (`harness --json …`). `--json`
 * exists at both levels, and the root global wins the parse — which left the
 * subcommand-local option undefined and silently printed prose for
 * `harness roadmap sync --json`. Both are honoured here.
 */
export function buildSyncOptions(
  options: RawSyncFlags,
  globalFlags: { json?: boolean } = {}
): RoadmapSyncOptions {
  const opts: RoadmapSyncOptions = {
    apply: options.apply === true,
    // Commander maps `--no-create` / `--no-state-change` to `false` on these keys.
    allowCreate: options.create !== false,
    syncIssueState: options.stateChange !== false,
    force: options.force === true,
    json: options.json === true || globalFlags.json === true,
  };
  if (options.cwd) opts.cwd = options.cwd;
  return opts;
}

/** Commander wrapper for `harness roadmap sync`. */
export function createRoadmapSyncCommand(): Command {
  return new Command('sync')
    .description(
      'Full bidirectional roadmap<->tracker sync (push planning fields, pull execution ' +
        'fields, write back). DRY RUN BY DEFAULT — pass --apply to write anything. ' +
        'Exit codes: 0 converged, 2 error/misconfiguration, 3 ZERO DENOMINATOR ' +
        '(examined nothing — an abstention, never a pass).'
    )
    .option('--cwd <dir>', 'Project root (defaults to the current working directory)')
    .option('--apply', 'actually write; without this the command only reports intended changes')
    .option(
      '--no-create',
      'never create a ticket for a row lacking an externalId (report the skip instead) — ' +
        'an unattended job must not invent issues'
    )
    .option(
      '--no-state-change',
      'CI-SAFE MODE: never patch an issue open/closed state, so labels converge but no ' +
        'issue can be closed or reopened; leave closure to the PR-merge auto-done path'
    )
    .option(
      '--force',
      'allow status regressions (done -> in-progress). OVERRIDES the human-always-wins ' +
        'rule; do not use unattended'
    )
    .option('--json', 'emit the machine-readable result instead of prose')
    .action(async (options: RawSyncFlags, cmd: Command) => {
      // optsWithGlobals is the convention used by `roadmap triage`; it is what
      // makes the ROOT-level `harness --json` reach this command.
      const globalOpts = cmd.optsWithGlobals() as { json?: boolean };
      const parsed = buildSyncOptions(options, globalOpts);
      const result = await runRoadmapSync(parsed);

      if (parsed.json) {
        if (result.report) logger.raw(result.report);
      } else if (result.report) {
        logSyncReport(result.report);
      }

      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }
    });
}

// Re-exported so `./sync` remains the single import site for the command's
// public surface (the report shape is part of the `--json` contract).
export type { RoadmapSyncReport } from './sync-report';
export { logSyncReport } from './sync-report';
