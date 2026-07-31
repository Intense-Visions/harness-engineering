import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Ok,
  Err,
  roadmapSourceExists,
  loadTrackerSyncConfig,
  fullSync,
  GitHubIssuesSyncAdapter,
} from '@harness-engineering/core';
import type {
  Result,
  SyncResult,
  TrackerSyncConfig,
  TrackerSyncAdapter,
  ExternalSyncOptions,
} from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';

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
 * ## Exit codes
 *
 * | Code | Meaning |
 * | ---- | ------- |
 * | 0    | Sync completed; a non-zero denominator was examined and no errors occurred. |
 * | 2    | Misconfiguration or a sync error (no roadmap source, no tracker config, no token, ticket fetch failed, per-feature push/pull errors). |
 * | 3    | ZERO DENOMINATOR — the run examined nothing (zero roadmap rows parsed, or zero tickets fetched with a tracker configured). A sync that matched nothing has abstained, not succeeded, and must never read as a pass. |
 *
 * Exit code 1 (`VALIDATION_FAILED`) is deliberately unused here: this command
 * either abstained (3), broke (2), or converged (0).
 */

/** Machine-readable report emitted by `--json` and used to derive the exit code. */
export interface RoadmapSyncReport {
  /** Whether writes were performed (`--apply`) or only computed. */
  mode: 'dry-run' | 'apply';
  /** Guard state for this run, echoed so a CI log records what was permitted. */
  guards: {
    allowCreate: boolean;
    syncIssueState: boolean;
    forceSync: boolean;
  };
  /** The denominator: what was actually examined. `ticketsFetched: null` = fetch failed. */
  examined: { roadmapRows: number; ticketsFetched: number | null };
  /** Writes actually performed (empty in dry-run mode). */
  pushed: {
    created: Array<{ externalId: string; url: string }>;
    updated: string[];
  };
  /** Changes computed but not performed (populated in dry-run mode). */
  planned: { creates: Array<{ feature: string; milestone: string }>; updates: string[] };
  /** Execution fields pulled back from the tracker. */
  pulled: {
    assignmentChanges: Array<{ feature: string; from: string | null; to: string | null }>;
    localWrites: string[];
  };
  /** Changes a guard deliberately withheld — never silently dropped. */
  skipped: {
    creates: Array<{ feature: string; milestone: string; reason: string }>;
    stateChanges: Array<{ externalId: string; from: string; to: string }>;
  };
  /** Per-feature errors (the sync itself never throws). */
  errors: Array<{ featureOrId: string; error: string }>;
}

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
  /** Injectable tracker adapter (defaults to a {@link GitHubIssuesSyncAdapter}). */
  adapter?: TrackerSyncAdapter;
  /** Injectable tracker config (defaults to {@link loadTrackerSyncConfig} over `cwd`). */
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

/**
 * Load the tracker config, failing loudly when absent.
 *
 * Exiting 0 here would be the worst outcome: a nightly job would report success
 * forever while syncing nothing, which is exactly the failure mode this command
 * exists to close.
 */
function resolveConfig(opts: RoadmapSyncOptions, cwd: string): Result<TrackerSyncConfig, CLIError> {
  const config = opts.config ?? loadTrackerSyncConfig(cwd) ?? undefined;
  if (!config) {
    return Err(
      new CLIError(
        'No tracker configured: harness.config.json has no `roadmap.tracker` block. ' +
          'Add one (kind, repo, labels, statusMap) before running `harness roadmap sync` — ' +
          'without it there is nothing to sync to.',
        ExitCode.ERROR
      )
    );
  }
  if (!config.repo) {
    return Err(
      new CLIError(
        'Tracker configured without `roadmap.tracker.repo` ("owner/repo"); cannot sync',
        ExitCode.ERROR
      )
    );
  }
  return Ok(config);
}

/** Resolve the tracker adapter, building a GitHub adapter from config + token if not injected. */
async function resolveAdapter(
  opts: RoadmapSyncOptions,
  cwd: string,
  config: TrackerSyncConfig
): Promise<Result<TrackerSyncAdapter, CLIError>> {
  if (opts.adapter) return Ok(opts.adapter);

  // Load .env from the project root if GITHUB_TOKEN is not already present
  // (mirrors `roadmap reconcile`).
  const envPath = path.join(cwd, '.env');
  if (fs.existsSync(envPath) && !process.env.GITHUB_TOKEN) {
    const { config: loadDotenv } = await import('dotenv');
    loadDotenv({ path: envPath });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return Err(
      new CLIError('GITHUB_TOKEN not found; required to sync with the tracker', ExitCode.ERROR)
    );
  }
  return Ok(new GitHubIssuesSyncAdapter({ token, config }));
}

/** Project a core {@link SyncResult} into the reportable/JSON shape. */
function buildReport(result: SyncResult, options: ExternalSyncOptions): RoadmapSyncReport {
  return {
    mode: result.dryRun ? 'dry-run' : 'apply',
    guards: {
      allowCreate: options.allowCreate ?? true,
      syncIssueState: options.syncIssueState ?? true,
      forceSync: options.forceSync ?? false,
    },
    examined: result.examined,
    pushed: {
      created: result.created.map((t) => ({ externalId: t.externalId, url: t.url })),
      updated: result.updated,
    },
    planned: { creates: result.planned.creates, updates: result.planned.updates },
    pulled: {
      assignmentChanges: result.assignmentChanges,
      localWrites: result.planned.localWrites,
    },
    skipped: {
      creates: result.skippedCreates,
      stateChanges: result.skippedStateChanges,
    },
    errors: result.errors.map((e) => ({ featureOrId: e.featureOrId, error: e.error.message })),
  };
}

/**
 * Decide whether the run failed, abstained, or converged.
 *
 * Denominator discipline comes FIRST: an abstention is more misleading than an
 * error, because it is the one that would otherwise be reported as green.
 */
function verdictFor(report: RoadmapSyncReport): CLIError | null {
  const { roadmapRows, ticketsFetched } = report.examined;

  if (roadmapRows === 0) {
    return new CLIError(
      'ZERO DENOMINATOR: 0 roadmap rows parsed — the sync compared nothing. ' +
        'This is an abstention, not a pass: check that the roadmap source really ' +
        'contains rows (the shards under docs/roadmap.d/, or the monolith aggregate ' +
        'when the project has not been sharded).',
      ExitCode.ZERO_DENOMINATOR
    );
  }

  if (ticketsFetched === null) {
    return new CLIError(
      `Ticket fetch failed, so nothing could be compared against the tracker ` +
        `(${roadmapRows} roadmap row(s) parsed). See the errors above.`,
      ExitCode.ERROR
    );
  }

  if (ticketsFetched === 0) {
    return new CLIError(
      `ZERO DENOMINATOR: 0 tickets fetched from the configured tracker ` +
        `(${roadmapRows} roadmap row(s) parsed). A tracker is configured, so zero ` +
        'tickets means the selector labels match nothing, the token cannot see the ' +
        'repo, or the repo is wrong — an abstention, not a pass.',
      ExitCode.ZERO_DENOMINATOR
    );
  }

  if (report.errors.length > 0) {
    return new CLIError(
      `Sync completed with ${report.errors.length} error(s); see the report above`,
      ExitCode.ERROR
    );
  }

  return null;
}

/**
 * Log the human-readable report. Always states the denominator first — what was
 * examined — so a reader never has to infer it from the change counts.
 */
export function logSyncReport(report: RoadmapSyncReport): void {
  logDenominator(report);
  logChanges(report);
  logSuppressions(report);

  for (const e of report.errors) {
    logger.error(`${e.featureOrId}: ${e.error}`);
  }
  if (report.errors.length === 0 && report.mode === 'apply') {
    logger.success('Roadmap and tracker converged.');
  }
}

/** The denominator line: always first, so it is never inferred from change counts. */
function logDenominator(report: RoadmapSyncReport): void {
  const { roadmapRows, ticketsFetched } = report.examined;
  const fetched = ticketsFetched === null ? 'FETCH FAILED' : String(ticketsFetched);
  const onOff = (enabled: boolean): string => (enabled ? 'on' : 'off');
  const force = report.guards.forceSync ? ', force=on' : '';
  logger.info(
    `Examined ${roadmapRows} roadmap row(s) against ${fetched} tracker ticket(s) ` +
      `[mode=${report.mode}, create=${onOff(report.guards.allowCreate)}, ` +
      `state-change=${onOff(report.guards.syncIssueState)}${force}].`
  );
}

/** What was written, or (in dry run) what would have been. */
function logChanges(report: RoadmapSyncReport): void {
  if (report.mode !== 'dry-run') {
    logger.info(
      `Pushed ${report.pushed.created.length} create(s) and ` +
        `${report.pushed.updated.length} patch(es); pulled ` +
        `${report.pulled.assignmentChanges.length} assignment change(s).`
    );
    return;
  }
  logger.info(
    `Dry run — no writes issued. Would create ${report.planned.creates.length}, ` +
      `patch ${report.planned.updates.length} ticket(s), and rewrite ` +
      `${report.pulled.localWrites.length} local row(s). Re-run with --apply to write.`
  );
  for (const c of report.planned.creates) {
    logger.dim(`  would create: ${c.feature} (${c.milestone})`);
  }
}

/** Changes a guard withheld. Warn-level so they are never lost in the noise. */
function logSuppressions(report: RoadmapSyncReport): void {
  const { creates, stateChanges } = report.skipped;
  if (creates.length > 0) {
    logger.warn(
      `Skipped ${creates.length} create(s) (--no-create): ` +
        creates.map((c) => c.feature).join(', ')
    );
  }
  if (stateChanges.length > 0) {
    logger.warn(
      `Suppressed ${stateChanges.length} issue state change(s) (--no-state-change): ` +
        stateChanges.map((s) => `${s.externalId} ${s.from}→${s.to}`).join(', ')
    );
  }
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
