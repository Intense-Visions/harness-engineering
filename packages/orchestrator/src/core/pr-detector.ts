import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Issue } from '@harness-engineering/types';

/**
 * Minimal logger interface for PR detection.
 * Accepts any structured logger that provides debug/info/warn.
 */
export interface PRDetectorLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Function signature compatible with Node's `child_process.execFile`.
 * Allows injection for testing.
 */
export type ExecFileFn = typeof execFile;

/**
 * Detects whether GitHub issues or branches already have open pull requests.
 *
 * Uses the `gh` CLI under the hood. All checks are fail-open: if `gh` is not
 * installed, auth is missing, or the network is down, candidates pass through
 * rather than being incorrectly blocked.
 */
export class PRDetector {
  private logger: PRDetectorLogger;
  private execFileFn: ExecFileFn;
  private projectRoot: string;

  constructor(opts: { logger: PRDetectorLogger; execFileFn?: ExecFileFn; projectRoot: string }) {
    this.logger = opts.logger;
    this.execFileFn = opts.execFileFn ?? execFile;
    this.projectRoot = opts.projectRoot;
  }

  /**
   * Parse a `github:owner/repo#N` externalId into its parts.
   * Returns null for invalid or non-GitHub formats.
   */
  parseExternalId(externalId: string): { owner: string; repo: string; number: number } | null {
    const match = externalId.match(/^github:([^/]+)\/([^#]+)#(\d+)$/);
    if (!match) return null;
    return { owner: match[1]!, repo: match[2]!, number: parseInt(match[3]!, 10) };
  }

  /**
   * Checks whether a remote branch has an open pull request via `gh`.
   * Returns true if a PR exists, false otherwise. Failures are treated
   * as "no PR" to err on the side of preserving work.
   */
  async branchHasPullRequest(branch: string): Promise<boolean> {
    try {
      const exec = promisify(this.execFileFn);
      const { stdout } = await exec(
        'gh',
        ['pr', 'list', '--head', branch, '--json', 'number', '--jq', 'length'],
        {
          cwd: this.projectRoot,
          timeout: 10_000,
        }
      );
      return parseInt(stdout.trim(), 10) > 0;
    } catch {
      // If gh fails (not installed, no auth, network error), assume no PR
      // so the worktree is preserved rather than lost.
      return false;
    }
  }

  /**
   * Checks whether a GitHub issue (identified by externalId) has an open PR
   * linked to it via `closes #N` or similar keywords. Fail-open on API errors
   * or non-GitHub externalId formats.
   */
  async hasOpenPRForExternalId(externalId: string): Promise<boolean> {
    const parsed = this.parseExternalId(externalId);
    if (!parsed) return false;

    try {
      const exec = promisify(this.execFileFn);
      const { stdout } = await exec(
        'gh',
        [
          'pr',
          'list',
          '--repo',
          `${parsed.owner}/${parsed.repo}`,
          '--search',
          `closes #${parsed.number}`,
          '--state',
          'open',
          '--json',
          'number',
          '--jq',
          'length',
        ],
        {
          cwd: this.projectRoot,
          timeout: 10_000,
        }
      );
      return parseInt(stdout.trim(), 10) > 0;
    } catch (err) {
      this.logger.debug(`Failed to check open PRs for externalId ${externalId}`, {
        error: String(err),
      });
      return false;
    }
  }

  /**
   * Checks whether an issue identifier has an open GitHub PR by searching
   * for a branch matching the `feat/<identifier>` naming convention used
   * by dispatched agents. Fail-open on API errors.
   */
  async hasOpenPRForIdentifier(identifier: string): Promise<boolean> {
    try {
      const exec = promisify(this.execFileFn);
      const { stdout } = await exec(
        'gh',
        [
          'pr',
          'list',
          '--head',
          `feat/${identifier}`,
          '--state',
          'open',
          '--json',
          'number',
          '--jq',
          'length',
        ],
        {
          cwd: this.projectRoot,
          timeout: 10_000,
        }
      );
      return parseInt(stdout.trim(), 10) > 0;
    } catch (err) {
      this.logger.debug(`Failed to check open PRs for ${identifier}`, {
        error: String(err),
      });
      return false;
    }
  }

  /**
   * Filters out candidates that already have an open GitHub PR, running
   * checks with limited concurrency to avoid overwhelming the GitHub API.
   * For candidates with an externalId, searches for PRs linked to the
   * GitHub issue. Falls back to `feat/<identifier>` branch lookup otherwise.
   * Fail-open on API errors.
   */
  async filterCandidatesWithOpenPRs(candidates: Issue[]): Promise<Issue[]> {
    // Throttle to 3 concurrent gh CLI calls to avoid GitHub API rate limits
    const concurrency = 3;
    const results: PromiseSettledResult<{ candidate: Issue; hasOpenPR: boolean }>[] = [];
    for (let i = 0; i < candidates.length; i += concurrency) {
      const batch = candidates.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(async (candidate) => {
          const hasOpenPR = candidate.externalId
            ? await this.hasOpenPRForExternalId(candidate.externalId)
            : await this.hasOpenPRForIdentifier(candidate.identifier);
          return { candidate, hasOpenPR };
        })
      );
      results.push(...batchResults);
    }

    const filtered: Issue[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (!result || result.status === 'rejected') {
        filtered.push(candidates[i]!);
        continue;
      }
      const { candidate, hasOpenPR } = result.value;
      if (hasOpenPR) {
        const via = candidate.externalId
          ? `externalId ${candidate.externalId}`
          : `feat/${candidate.identifier}`;
        this.logger.info(`Skipping ${candidate.title}: open PR exists (${via})`);
      } else {
        filtered.push(candidate);
      }
    }
    return filtered;
  }
}
