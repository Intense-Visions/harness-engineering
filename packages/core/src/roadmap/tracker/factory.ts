import type { Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import type { RoadmapTrackerClient } from './client';
import { GitHubIssuesTrackerAdapter } from './adapters/github-issues';
import { ETagStore } from './etag-store';

export interface TrackerClientConfig {
  kind: 'github-issues';
  repo: string;
  token?: string;
  apiBase?: string;
  selectorLabel?: string;
  etagStore?: ETagStore;
}

export function createTrackerClient(
  config: TrackerClientConfig
): Result<RoadmapTrackerClient, Error> {
  if (config.kind !== 'github-issues') {
    return Err(new Error(`Unsupported tracker kind: "${String(config.kind)}"`));
  }
  const token = config.token ?? process.env.GITHUB_TOKEN;
  if (!token) {
    return Err(
      new Error('createTrackerClient: missing GitHub token (config.token or GITHUB_TOKEN env)')
    );
  }
  return Ok(
    new GitHubIssuesTrackerAdapter({
      token,
      repo: config.repo,
      apiBase: config.apiBase,
      selectorLabel: config.selectorLabel,
      etagStore: config.etagStore,
    })
  );
}
