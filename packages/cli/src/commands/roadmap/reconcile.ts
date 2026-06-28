import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Ok,
  Err,
  resolveRoadmapStore,
  roadmapSourceExists,
  loadTrackerSyncConfig,
  reconcileDoneFromClosedIssues,
  GitHubIssuesSyncAdapter,
} from '@harness-engineering/core';
import type {
  Result,
  RoadmapStore,
  ExternalTicketState,
  TrackerSyncConfig,
} from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';

/** The minimal adapter surface the offline reconciler needs. */
interface ClosedIssueAdapter {
  fetchAllTickets(): Promise<Result<ExternalTicketState[]>>;
}

export interface RoadmapReconcileOptions {
  /** Project root (defaults to `process.cwd()`). */
  cwd?: string;
  /** Injectable store (defaults to {@link resolveRoadmapStore} over `cwd`). */
  store?: RoadmapStore;
  /** Injectable issue-state source (defaults to a {@link GitHubIssuesSyncAdapter}). */
  adapter?: ClosedIssueAdapter;
  /** Injectable tracker config (defaults to {@link loadTrackerSyncConfig} over `cwd`). */
  config?: TrackerSyncConfig;
}

/**
 * `harness roadmap reconcile` — auto-done from closed issues (Phase 5, D6).
 *
 * Offline fallback to the authoritative PR-merge Action: fetches current issue
 * state from the configured tracker, computes the set of CLOSED issues, and flips
 * each matching non-`done` roadmap row to `done` via the shared core reconciler
 * (store-routed; one shard per matched row; assignee-lifecycle preserved).
 *
 * CAVEAT (offline mode): `ExternalTicketState` carries only `open`/`closed`, not
 * GitHub's `state_reason`, so this path treats ANY closed issue as done — it
 * cannot distinguish a `completed` close from a `not planned`/`wontfix` close.
 * The PR-merge Action path uses the PR's closing-issue references (closed *by
 * merge* = completed) and is authoritative; prefer it. A follow-up may expose
 * `state_reason` to gate the offline path on `completed` only.
 */
export async function runRoadmapReconcile(
  opts: RoadmapReconcileOptions = {}
): Promise<Result<void, CLIError>> {
  const cwd = opts.cwd ?? process.cwd();

  if (!opts.store && !roadmapSourceExists(cwd)) {
    return Err(
      new CLIError(
        'No roadmap found (docs/roadmap.d or docs/roadmap.md); nothing to reconcile',
        ExitCode.ERROR
      )
    );
  }
  const store = opts.store ?? resolveRoadmapStore({ projectRoot: cwd });

  const adapterResult = await resolveAdapter(opts, cwd);
  if (!adapterResult.ok) return adapterResult;

  const tickets = await adapterResult.value.fetchAllTickets();
  if (!tickets.ok) {
    return Err(
      new CLIError(`Failed to fetch issue state: ${tickets.error.message}`, ExitCode.ERROR)
    );
  }
  const closed = tickets.value.filter((t) => t.status === 'closed').map((t) => t.externalId);

  const r = await reconcileDoneFromClosedIssues(store, closed);
  if (!r.ok) return Err(new CLIError(r.error.message, ExitCode.ERROR));

  logSummary(r.value);
  return Ok(undefined);
}

/** Resolve the issue-state adapter, building a GitHub adapter from config + token if not injected. */
async function resolveAdapter(
  opts: RoadmapReconcileOptions,
  cwd: string
): Promise<Result<ClosedIssueAdapter, CLIError>> {
  if (opts.adapter) return Ok(opts.adapter);

  const config = opts.config ?? loadTrackerSyncConfig(cwd) ?? undefined;
  if (!config) {
    return Err(
      new CLIError(
        'No tracker configured in harness.config.json; cannot fetch issue state offline',
        ExitCode.ERROR
      )
    );
  }

  // Load .env from the project root if GITHUB_TOKEN is not already present.
  const envPath = path.join(cwd, '.env');
  if (fs.existsSync(envPath) && !process.env.GITHUB_TOKEN) {
    const { config: loadDotenv } = await import('dotenv');
    loadDotenv({ path: envPath });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return Err(
      new CLIError('GITHUB_TOKEN not found; required to fetch issue state offline', ExitCode.ERROR)
    );
  }

  return Ok(new GitHubIssuesSyncAdapter({ token, config }));
}

function logSummary(result: {
  markedDone: string[];
  alreadyDone: string[];
  unmatched: string[];
}): void {
  const { markedDone, alreadyDone, unmatched } = result;
  if (markedDone.length === 0) {
    logger.info(
      `Nothing to reconcile (already-done: ${alreadyDone.length}, unmatched: ${unmatched.length}).`
    );
    return;
  }
  logger.success(
    `Reconciled ${markedDone.length} row(s) to done: ${markedDone.join(', ')} ` +
      `(already-done: ${alreadyDone.length}, unmatched: ${unmatched.length}).`
  );
}

/** Commander wrapper for `harness roadmap reconcile`. */
export function createRoadmapReconcileCommand(): Command {
  return new Command('reconcile')
    .description(
      'Flip roadmap rows whose linked GitHub issue is closed to done. Offline mode treats any ' +
        "closed issue as done (it cannot tell 'completed' from 'not planned'/'wontfix' closes; the " +
        'PR-merge auto-done workflow is authoritative).'
    )
    .option('--cwd <dir>', 'Project root (defaults to the current working directory)')
    .action(async (options: { cwd?: string }) => {
      const result = await runRoadmapReconcile(options.cwd ? { cwd: options.cwd } : {});
      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }
    });
}
