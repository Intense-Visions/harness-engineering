import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Ok,
  Err,
  loadTrackerSyncConfig,
  diagnoseTrackerSyncConfig,
  explainTrackerSyncConfig,
  GitHubIssuesSyncAdapter,
  PnyonSyncAdapter,
  PnyonTrackerAdapter,
} from '@harness-engineering/core';
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
    // Say which of the four reasons applied. The loader returns a bare null for
    // all of them, and reporting every one as "no `roadmap.tracker` block" sent
    // readers hunting for a block that was present and well-formed — it just
    // named a kind sync cannot drive (issue #1863).
    return Err(
      new CLIError(
        `Cannot sync: ${explainTrackerSyncConfig(diagnoseTrackerSyncConfig(cwd))}`,
        ExitCode.ERROR
      )
    );
  }
  // `repo` is a GitHub concept. Demanding it of every kind would reject a
  // perfectly good Waypoint config for missing a field that has no meaning
  // there — and the config union does not even carry one.
  if (config.kind === 'github' && !config.repo) {
    return Err(
      new CLIError(
        'Tracker configured without `roadmap.tracker.repo` ("owner/repo"); cannot sync',
        ExitCode.ERROR
      )
    );
  }
  return Ok(config);
}

/**
 * Load `.env` from the project root so a token stored there is visible.
 *
 * Named after what it does rather than after GitHub: both kinds keep their
 * credential the same way, and the previous version's `GITHUB_TOKEN`-shaped
 * guard would have skipped the load for a Waypoint sync whose token lives in
 * exactly the same file.
 */
async function loadProjectEnv(cwd: string, tokenVar: string): Promise<void> {
  const envPath = path.join(cwd, '.env');
  if (!fs.existsSync(envPath) || process.env[tokenVar]) return;
  const { config: loadDotenv } = await import('dotenv');
  loadDotenv({ path: envPath });
}

/**
 * Resolve the tracker adapter for the configured kind, if not injected.
 *
 * The dispatch is exhaustive over the config union rather than defaulting to
 * GitHub: a kind that reaches here without a branch should fail to compile, not
 * quietly sync a Waypoint roadmap through the GitHub adapter.
 */
export async function resolveAdapter(
  opts: SyncDepsOptions,
  cwd: string,
  config: TrackerSyncConfig
): Promise<Result<TrackerSyncAdapter, CLIError>> {
  if (opts.adapter) return Ok(opts.adapter);

  if (config.kind === 'pnyon') {
    await loadProjectEnv(cwd, 'PNYON_TOKEN');
    const token = config.token ?? process.env.PNYON_TOKEN;
    if (!token) {
      return Err(
        new CLIError(
          'No Waypoint token found; set `roadmap.tracker.token` or PNYON_TOKEN to sync',
          ExitCode.ERROR
        )
      );
    }
    return Ok(
      new PnyonSyncAdapter({
        client: new PnyonTrackerAdapter({ url: config.url, token }),
        apiBaseUrl: config.url,
      })
    );
  }

  await loadProjectEnv(cwd, 'GITHUB_TOKEN');
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return Err(
      new CLIError('GITHUB_TOKEN not found; required to sync with the tracker', ExitCode.ERROR)
    );
  }
  return Ok(new GitHubIssuesSyncAdapter({ token, config }));
}
