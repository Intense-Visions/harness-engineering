import type { Result, FeatureStatus } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import type {
  RoadmapTrackerClient,
  TrackedFeature,
  NewFeatureInput,
  FeaturePatch,
  HistoryEvent,
  ConflictError,
} from '../client';
import { GitHubHttp, parseExternalId, buildExternalId } from './github-http';
import { ETagStore } from '../etag-store';
import { parseBodyBlock, type BodyMeta } from '../body-metadata';

export interface GitHubIssuesTrackerOptions {
  token: string;
  repo: string; // "owner/repo"
  fetchFn?: typeof fetch;
  apiBase?: string;
  maxRetries?: number;
  baseDelayMs?: number;
  etagStore?: ETagStore;
  /** Label that selects harness-managed issues (default: `harness-managed`). */
  selectorLabel?: string;
}

interface RawIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  body: string | null;
  labels: Array<{ name: string }>;
  assignees: Array<{ login: string }>;
  milestone: { title: string } | null;
  created_at: string;
  updated_at: string | null;
  pull_request?: unknown;
}

export class GitHubIssuesTrackerAdapter implements RoadmapTrackerClient {
  private readonly http: GitHubHttp;
  private readonly owner: string;
  private readonly repo: string;
  private readonly cache: ETagStore;
  private readonly selectorLabel: string;

  constructor(opts: GitHubIssuesTrackerOptions) {
    this.http = new GitHubHttp(opts);
    const [owner, repo] = opts.repo.split('/');
    if (!owner || !repo) throw new Error(`Invalid repo "${opts.repo}", expected "owner/repo"`);
    this.owner = owner;
    this.repo = repo;
    this.cache = opts.etagStore ?? new ETagStore(500);
    this.selectorLabel = opts.selectorLabel ?? 'harness-managed';
  }

  // --- Reads ---

  async fetchAll(): Promise<Result<{ features: TrackedFeature[]; etag: string | null }, Error>> {
    try {
      const cacheKey = 'list:all';
      const cached = this.cache.get(cacheKey);
      const labelsParam = `&labels=${encodeURIComponent(this.selectorLabel)}`;
      const buildUrl = (page: number) =>
        `${this.http.apiBase}/repos/${this.owner}/${this.repo}/issues?state=all&per_page=100&page=${page}${labelsParam}`;

      const headers = cached ? { 'If-None-Match': cached.etag } : undefined;
      const { items, lastEtag, status } = await this.http.paginate<RawIssue>(
        buildUrl,
        100,
        headers
      );

      if (status === 304 && cached) {
        return Ok({ features: cached.data as TrackedFeature[], etag: cached.etag });
      }

      const issues = items.filter((i) => !i.pull_request);
      const nameIndex = new Map<string, string>();
      for (const i of issues) {
        nameIndex.set(i.title, buildExternalId(this.owner, this.repo, i.number));
      }
      const features = issues.map((i) => this.mapIssue(i, nameIndex));
      features.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      if (lastEtag) this.cache.set(cacheKey, lastEtag, features);
      return Ok({ features, etag: lastEtag });
    } catch (err) {
      return Err(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async fetchById(
    externalId: string
  ): Promise<Result<{ feature: TrackedFeature; etag: string } | null, Error>> {
    try {
      const parsed = parseExternalId(externalId);
      if (!parsed) return Err(new Error(`Invalid externalId: "${externalId}"`));

      const cacheKey = `feature:${externalId}`;
      const cached = this.cache.get(cacheKey);
      const init: RequestInit & { extraHeaders?: Record<string, string> } = { method: 'GET' };
      if (cached) init.extraHeaders = { 'If-None-Match': cached.etag };

      const res = await this.http.request(
        `${this.http.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`,
        init
      );

      if (res.status === 404) return Ok(null);
      if (res.status === 304 && cached) {
        return Ok({ feature: cached.data as TrackedFeature, etag: cached.etag });
      }
      if (!res.ok) return Err(new Error(`GitHub ${res.status}: ${await res.text()}`));

      const data = (await res.json()) as RawIssue;
      const etag = res.headers.get('ETag');
      if (data.pull_request) return Ok(null);
      const feature = this.mapIssue(data, new Map());
      if (etag) this.cache.set(cacheKey, etag, feature);
      return Ok({ feature, etag: etag ?? '' });
    } catch (err) {
      return Err(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async fetchByStatus(statuses: FeatureStatus[]): Promise<Result<TrackedFeature[], Error>> {
    const all = await this.fetchAll();
    if (!all.ok) return all;
    return Ok(all.value.features.filter((f) => statuses.includes(f.status)));
  }

  // --- Stubs for now: write methods + history ---
  async create(_feature: NewFeatureInput): Promise<Result<TrackedFeature, Error>> {
    return Err(new Error('not implemented'));
  }
  async update(
    _id: string,
    _patch: FeaturePatch,
    _ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>> {
    return Err(new Error('not implemented'));
  }
  async claim(
    _id: string,
    _assignee: string,
    _ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>> {
    return Err(new Error('not implemented'));
  }
  async release(
    _id: string,
    _ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>> {
    return Err(new Error('not implemented'));
  }
  async complete(
    _id: string,
    _ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>> {
    return Err(new Error('not implemented'));
  }
  async appendHistory(_id: string, _e: HistoryEvent): Promise<Result<void, Error>> {
    return Err(new Error('not implemented'));
  }
  async fetchHistory(_id: string, _limit?: number): Promise<Result<HistoryEvent[], Error>> {
    return Err(new Error('not implemented'));
  }

  // --- Helpers ---
  private mapIssue(issue: RawIssue, nameIndex: Map<string, string>): TrackedFeature {
    const { summary, meta } = parseBodyBlock(issue.body ?? '');
    const status = this.mapStatus(issue, meta);
    const blockedByExt: string[] = [];
    for (const name of meta.blocked_by ?? []) {
      const ext = nameIndex.get(name);
      if (ext) blockedByExt.push(ext);
      else if (process.env.DEBUG?.includes('harness:tracker')) {
        console.debug(`harness-tracker: blocked_by "${name}" not in response`);
      }
    }
    return {
      externalId: buildExternalId(this.owner, this.repo, issue.number),
      name: issue.title,
      status,
      summary,
      spec: meta.spec ?? null,
      plans: meta.plan ? [meta.plan] : [],
      blockedBy: blockedByExt,
      assignee: issue.assignees[0]?.login ? `@${issue.assignees[0].login}` : null,
      priority: meta.priority ?? null,
      milestone: issue.milestone?.title ?? meta.milestone ?? null,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at ?? null,
    };
  }

  private mapStatus(issue: RawIssue, _meta: BodyMeta): FeatureStatus {
    if (issue.state === 'closed') return 'done';
    const labels = issue.labels.map((l) => l.name);
    if (labels.includes('blocked')) return 'blocked';
    if (labels.includes('needs-human')) return 'needs-human';
    if (labels.includes('in-progress') || issue.assignees.length > 0) return 'in-progress';
    if (labels.includes('planned')) return 'planned';
    return 'backlog';
  }
}
