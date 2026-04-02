import type {
  RoadmapFeature,
  Result,
  ExternalTicket,
  ExternalTicketState,
  TrackerSyncConfig,
} from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import type { TrackerSyncAdapter } from '../tracker-sync';

/**
 * Parse "github:owner/repo#42" into { owner, repo, number }.
 * Returns null if the format is invalid.
 */
export function parseExternalId(
  externalId: string
): { owner: string; repo: string; number: number } | null {
  const match = externalId.match(/^github:([^/]+)\/([^#]+)#(\d+)$/);
  if (!match) return null;
  return { owner: match[1]!, repo: match[2]!, number: parseInt(match[3]!, 10) };
}

/**
 * Build the externalId string from parts.
 */
function buildExternalId(owner: string, repo: string, number: number): string {
  return `github:${owner}/${repo}#${number}`;
}

/**
 * Determine which labels to apply based on status and config.
 * Returns the configured labels plus a status-specific label if the
 * status maps to "open" (to disambiguate open statuses).
 */
function labelsForStatus(status: string, config: TrackerSyncConfig): string[] {
  const base = config.labels ?? [];
  const externalStatus = config.statusMap[status as keyof typeof config.statusMap];
  if (externalStatus === 'open' && status !== 'backlog') {
    return [...base, status];
  }
  return [...base];
}

export interface GitHubAdapterOptions {
  /** GitHub API token */
  token: string;
  /** Tracker sync config */
  config: TrackerSyncConfig;
  /** Override fetch for testing */
  fetchFn?: typeof fetch;
  /** Override API base URL (for GitHub Enterprise) */
  apiBase?: string;
}

export class GitHubIssuesSyncAdapter implements TrackerSyncAdapter {
  private readonly token: string;
  private readonly config: TrackerSyncConfig;
  private readonly fetchFn: typeof fetch;
  private readonly apiBase: string;
  private readonly owner: string;
  private readonly repo: string;

  constructor(options: GitHubAdapterOptions) {
    this.token = options.token;
    this.config = options.config;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.apiBase = options.apiBase ?? 'https://api.github.com';

    const repoParts = (options.config.repo ?? '').split('/');
    if (repoParts.length !== 2 || !repoParts[0] || !repoParts[1]) {
      throw new Error(`Invalid repo format: "${options.config.repo}". Expected "owner/repo".`);
    }
    this.owner = repoParts[0];
    this.repo = repoParts[1];
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  async createTicket(feature: RoadmapFeature, milestone: string): Promise<Result<ExternalTicket>> {
    try {
      const labels = labelsForStatus(feature.status, this.config);
      const body = [
        feature.summary,
        '',
        `**Milestone:** ${milestone}`,
        feature.spec ? `**Spec:** ${feature.spec}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const response = await this.fetchFn(
        `${this.apiBase}/repos/${this.owner}/${this.repo}/issues`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({
            title: feature.name,
            body,
            labels,
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        return Err(new Error(`GitHub API error ${response.status}: ${text}`));
      }

      const data = (await response.json()) as { number: number; html_url: string };
      const externalId = buildExternalId(this.owner, this.repo, data.number);

      return Ok({ externalId, url: data.html_url });
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async updateTicket(
    externalId: string,
    changes: Partial<RoadmapFeature>
  ): Promise<Result<ExternalTicket>> {
    try {
      const parsed = parseExternalId(externalId);
      if (!parsed) return Err(new Error(`Invalid externalId format: "${externalId}"`));

      const patch: Record<string, unknown> = {};
      if (changes.name !== undefined) patch.title = changes.name;
      if (changes.summary !== undefined) {
        const body = [changes.summary, '', changes.spec ? `**Spec:** ${changes.spec}` : '']
          .filter(Boolean)
          .join('\n');
        patch.body = body;
      }
      if (changes.status !== undefined) {
        const externalStatus = this.config.statusMap[changes.status];
        patch.state = externalStatus;
        // Update labels for status disambiguation
        patch.labels = labelsForStatus(changes.status, this.config);
      }

      const response = await this.fetchFn(
        `${this.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`,
        {
          method: 'PATCH',
          headers: this.headers(),
          body: JSON.stringify(patch),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        return Err(new Error(`GitHub API error ${response.status}: ${text}`));
      }

      const data = (await response.json()) as { html_url: string };
      return Ok({ externalId, url: data.html_url });
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async fetchTicketState(externalId: string): Promise<Result<ExternalTicketState>> {
    try {
      const parsed = parseExternalId(externalId);
      if (!parsed) return Err(new Error(`Invalid externalId format: "${externalId}"`));

      const response = await this.fetchFn(
        `${this.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`,
        {
          method: 'GET',
          headers: this.headers(),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        return Err(new Error(`GitHub API error ${response.status}: ${text}`));
      }

      const data = (await response.json()) as {
        state: string;
        labels: Array<{ name: string }>;
        assignee: { login: string } | null;
      };

      return Ok({
        externalId,
        status: data.state,
        labels: data.labels.map((l) => l.name),
        assignee: data.assignee ? `@${data.assignee.login}` : null,
      });
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async fetchAllTickets(): Promise<Result<ExternalTicketState[]>> {
    try {
      const filterLabels = this.config.labels ?? [];
      const labelsParam = filterLabels.length > 0 ? `&labels=${filterLabels.join(',')}` : '';

      const tickets: ExternalTicketState[] = [];
      let page = 1;
      const perPage = 100;

      while (true) {
        const response = await this.fetchFn(
          `${this.apiBase}/repos/${this.owner}/${this.repo}/issues?state=all&per_page=${perPage}&page=${page}${labelsParam}`,
          {
            method: 'GET',
            headers: this.headers(),
          }
        );

        if (!response.ok) {
          const text = await response.text();
          return Err(new Error(`GitHub API error ${response.status}: ${text}`));
        }

        const data = (await response.json()) as Array<{
          number: number;
          state: string;
          labels: Array<{ name: string }>;
          assignee: { login: string } | null;
          pull_request?: unknown;
        }>;

        // Filter out pull requests (GitHub API returns them in issues endpoint)
        const issues = data.filter((d) => !d.pull_request);

        for (const issue of issues) {
          tickets.push({
            externalId: buildExternalId(this.owner, this.repo, issue.number),
            status: issue.state,
            labels: issue.labels.map((l) => l.name),
            assignee: issue.assignee ? `@${issue.assignee.login}` : null,
          });
        }

        if (data.length < perPage) break;
        page++;
      }

      return Ok(tickets);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async assignTicket(externalId: string, assignee: string): Promise<Result<void>> {
    try {
      const parsed = parseExternalId(externalId);
      if (!parsed) return Err(new Error(`Invalid externalId format: "${externalId}"`));

      // Strip leading @ from assignee
      const login = assignee.startsWith('@') ? assignee.slice(1) : assignee;

      const response = await this.fetchFn(
        `${this.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}/assignees`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ assignees: [login] }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        return Err(new Error(`GitHub API error ${response.status}: ${text}`));
      }

      return Ok(undefined);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
