/**
 * Linear tracker adapter — implements {@link RoadmapTrackerClient} over Linear's
 * GraphQL API (https://linear.app/developers/graphql).
 *
 * ⚠️ Best-effort, NOT yet validated against a live Linear workspace. The query /
 * mutation shapes follow Linear's documented schema and the mapping is unit-
 * tested with a mocked transport, but field-level behavior (custom workflow
 * states, priority semantics, user resolution) should be verified against a real
 * workspace before production use. See the mapping notes inline.
 *
 * Mapping decisions:
 *  - `externalId` is `linear:<issue-uuid>` (the stable id; mutations need it).
 *  - `status` maps via Linear's fixed workflow-state *type* enum
 *    (`backlog|unstarted|started|completed|canceled`), NOT state names (which are
 *    team-defined). `blocked` / `needs-human` have no native state type and are
 *    treated as `started` on write (best-effort).
 *  - `spec` / `plans` / `blockedBy` / `priority` / `milestone` / `summary` are
 *    stored in the shared `<!-- harness-meta -->` body block (same encoding as the
 *    GitHub adapter), so roadmaps round-trip across trackers.
 *  - `priority` maps P0–P3 ↔ Linear 1–4 (urgent/high/normal/low); Linear 0 (none)
 *    ↔ null.
 *  - History events are stored as issue comments carrying a `harness-history`
 *    marker.
 */

import type { Result, FeatureStatus, Priority } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import type {
  RoadmapTrackerClient,
  TrackedFeature,
  NewFeatureInput,
  FeaturePatch,
  HistoryEvent,
  HistoryEventType,
} from '../client';
import { ConflictError } from '../client';
import { parseBodyBlock, serializeBodyBlock, type BodyMeta } from '../body-metadata';

const LINEAR_ENDPOINT = 'https://api.linear.app/graphql';
const EXTERNAL_PREFIX = 'linear:';
const HISTORY_MARKER = '<!-- harness-history -->';

export interface LinearTrackerOptions {
  apiKey: string;
  /** Linear team id — required to create issues and resolve workflow states. */
  teamId: string;
  endpoint?: string;
  fetchFn?: typeof fetch;
}

type LinearStateType = 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled' | 'triage';

interface LinearIssue {
  id: string;
  title: string;
  description?: string | null;
  state?: { type?: string | null; name?: string | null } | null;
  assignee?: { displayName?: string | null; name?: string | null } | null;
  priority?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

const ISSUE_FIELDS = `
  id title description priority createdAt updatedAt
  state { type name }
  assignee { displayName name }
`;

function statusFromStateType(type: string | null | undefined): FeatureStatus {
  switch (type) {
    case 'backlog':
    case 'triage':
      return 'backlog';
    case 'unstarted':
      return 'planned';
    case 'started':
      return 'in-progress';
    case 'completed':
    case 'canceled':
      return 'done';
    default:
      return 'backlog';
  }
}

/** Desired Linear state *type* for a FeatureStatus (used to pick a team state). */
function stateTypeForStatus(status: FeatureStatus): LinearStateType {
  switch (status) {
    case 'backlog':
      return 'backlog';
    case 'planned':
      return 'unstarted';
    case 'in-progress':
    case 'blocked':
    case 'needs-human':
      return 'started';
    case 'done':
      return 'completed';
    default:
      return 'backlog';
  }
}

function priorityFromLinear(p: number | null | undefined): Priority | null {
  switch (p) {
    case 1:
      return 'P0';
    case 2:
      return 'P1';
    case 3:
      return 'P2';
    case 4:
      return 'P3';
    default:
      return null; // 0 / null = "no priority"
  }
}

function linearFromPriority(p: Priority | null | undefined): number {
  switch (p) {
    case 'P0':
      return 1;
    case 'P1':
      return 2;
    case 'P2':
      return 3;
    case 'P3':
      return 4;
    default:
      return 0;
  }
}

function metaFrom(feature: NewFeatureInput | FeaturePatch): BodyMeta {
  const meta: BodyMeta = {};
  if (feature.spec != null) meta.spec = feature.spec;
  if (feature.plans && feature.plans.length > 0) meta.plan = feature.plans[0]!;
  if (feature.blockedBy && feature.blockedBy.length > 0) meta.blocked_by = feature.blockedBy;
  if (feature.priority != null) meta.priority = feature.priority;
  if (feature.milestone != null) meta.milestone = feature.milestone;
  return meta;
}

export class LinearTrackerAdapter implements RoadmapTrackerClient {
  private readonly apiKey: string;
  private readonly teamId: string;
  private readonly endpoint: string;
  private readonly fetchFn: typeof fetch;
  /** Lazily-resolved `stateType → stateId` for the team. */
  private stateCache: Map<string, string> | null = null;

  constructor(opts: LinearTrackerOptions) {
    this.apiKey = opts.apiKey;
    this.teamId = opts.teamId;
    this.endpoint = opts.endpoint ?? LINEAR_ENDPOINT;
    this.fetchFn = opts.fetchFn ?? globalThis.fetch;
  }

  private async gql<T = unknown>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<Result<T, Error>> {
    let res: Response;
    try {
      res = await this.fetchFn(this.endpoint, {
        method: 'POST',
        headers: { Authorization: this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: variables ?? {} }),
      });
    } catch (err) {
      return Err(
        new Error(`Linear request failed: ${err instanceof Error ? err.message : String(err)}`)
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return Err(new Error(`Linear HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}`));
    }
    let json: { data?: T; errors?: Array<{ message?: string }> };
    try {
      json = (await res.json()) as typeof json;
    } catch (err) {
      return Err(
        new Error(`Linear response not JSON: ${err instanceof Error ? err.message : String(err)}`)
      );
    }
    if (json.errors && json.errors.length > 0) {
      return Err(
        new Error(`Linear GraphQL error: ${json.errors.map((e) => e.message ?? '?').join('; ')}`)
      );
    }
    return Ok((json.data ?? {}) as T);
  }

  private toExternalId(id: string): string {
    return `${EXTERNAL_PREFIX}${id}`;
  }

  private toIssueId(externalId: string): string {
    return externalId.startsWith(EXTERNAL_PREFIX)
      ? externalId.slice(EXTERNAL_PREFIX.length)
      : externalId;
  }

  private featureFromIssue(issue: LinearIssue): TrackedFeature {
    const { summary, meta } = parseBodyBlock(issue.description ?? '');
    return {
      externalId: this.toExternalId(issue.id),
      name: issue.title,
      status: statusFromStateType(issue.state?.type),
      summary,
      spec: meta.spec ?? null,
      plans: meta.plan ? [meta.plan] : [],
      blockedBy: meta.blocked_by ?? [],
      assignee: issue.assignee?.displayName ?? issue.assignee?.name ?? null,
      priority: meta.priority ?? priorityFromLinear(issue.priority),
      milestone: meta.milestone ?? null,
      createdAt: issue.createdAt ?? new Date(0).toISOString(),
      updatedAt: issue.updatedAt ?? null,
    };
  }

  /** Resolve (and cache) the team's first state id of each workflow type. */
  private async resolveStateId(status: FeatureStatus): Promise<Result<string, Error>> {
    if (!this.stateCache) {
      const r = await this.gql<{
        team?: { states?: { nodes?: Array<{ id: string; type: string }> } };
      }>(`query($team:String!){ team(id:$team){ states { nodes { id type } } } }`, {
        team: this.teamId,
      });
      if (!r.ok) return r;
      const cache = new Map<string, string>();
      for (const s of r.value.team?.states?.nodes ?? []) {
        if (!cache.has(s.type)) cache.set(s.type, s.id);
      }
      this.stateCache = cache;
    }
    const wanted = stateTypeForStatus(status);
    const id = this.stateCache.get(wanted) ?? this.stateCache.get('backlog');
    return id ? Ok(id) : Err(new Error(`Linear team has no workflow state of type "${wanted}"`));
  }

  private async resolveUserId(assignee: string): Promise<Result<string | null, Error>> {
    const r = await this.gql<{ users?: { nodes?: Array<{ id: string }> } }>(
      `query($q:String!){ users(filter:{ or:[{ displayName:{ eq:$q } },{ email:{ eq:$q } }] }){ nodes { id } } }`,
      { q: assignee }
    );
    if (!r.ok) return r;
    return Ok(r.value.users?.nodes?.[0]?.id ?? null);
  }

  // ── Reads ──────────────────────────────────────────────────────────────

  async fetchAll(): Promise<Result<{ features: TrackedFeature[]; etag: string | null }, Error>> {
    const r = await this.gql<{ team?: { issues?: { nodes?: LinearIssue[] } } }>(
      `query($team:String!){ team(id:$team){ issues(first:250){ nodes { ${ISSUE_FIELDS} } } } }`,
      { team: this.teamId }
    );
    if (!r.ok) return r;
    const features = (r.value.team?.issues?.nodes ?? []).map((i) => this.featureFromIssue(i));
    return Ok({ features, etag: null });
  }

  async fetchById(
    externalId: string
  ): Promise<Result<{ feature: TrackedFeature; etag: string } | null, Error>> {
    const r = await this.gql<{ issue?: LinearIssue | null }>(
      `query($id:String!){ issue(id:$id){ ${ISSUE_FIELDS} } }`,
      { id: this.toIssueId(externalId) }
    );
    if (!r.ok) return r;
    if (!r.value.issue) return Ok(null);
    const feature = this.featureFromIssue(r.value.issue);
    return Ok({ feature, etag: feature.updatedAt ?? '' });
  }

  async fetchByStatus(statuses: FeatureStatus[]): Promise<Result<TrackedFeature[], Error>> {
    const all = await this.fetchAll();
    if (!all.ok) return all;
    const wanted = new Set(statuses);
    return Ok(all.value.features.filter((f) => wanted.has(f.status)));
  }

  // ── Writes ─────────────────────────────────────────────────────────────

  async create(feature: NewFeatureInput): Promise<Result<TrackedFeature, Error>> {
    const stateR = await this.resolveStateId(feature.status ?? 'backlog');
    if (!stateR.ok) return stateR;
    const body = serializeBodyBlock(feature.summary ?? '', metaFrom(feature));
    const input: Record<string, unknown> = {
      teamId: this.teamId,
      title: feature.name,
      description: body,
      stateId: stateR.value,
      priority: linearFromPriority(feature.priority),
    };
    if (feature.assignee) {
      const userR = await this.resolveUserId(feature.assignee);
      if (userR.ok && userR.value) input.assigneeId = userR.value;
    }
    const r = await this.gql<{ issueCreate?: { issue?: LinearIssue } }>(
      `mutation($input:IssueCreateInput!){ issueCreate(input:$input){ issue { ${ISSUE_FIELDS} } } }`,
      { input }
    );
    if (!r.ok) return r;
    const issue = r.value.issueCreate?.issue;
    if (!issue) return Err(new Error('Linear issueCreate returned no issue'));
    return Ok(this.featureFromIssue(issue));
  }

  /** Shared issueUpdate with optional optimistic-concurrency check on updatedAt. */
  private async issueUpdate(
    externalId: string,
    input: Record<string, unknown>,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>> {
    const id = this.toIssueId(externalId);
    if (ifMatch !== undefined) {
      const cur = await this.fetchById(externalId);
      if (!cur.ok) return cur;
      const serverUpdatedAt = cur.value?.feature.updatedAt ?? null;
      if (serverUpdatedAt !== ifMatch) {
        return Err(
          new ConflictError(
            externalId,
            { updatedAt: { ours: ifMatch, theirs: serverUpdatedAt } },
            serverUpdatedAt
          )
        );
      }
    }
    const r = await this.gql<{ issueUpdate?: { issue?: LinearIssue } }>(
      `mutation($id:String!,$input:IssueUpdateInput!){ issueUpdate(id:$id,input:$input){ issue { ${ISSUE_FIELDS} } } }`,
      { id, input }
    );
    if (!r.ok) return r;
    const issue = r.value.issueUpdate?.issue;
    if (!issue) return Err(new Error('Linear issueUpdate returned no issue'));
    return Ok(this.featureFromIssue(issue));
  }

  async update(
    externalId: string,
    patch: FeaturePatch,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>> {
    const input: Record<string, unknown> = {};
    if (patch.name !== undefined) input.title = patch.name;
    if (patch.priority !== undefined) input.priority = linearFromPriority(patch.priority);
    if (patch.status !== undefined) {
      const stateR = await this.resolveStateId(patch.status);
      if (!stateR.ok) return stateR;
      input.stateId = stateR.value;
    }
    // Body-backed fields (summary/spec/plans/blockedBy/priority/milestone) must be
    // merged into the existing description so we don't clobber the harness-meta block.
    const bodyFields: Array<keyof FeaturePatch> = [
      'summary',
      'spec',
      'plans',
      'blockedBy',
      'priority',
      'milestone',
    ];
    if (bodyFields.some((k) => patch[k] !== undefined)) {
      const cur = await this.fetchById(externalId);
      if (!cur.ok) return cur;
      if (!cur.value) return Err(new Error(`Linear issue not found: ${externalId}`));
      const f = cur.value.feature;
      const merged: NewFeatureInput = {
        name: patch.name ?? f.name,
        summary: patch.summary ?? f.summary,
        spec: patch.spec !== undefined ? patch.spec : f.spec,
        plans: patch.plans !== undefined ? patch.plans : f.plans,
        blockedBy: patch.blockedBy !== undefined ? patch.blockedBy : f.blockedBy,
        priority: patch.priority !== undefined ? patch.priority : f.priority,
        milestone: patch.milestone !== undefined ? patch.milestone : f.milestone,
      };
      input.description = serializeBodyBlock(merged.summary ?? '', metaFrom(merged));
    }
    if (patch.assignee !== undefined) {
      if (patch.assignee === null) {
        input.assigneeId = null;
      } else {
        const userR = await this.resolveUserId(patch.assignee);
        if (userR.ok && userR.value) input.assigneeId = userR.value;
      }
    }
    return this.issueUpdate(externalId, input, ifMatch);
  }

  async claim(
    externalId: string,
    assignee: string,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>> {
    const userR = await this.resolveUserId(assignee);
    if (!userR.ok) return userR;
    if (!userR.value) return Err(new Error(`Linear user not found: ${assignee}`));
    const stateR = await this.resolveStateId('in-progress');
    if (!stateR.ok) return stateR;
    return this.issueUpdate(
      externalId,
      { assigneeId: userR.value, stateId: stateR.value },
      ifMatch
    );
  }

  async release(
    externalId: string,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>> {
    return this.issueUpdate(externalId, { assigneeId: null }, ifMatch);
  }

  async complete(
    externalId: string,
    ifMatch?: string
  ): Promise<Result<TrackedFeature, ConflictError | Error>> {
    const stateR = await this.resolveStateId('done');
    if (!stateR.ok) return stateR;
    return this.issueUpdate(externalId, { stateId: stateR.value }, ifMatch);
  }

  // ── History (stored as issue comments) ──────────────────────────────────

  async appendHistory(externalId: string, event: HistoryEvent): Promise<Result<void, Error>> {
    const body = `${HISTORY_MARKER}\n\`\`\`json\n${JSON.stringify(event)}\n\`\`\``;
    const r = await this.gql<{ commentCreate?: { success?: boolean } }>(
      `mutation($input:CommentCreateInput!){ commentCreate(input:$input){ success } }`,
      { input: { issueId: this.toIssueId(externalId), body } }
    );
    if (!r.ok) return r;
    return Ok(undefined);
  }

  async fetchHistory(externalId: string, limit?: number): Promise<Result<HistoryEvent[], Error>> {
    const r = await this.gql<{ issue?: { comments?: { nodes?: Array<{ body?: string }> } } }>(
      `query($id:String!){ issue(id:$id){ comments(first:250){ nodes { body } } } }`,
      { id: this.toIssueId(externalId) }
    );
    if (!r.ok) return r;
    const events: HistoryEvent[] = [];
    for (const c of r.value.issue?.comments?.nodes ?? []) {
      if (!c.body || !c.body.includes(HISTORY_MARKER)) continue;
      const m = /```json\s*([\s\S]*?)\s*```/.exec(c.body);
      if (!m?.[1]) continue;
      try {
        const parsed = JSON.parse(m[1]) as HistoryEvent;
        if (parsed && typeof parsed.type === 'string') events.push(parsed);
      } catch {
        // skip malformed history comment
      }
    }
    return Ok(typeof limit === 'number' ? events.slice(0, limit) : events);
  }
}

export type { HistoryEventType };
