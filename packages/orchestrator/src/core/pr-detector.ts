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
   * Checks whether a remote branch has a pull request (any state) via `gh`.
   * Returns `{ found: true }` if a PR exists, `{ found: false }` if none,
   * or `{ found: false, error }` if the check itself failed (gh not installed,
   * network error, etc.). Callers should distinguish "no PR" from "check failed"
   * to avoid false escalations.
   */
  async branchHasPullRequest(branch: string): Promise<{ found: boolean; error?: string }> {
    try {
      const exec = promisify(this.execFileFn);
      const { stdout } = await exec(
        'gh',
        ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number', '--jq', 'length'],
        {
          cwd: this.projectRoot,
          timeout: 10_000,
        }
      );
      return { found: parseInt(stdout.trim(), 10) > 0 };
    } catch (err) {
      // If gh fails (not installed, no auth, network error), report the error
      // so callers can preserve worktrees without raising false escalations.
      return { found: false, error: String(err) };
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
   * GitHub closing keywords that link a PR to an issue it will close.
   * @see https://docs.github.com/articles/closing-issues-using-keywords
   */
  private static readonly CLOSING_REF_RE =
    /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)[\s:]+#(\d+)/gi;

  /**
   * Extracts the issue numbers a PR body declares it will close
   * (e.g. `Closes #42`, `fixes #7`, `Resolves: #99`).
   */
  private parseClosingIssueNumbers(body: string): number[] {
    const nums: number[] = [];
    for (const match of body.matchAll(PRDetector.CLOSING_REF_RE)) {
      nums.push(parseInt(match[1]!, 10));
    }
    return nums;
  }

  /**
   * Lists every open PR for a repo in a single `gh pr list` call and returns
   * the set of issue numbers those PRs close (parsed from their bodies).
   *
   * This is the batched replacement for per-issue `gh pr list --search
   * "closes #N"` queries. Every `gh pr list` form (search or plain list) is
   * served by GitHub's GraphQL API and consumes from the shared ~5000/hr
   * GraphQL budget, so issuing one query per candidate per tick exhausted the
   * limit on busy boards. A single `--state open` list returns every open PR
   * in one request regardless of candidate count, collapsing N calls into 1.
   *
   * Returns `null` if the check itself failed (gh missing, rate limited,
   * network error) so callers can fail open rather than block real work.
   */
  async fetchOpenPRClosures(owner: string, repo: string): Promise<Set<number> | null> {
    try {
      const exec = promisify(this.execFileFn);
      const { stdout } = await exec(
        'gh',
        [
          'pr',
          'list',
          '--repo',
          `${owner}/${repo}`,
          '--state',
          'open',
          '--json',
          'body',
          '--limit',
          '200',
        ],
        {
          cwd: this.projectRoot,
          timeout: 15_000,
        }
      );
      const prs = JSON.parse(stdout) as Array<{ body?: string | null }>;
      const closed = new Set<number>();
      for (const pr of prs) {
        for (const n of this.parseClosingIssueNumbers(pr.body ?? '')) closed.add(n);
      }
      return closed;
    } catch (err) {
      this.logger.debug(`Failed to list open PRs for ${owner}/${repo}`, {
        error: String(err),
      });
      return null;
    }
  }

  /**
   * Filters out candidates that already have an open GitHub PR.
   *
   * For GitHub-issue candidates the check is batched: one `gh pr list` per
   * distinct repo (not one search per issue), parsing closing references
   * locally. Candidates without a GitHub externalId fall back to a
   * `feat/<identifier>` branch lookup, throttled to a few concurrent gh calls.
   * Fail-open on API errors so a flaky/rate-limited GitHub never blocks work.
   */
  async filterCandidatesWithOpenPRs(candidates: Issue[]): Promise<Issue[]> {
    // One open-PR list call per distinct repo, keyed by `owner/repo`.
    const repos = new Map<string, { owner: string; repo: string }>();
    for (const candidate of candidates) {
      const parsed = candidate.externalId ? this.parseExternalId(candidate.externalId) : null;
      if (parsed) repos.set(`${parsed.owner}/${parsed.repo}`, parsed);
    }
    const repoClosures = new Map<string, Set<number> | null>();
    await Promise.all(
      [...repos.values()].map(async ({ owner, repo }) => {
        repoClosures.set(`${owner}/${repo}`, await this.fetchOpenPRClosures(owner, repo));
      })
    );

    // Candidates without a GitHub externalId need per-candidate branch lookups
    // (`gh pr list --head`), which can't be batched without repo info.
    // Throttle to 3 concurrent gh calls to limit GitHub API pressure.
    const identifierCandidates = candidates.filter(
      (c) => !(c.externalId && this.parseExternalId(c.externalId))
    );
    const identifiersWithOpenPR = new Set<string>();
    const concurrency = 3;
    for (let i = 0; i < identifierCandidates.length; i += concurrency) {
      const batch = identifierCandidates.slice(i, i + concurrency);
      const settled = await Promise.allSettled(
        batch.map(async (c) => ({
          identifier: c.identifier,
          hasOpenPR: await this.hasOpenPRForIdentifier(c.identifier),
        }))
      );
      for (const result of settled) {
        if (result.status === 'fulfilled' && result.value.hasOpenPR) {
          identifiersWithOpenPR.add(result.value.identifier);
        }
      }
    }

    const filtered: Issue[] = [];
    for (const candidate of candidates) {
      const parsed = candidate.externalId ? this.parseExternalId(candidate.externalId) : null;
      let hasOpenPR: boolean;
      let via: string;
      if (parsed) {
        // null closures => the list call failed; fail open (keep the candidate).
        const closures = repoClosures.get(`${parsed.owner}/${parsed.repo}`);
        hasOpenPR = closures ? closures.has(parsed.number) : false;
        via = `externalId ${candidate.externalId}`;
      } else {
        hasOpenPR = identifiersWithOpenPR.has(candidate.identifier);
        via = `feat/${candidate.identifier}`;
      }
      if (hasOpenPR) {
        this.logger.info(`Skipping ${candidate.title}: open PR exists (${via})`);
      } else {
        filtered.push(candidate);
      }
    }
    return filtered;
  }
}
