import type { Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import type { RoadmapTrackerClient } from './client';
import {
  GitHubIssuesTrackerAdapter,
  type GitHubIssuesTrackerOptions,
} from './adapters/github-issues';
import { LinearTrackerAdapter, type LinearTrackerOptions } from './adapters/linear';
import { ETagStore } from './etag-store';

export interface GitHubTrackerClientConfig {
  kind: 'github-issues';
  repo: string;
  token?: string;
  apiBase?: string;
  selectorLabel?: string;
  etagStore?: ETagStore;
}

export interface LinearTrackerClientConfig {
  kind: 'linear';
  /** Linear team id (resolves workflow states + scopes issues). */
  teamId: string;
  /** Linear API key; falls back to the LINEAR_API_KEY env var. */
  token?: string;
  /** GraphQL endpoint override. */
  apiBase?: string;
}

export type TrackerClientConfig = GitHubTrackerClientConfig | LinearTrackerClientConfig;

export function createTrackerClient(
  config: TrackerClientConfig
): Result<RoadmapTrackerClient, Error> {
  if (config.kind === 'github-issues') {
    const token = config.token ?? process.env.GITHUB_TOKEN;
    if (!token) {
      return Err(
        new Error('createTrackerClient: missing GitHub token (config.token or GITHUB_TOKEN env)')
      );
    }
    // Build options without spreading undefined values (exactOptionalPropertyTypes).
    const opts: GitHubIssuesTrackerOptions = { token, repo: config.repo };
    if (config.apiBase !== undefined) opts.apiBase = config.apiBase;
    if (config.selectorLabel !== undefined) opts.selectorLabel = config.selectorLabel;
    if (config.etagStore !== undefined) opts.etagStore = config.etagStore;
    return Ok(new GitHubIssuesTrackerAdapter(opts));
  }

  if (config.kind === 'linear') {
    const token = config.token ?? process.env.LINEAR_API_KEY;
    if (!token) {
      return Err(
        new Error(
          'createTrackerClient: missing Linear API key (config.token or LINEAR_API_KEY env)'
        )
      );
    }
    const opts: LinearTrackerOptions = { apiKey: token, teamId: config.teamId };
    if (config.apiBase !== undefined) opts.endpoint = config.apiBase;
    return Ok(new LinearTrackerAdapter(opts));
  }

  return Err(new Error(`Unsupported tracker kind: "${String((config as { kind: string }).kind)}"`));
}
