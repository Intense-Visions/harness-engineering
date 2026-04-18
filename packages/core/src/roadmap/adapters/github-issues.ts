import type {
  RoadmapFeature,
  Result,
  ExternalTicket,
  ExternalTicketState,
  TrackerSyncConfig,
  TrackerComment,
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

/** Default retry settings for rate-limited requests. */
const RETRY_DEFAULTS = { maxRetries: 5, baseDelayMs: 1000 };

/**
 * Parse "owner/repo" into { owner, repo }.
 * Throws if the format is invalid.
 */
function parseRepoParts(repo: string | undefined): { owner: string; repo: string } {
  const parts = (repo ?? '').split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repo format: "${repo}". Expected "owner/repo".`);
  }
  return { owner: parts[0], repo: parts[1] };
}

/**
 * Sleep helper that can be overridden in tests.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap a fetch call with retry logic for GitHub rate limits (403 secondary, 429 primary).
 * Respects the Retry-After header when present, otherwise uses exponential backoff with jitter.
 */
async function fetchWithRetry(
  fetchFn: typeof fetch,
  input: string,
  init: RequestInit,
  opts: { maxRetries: number; baseDelayMs: number } = RETRY_DEFAULTS
): Promise<Response> {
  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const response = await fetchFn(input, init);
    if (response.status !== 403 && response.status !== 429) return response;

    lastResponse = response;
    if (attempt === opts.maxRetries) break;

    // Determine delay: prefer Retry-After header, else exponential backoff + jitter
    const retryAfter = response.headers.get('Retry-After');
    let delayMs: number;
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      delayMs = isNaN(seconds) ? opts.baseDelayMs : seconds * 1000;
    } else {
      delayMs = opts.baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
    }
    await sleep(delayMs);
  }
  return lastResponse!;
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
  /** Max retries on rate limit (default: 5) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelayMs?: number;
}

export class GitHubIssuesSyncAdapter implements TrackerSyncAdapter {
  private readonly token: string;
  private readonly config: TrackerSyncConfig;
  private readonly fetchFn: typeof fetch;
  private readonly apiBase: string;
  private readonly owner: string;
  private readonly repo: string;
  private readonly retryOpts: { maxRetries: number; baseDelayMs: number };
  /** Cached GitHub milestone name -> ID mapping */
  private milestoneCache: Map<string, number> | null = null;
  /** Cached authenticated user login (e.g., "@octocat") */
  private authenticatedUserCache: string | null = null;

  constructor(options: GitHubAdapterOptions) {
    this.token = options.token;
    this.config = options.config;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.apiBase = options.apiBase ?? 'https://api.github.com';
    this.retryOpts = {
      maxRetries: options.maxRetries ?? RETRY_DEFAULTS.maxRetries,
      baseDelayMs: options.baseDelayMs ?? RETRY_DEFAULTS.baseDelayMs,
    };

    const { owner, repo } = parseRepoParts(options.config.repo);
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Fetch all GitHub milestones and build the name -> ID cache.
   */
  private async loadMilestones(): Promise<Map<string, number>> {
    if (this.milestoneCache) return this.milestoneCache;
    this.milestoneCache = new Map();

    const response = await fetchWithRetry(
      this.fetchFn,
      `${this.apiBase}/repos/${this.owner}/${this.repo}/milestones?state=all&per_page=100`,
      { method: 'GET', headers: this.headers() },
      this.retryOpts
    );

    if (response.ok) {
      const data = (await response.json()) as Array<{ number: number; title: string }>;
      for (const m of data) {
        this.milestoneCache.set(m.title, m.number);
      }
    }
    return this.milestoneCache;
  }

  /**
   * Get or create a GitHub milestone by name. Returns the milestone number.
   */
  private async ensureMilestone(name: string): Promise<number | null> {
    const cache = await this.loadMilestones();
    if (cache.has(name)) return cache.get(name)!;

    const response = await fetchWithRetry(
      this.fetchFn,
      `${this.apiBase}/repos/${this.owner}/${this.repo}/milestones`,
      { method: 'POST', headers: this.headers(), body: JSON.stringify({ title: name }) },
      this.retryOpts
    );

    if (!response.ok) return null;
    const data = (await response.json()) as { number: number };
    cache.set(name, data.number);
    return data.number;
  }

  async getAuthenticatedUser(): Promise<Result<string>> {
    if (this.authenticatedUserCache) return Ok(this.authenticatedUserCache);

    try {
      const response = await fetchWithRetry(
        this.fetchFn,
        `${this.apiBase}/user`,
        { method: 'GET', headers: this.headers() },
        this.retryOpts
      );

      if (!response.ok) {
        const text = await response.text();
        return Err(new Error(`GitHub API error ${response.status}: ${text}`));
      }

      const data = (await response.json()) as { login: string };
      this.authenticatedUserCache = `@${data.login}`;
      return Ok(this.authenticatedUserCache);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Resolve an assignee value to a GitHub login.
   * - "@username" → "username"
   * - "username" (no @) → "username"
   * - Orchestrator IDs (hostname-hash like "chads-macbook-pro-8565381d") →
   *   resolved via authenticated user, since they're not valid GitHub logins.
   * Returns null if the assignee cannot be resolved.
   */
  private async resolveAssigneeLogin(assignee: string): Promise<string | null> {
    if (assignee.startsWith('@')) return assignee.slice(1);
    // Orchestrator IDs: "orchestrator-{8hexchars}" or legacy "hostname-{8hexchars}"
    if (/^orchestrator-[0-9a-f]{8}$/.test(assignee) || /^[\w-]+-[0-9a-f]{8}$/.test(assignee)) {
      const userResult = await this.getAuthenticatedUser();
      if (userResult.ok) return userResult.value.replace(/^@/, '');
      return null;
    }
    return assignee;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  /**
   * Close an issue if the feature status maps to 'closed'.
   * GitHub Issues API doesn't accept state on POST — requires a follow-up PATCH.
   */
  private async closeIfDone(issueNumber: number, featureStatus: string): Promise<void> {
    const externalStatus =
      this.config.statusMap[featureStatus as keyof typeof this.config.statusMap];
    if (externalStatus !== 'closed') return;
    await fetchWithRetry(
      this.fetchFn,
      `${this.apiBase}/repos/${this.owner}/${this.repo}/issues/${issueNumber}`,
      { method: 'PATCH', headers: this.headers(), body: JSON.stringify({ state: 'closed' }) },
      this.retryOpts
    );
  }

  async createTicket(feature: RoadmapFeature, milestone: string): Promise<Result<ExternalTicket>> {
    try {
      const labels = labelsForStatus(feature.status, this.config);
      const body = [feature.summary, '', feature.spec ? `**Spec:** ${feature.spec}` : '']
        .filter(Boolean)
        .join('\n');

      const milestoneId = await this.ensureMilestone(milestone);
      const issuePayload: Record<string, unknown> = {
        title: feature.name,
        body,
        labels,
        type: 'Feature',
      };
      if (milestoneId) issuePayload.milestone = milestoneId;
      if (feature.assignee) {
        const login = await this.resolveAssigneeLogin(feature.assignee);
        if (login) {
          issuePayload.assignees = [login];
        }
      }

      const response = await fetchWithRetry(
        this.fetchFn,
        `${this.apiBase}/repos/${this.owner}/${this.repo}/issues`,
        { method: 'POST', headers: this.headers(), body: JSON.stringify(issuePayload) },
        this.retryOpts
      );

      if (!response.ok) {
        const text = await response.text();
        return Err(new Error(`GitHub API error ${response.status}: ${text}`));
      }

      const data = (await response.json()) as { number: number; html_url: string };
      const externalId = buildExternalId(this.owner, this.repo, data.number);
      await this.closeIfDone(data.number, feature.status);
      return Ok({ externalId, url: data.html_url });
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async updateTicket(
    externalId: string,
    changes: Partial<RoadmapFeature>,
    milestone?: string
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
        // Update labels for status disambiguation, preserving the type label
        patch.labels = labelsForStatus(changes.status, this.config);
      }
      if (changes.assignee !== undefined) {
        if (changes.assignee) {
          const login = await this.resolveAssigneeLogin(changes.assignee);
          if (login) {
            patch.assignees = [login];
          }
          // If login is null (unresolvable orchestrator ID), skip assignee update
        } else {
          patch.assignees = [];
        }
      }
      if (milestone) {
        const milestoneId = await this.ensureMilestone(milestone);
        if (milestoneId) patch.milestone = milestoneId;
      }

      const response = await fetchWithRetry(
        this.fetchFn,
        `${this.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`,
        {
          method: 'PATCH',
          headers: this.headers(),
          body: JSON.stringify(patch),
        },
        this.retryOpts
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

      const response = await fetchWithRetry(
        this.fetchFn,
        `${this.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`,
        {
          method: 'GET',
          headers: this.headers(),
        },
        this.retryOpts
      );

      if (!response.ok) {
        const text = await response.text();
        return Err(new Error(`GitHub API error ${response.status}: ${text}`));
      }

      const data = (await response.json()) as {
        title: string;
        state: string;
        labels: Array<{ name: string }>;
        assignee: { login: string } | null;
      };

      return Ok({
        externalId,
        title: data.title,
        status: data.state,
        labels: data.labels.map((l) => l.name),
        assignee: data.assignee ? `@${data.assignee.login}` : null,
      });
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private buildLabelsParam(): string {
    const filterLabels = this.config.labels ?? [];
    return filterLabels.length > 0
      ? `&labels=${filterLabels.map(encodeURIComponent).join(',')}`
      : '';
  }

  private issueToTicketState(issue: {
    number: number;
    title: string;
    state: string;
    labels: Array<{ name: string }>;
    assignee: { login: string } | null;
  }): ExternalTicketState {
    return {
      externalId: buildExternalId(this.owner, this.repo, issue.number),
      title: issue.title,
      status: issue.state,
      labels: issue.labels.map((l) => l.name),
      assignee: issue.assignee ? `@${issue.assignee.login}` : null,
    };
  }

  private async fetchIssuePage(page: number, labelsParam: string): Promise<Response> {
    const perPage = 100;
    return fetchWithRetry(
      this.fetchFn,
      `${this.apiBase}/repos/${this.owner}/${this.repo}/issues?state=all&per_page=${perPage}&page=${page}${labelsParam}`,
      { method: 'GET', headers: this.headers() },
      this.retryOpts
    );
  }

  async fetchAllTickets(): Promise<Result<ExternalTicketState[]>> {
    try {
      const labelsParam = this.buildLabelsParam();
      const tickets: ExternalTicketState[] = [];
      let page = 1;
      const perPage = 100;

      while (true) {
        const response = await this.fetchIssuePage(page, labelsParam);

        if (!response.ok) {
          const text = await response.text();
          return Err(new Error(`GitHub API error ${response.status}: ${text}`));
        }

        const data = (await response.json()) as Array<{
          number: number;
          title: string;
          state: string;
          labels: Array<{ name: string }>;
          assignee: { login: string } | null;
          pull_request?: unknown;
        }>;

        const issues = data.filter((d) => !d.pull_request);
        for (const issue of issues) {
          tickets.push(this.issueToTicketState(issue));
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

      const response = await fetchWithRetry(
        this.fetchFn,
        `${this.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}/assignees`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ assignees: [login] }),
        },
        this.retryOpts
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

  async addComment(externalId: string, markdownBody: string): Promise<Result<void>> {
    try {
      const parsed = parseExternalId(externalId);
      if (!parsed) return Err(new Error(`Invalid externalId format: "${externalId}"`));

      const response = await fetchWithRetry(
        this.fetchFn,
        `${this.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}/comments`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ body: markdownBody }),
        },
        this.retryOpts
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

  private toTrackerComment(comment: {
    id: number;
    body: string;
    created_at: string;
    updated_at: string | null;
    user: { login: string };
  }): TrackerComment {
    return {
      id: String(comment.id),
      body: comment.body,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at ?? null,
      author: comment.user?.login ?? 'ghost',
    };
  }

  private async fetchCommentPage(
    parsed: { owner: string; repo: string; number: number },
    page: number
  ): Promise<
    Result<
      Array<{
        id: number;
        body: string;
        created_at: string;
        updated_at: string | null;
        user: { login: string };
      }>
    >
  > {
    const perPage = 100;
    const response = await fetchWithRetry(
      this.fetchFn,
      `${this.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}/comments?per_page=${perPage}&page=${page}`,
      { method: 'GET', headers: this.headers() },
      this.retryOpts
    );

    if (!response.ok) {
      const text = await response.text();
      return Err(new Error(`GitHub API error ${response.status}: ${text}`));
    }

    return Ok(
      (await response.json()) as Array<{
        id: number;
        body: string;
        created_at: string;
        updated_at: string | null;
        user: { login: string };
      }>
    );
  }

  async fetchComments(externalId: string): Promise<Result<TrackerComment[]>> {
    try {
      const parsed = parseExternalId(externalId);
      if (!parsed) return Err(new Error(`Invalid externalId format: "${externalId}"`));

      const comments: TrackerComment[] = [];
      const perPage = 100;
      let page = 1;

      while (true) {
        const pageResult = await this.fetchCommentPage(parsed, page);
        if (!pageResult.ok) return pageResult;

        for (const comment of pageResult.value) {
          comments.push(this.toTrackerComment(comment));
        }

        if (pageResult.value.length < perPage) break;
        page++;
      }

      return Ok(comments);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
