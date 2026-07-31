import * as fs from 'node:fs';
import * as path from 'node:path';
import { Ok, Err, loadTrackerSyncConfig, GitHubIssuesSyncAdapter } from '@harness-engineering/core';
import type { Result, TrackerSyncConfig, TrackerSyncAdapter } from '@harness-engineering/core';
import { CLIError, ExitCode } from '../../utils/errors';

/**
 * Resolving what `harness roadmap sync` needs from its environment: the tracker
 * config and the tracker adapter.
 *
 * One responsibility, and it is the one that most needs to fail loudly. Every
 * path here that cannot produce a working dependency returns an `Err` with an
 * actionable message — never a silent no-op. Exiting 0 from a missing tracker
 * config would be the worst possible outcome: a nightly job reporting success
 * forever while syncing nothing, which is exactly the failure mode this command
 * exists to close.
 */

/** The subset of the command's options that dependency resolution consults. */
export interface SyncDepsOptions {
  /** Injectable tracker adapter (defaults to a {@link GitHubIssuesSyncAdapter}). */
  adapter?: TrackerSyncAdapter;
  /** Injectable tracker config (defaults to {@link loadTrackerSyncConfig} over `cwd`). */
  config?: TrackerSyncConfig;
}

/** Load the tracker config, failing loudly when absent or unusable. */
export function resolveConfig(
  opts: SyncDepsOptions,
  cwd: string
): Result<TrackerSyncConfig, CLIError> {
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
export async function resolveAdapter(
  opts: SyncDepsOptions,
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
