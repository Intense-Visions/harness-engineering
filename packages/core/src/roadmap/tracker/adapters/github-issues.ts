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
import { parseBodyBlock, serializeBodyBlock, type BodyMeta } from '../body-metadata';
import { refetchAndCompare } from '../conflict';
import { ConflictError as ConflictErrorClass } from '../client';

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

  // --- Writes ---

  async create(feature: NewFeatureInput): Promise<Result<TrackedFeature, Error>> {
    try {
      const meta: BodyMeta = {};
      if (feature.spec !== undefined && feature.spec !== null) meta.spec = feature.spec;
      if (feature.plans && feature.plans.length > 0) meta.plan = feature.plans[0]!;
      if (feature.blockedBy && feature.blockedBy.length > 0) meta.blocked_by = feature.blockedBy;
      if (feature.priority !== undefined && feature.priority !== null)
        meta.priority = feature.priority;
      if (feature.milestone !== undefined && feature.milestone !== null)
        meta.milestone = feature.milestone;
      const body = serializeBodyBlock(feature.summary ?? '', meta);
      const labels = [this.selectorLabel];
      if (feature.status && feature.status !== 'backlog') labels.push(feature.status);
      const payload: Record<string, unknown> = {
        title: feature.name,
        body,
        labels,
      };
      if (feature.assignee) payload.assignees = [feature.assignee.replace(/^@/, '')];
      const res = await this.http.request(
        `${this.http.apiBase}/repos/${this.owner}/${this.repo}/issues`,
        { method: 'POST', body: JSON.stringify(payload) }
      );
      if (!res.ok) return Err(new Error(`GitHub ${res.status}: ${await res.text()}`));
      const data = (await res.json()) as RawIssue;
      this.cache.invalidatePrefix('list:');
      return Ok(this.mapIssue(data, new Map()));
    } catch (err) {
      return Err(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async update(
    externalId: string,
    patch: FeaturePatch,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>> {
    const r = await this.updateInternal(externalId, patch, ifMatch);
    if (!r.ok) return r;
    return Ok(r.value.feature);
  }

  /**
   * Internal update that also reports whether a real PATCH was issued.
   * Returns wrote=false on the idempotent path so callers (claim/release/complete)
   * can skip best-effort history logging when no state change occurred.
   *
   * When ifMatch is supplied, updateInternal performs a refetch GET; the
   * refetched feature is returned as `priorFeature` so callers (release/complete)
   * can extract the pre-PATCH assignee for history attribution without a second GET.
   */
  private async updateInternal(
    externalId: string,
    patch: FeaturePatch,
    ifMatch?: string
  ): Promise<
    Result<
      { feature: TrackedFeature; wrote: boolean; priorFeature?: TrackedFeature },
      ConflictError | Error
    >
  > {
    try {
      const parsed = parseExternalId(externalId);
      if (!parsed) return Err(new Error(`Invalid externalId: "${externalId}"`));

      // Refetch-and-compare guard (decision D-P2-B)
      // GitHub REST does NOT support If-Match on PATCH /issues/{n}.
      // When ifMatch is provided, we GET fresh state and compare BEFORE issuing PATCH.
      // If diff present we return ConflictError without writing.
      // Race window between this GET and the PATCH below is unbounded; refetch-and-compare
      // narrows but does not eliminate concurrent-write conflicts. Callers should wrap with
      // withBackoff to retry on transient errors; ConflictError is intentionally not retried.
      let priorFeature: TrackedFeature | undefined;
      if (ifMatch) {
        const cur = await this.fetchById(externalId);
        if (!cur.ok) return cur;
        if (!cur.value) return Err(new Error(`Not found: ${externalId}`));
        priorFeature = cur.value.feature;
        const cmp = refetchAndCompare(cur.value.feature, patch);
        if (!cmp.ok) return Err(new ConflictErrorClass(externalId, cmp.diff!));
        if (cmp.idempotent) return Ok({ feature: cur.value.feature, wrote: false, priorFeature });
      }

      // Build PATCH payload — pass priorFeature so buildIssuePatchBody doesn't
      // re-issue a GET when body-meta fields are touched (P2-IMP-6).
      const reqBody = await this.buildIssuePatchBody(externalId, patch, priorFeature);
      const res = await this.http.request(
        `${this.http.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`,
        { method: 'PATCH', body: JSON.stringify(reqBody) }
      );
      if (!res.ok) return Err(new Error(`GitHub ${res.status}: ${await res.text()}`));
      const data = (await res.json()) as RawIssue;
      this.cache.invalidate(`feature:${externalId}`);
      this.cache.invalidatePrefix('list:');
      return Ok({ feature: this.mapIssue(data, new Map()), wrote: true, priorFeature });
    } catch (err) {
      return Err(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async buildIssuePatchBody(
    externalId: string,
    patch: FeaturePatch,
    priorFeature?: TrackedFeature
  ): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    if (patch.name !== undefined) out.title = patch.name;
    if (patch.assignee !== undefined) {
      out.assignees = patch.assignee ? [patch.assignee.replace(/^@/, '')] : [];
    }
    if (patch.status !== undefined) {
      if (patch.status === 'done') out.state = 'closed';
      else out.state = 'open';
    }
    // Body-meta fields → re-serialize body (requires reading current body)
    const bodyTouches: Array<keyof FeaturePatch> = [
      'summary',
      'spec',
      'plans',
      'blockedBy',
      'priority',
      'milestone',
    ];
    if (bodyTouches.some((k) => patch[k] !== undefined)) {
      // Reuse priorFeature when callers already fetched it (e.g. ifMatch refetch)
      // to avoid a second GET (P2-IMP-6).
      let current: TrackedFeature;
      if (priorFeature) {
        current = priorFeature;
      } else {
        const cur = await this.fetchById(externalId);
        if (!cur.ok || !cur.value) throw new Error('Cannot rebuild body without current state');
        current = cur.value.feature;
      }
      const meta: BodyMeta = {};
      const specVal = patch.spec !== undefined ? patch.spec : current.spec;
      if (specVal !== null && specVal !== undefined) meta.spec = specVal;
      const planVal = patch.plans !== undefined ? patch.plans[0] : current.plans[0];
      if (planVal) meta.plan = planVal;
      const blockedByVal = patch.blockedBy !== undefined ? patch.blockedBy : current.blockedBy;
      if (blockedByVal && blockedByVal.length > 0) meta.blocked_by = blockedByVal;
      const priorityVal = patch.priority !== undefined ? patch.priority : current.priority;
      if (priorityVal !== null && priorityVal !== undefined) meta.priority = priorityVal;
      const milestoneVal = patch.milestone !== undefined ? patch.milestone : current.milestone;
      if (milestoneVal !== null && milestoneVal !== undefined) meta.milestone = milestoneVal;
      const summaryText = patch.summary !== undefined ? patch.summary : current.summary;
      out.body = serializeBodyBlock(summaryText, meta);
    }
    return out;
  }
  async claim(
    externalId: string,
    assignee: string,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>> {
    const r = await this.updateInternal(externalId, { assignee, status: 'in-progress' }, ifMatch);
    if (!r.ok) return r;
    if (r.value.wrote) await this.logEvent(externalId, 'claimed', assignee);
    return Ok(r.value.feature);
  }
  async release(
    externalId: string,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>> {
    // Capture priorAssignee BEFORE the PATCH; the PATCH clears the assignee, so
    // reading from r.value.feature would always log actor='unknown'.
    // When ifMatch is supplied, updateInternal refetches internally and returns
    // the prior feature in r.value.priorFeature; otherwise we GET explicitly.
    const priorAssignee = await this.fetchPriorAssigneeIfNeeded(externalId, ifMatch);
    const r = await this.updateInternal(externalId, { assignee: null, status: 'backlog' }, ifMatch);
    if (!r.ok) return r;
    if (r.value.wrote) {
      const actor = r.value.priorFeature?.assignee ?? priorAssignee ?? null;
      await this.logEvent(externalId, 'released', actor ?? 'unknown');
    }
    return Ok(r.value.feature);
  }
  async complete(
    externalId: string,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>> {
    // Capture priorAssignee BEFORE the PATCH; in 'done by reviewer who never claimed'
    // flows the PATCH response may not carry the prior actor.
    const priorAssignee = await this.fetchPriorAssigneeIfNeeded(externalId, ifMatch);
    const r = await this.updateInternal(externalId, { status: 'done' }, ifMatch);
    if (!r.ok) return r;
    if (r.value.wrote) {
      const actor = r.value.priorFeature?.assignee ?? priorAssignee ?? null;
      await this.logEvent(externalId, 'completed', actor ?? 'unknown');
    }
    return Ok(r.value.feature);
  }

  /**
   * Best-effort GET to capture the assignee BEFORE a PATCH that may clear it.
   * Skipped when ifMatch is supplied because updateInternal will refetch and
   * thread the prior feature through.
   */
  private async fetchPriorAssigneeIfNeeded(
    externalId: string,
    ifMatch?: string
  ): Promise<string | null> {
    if (ifMatch) return null;
    const cur = await this.fetchById(externalId);
    if (cur.ok && cur.value) return cur.value.feature.assignee;
    return null;
  }

  private static HISTORY_PREFIX = '<!-- harness-history -->';

  async appendHistory(externalId: string, event: HistoryEvent): Promise<Result<void, Error>> {
    try {
      const parsed = parseExternalId(externalId);
      if (!parsed) return Err(new Error(`Invalid externalId: "${externalId}"`));
      const body = `${GitHubIssuesTrackerAdapter.HISTORY_PREFIX}\n${JSON.stringify(event)}`;
      const res = await this.http.request(
        `${this.http.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}/comments`,
        { method: 'POST', body: JSON.stringify({ body }) }
      );
      if (!res.ok) return Err(new Error(`GitHub ${res.status}: ${await res.text()}`));
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async fetchHistory(externalId: string, limit?: number): Promise<Result<HistoryEvent[], Error>> {
    try {
      const parsed = parseExternalId(externalId);
      if (!parsed) return Err(new Error(`Invalid externalId: "${externalId}"`));
      const buildUrl = (page: number) =>
        `${this.http.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}/comments?per_page=100&page=${page}`;
      const { items } = await this.http.paginate<{ body: string; created_at: string }>(buildUrl);
      const events: HistoryEvent[] = [];
      for (const c of items) {
        if (!c.body.startsWith(GitHubIssuesTrackerAdapter.HISTORY_PREFIX)) continue;
        const json = c.body.slice(GitHubIssuesTrackerAdapter.HISTORY_PREFIX.length).trim();
        try {
          events.push(JSON.parse(json) as HistoryEvent);
        } catch (e) {
          console.warn(`harness-history: malformed JSON in ${externalId}: ${(e as Error).message}`);
        }
      }
      events.sort((a, b) => a.at.localeCompare(b.at));
      return Ok(limit ? events.slice(-limit) : events);
    } catch (err) {
      return Err(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async logEvent(
    externalId: string,
    type: HistoryEvent['type'],
    actor: string
  ): Promise<void> {
    const event: HistoryEvent = {
      type,
      actor,
      at: new Date().toISOString(),
    };
    const r = await this.appendHistory(externalId, event);
    if (!r.ok) {
      console.warn(`harness-history: append failed for ${externalId}: ${r.error.message}`);
    }
  }

  // --- Helpers ---
  // The nameIndex parameter is retained for backwards-compatibility with the
  // fetchAll signature but is no longer consulted: blockedBy holds feature
  // names verbatim from the body-meta block (see client.ts TrackedFeature.blockedBy).
  private mapIssue(issue: RawIssue, _nameIndex: Map<string, string>): TrackedFeature {
    const { summary, meta } = parseBodyBlock(issue.body ?? '');
    const status = this.mapStatus(issue, meta);
    return {
      externalId: buildExternalId(this.owner, this.repo, issue.number),
      name: issue.title,
      status,
      summary,
      spec: meta.spec ?? null,
      plans: meta.plan ? [meta.plan] : [],
      blockedBy: meta.blocked_by ?? [],
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
