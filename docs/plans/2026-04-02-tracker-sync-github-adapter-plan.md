# Plan: Tracker Sync Interface & GitHub Adapter (Phase 2)

**Date:** 2026-04-02
**Spec:** docs/changes/roadmap-sync-pilot/proposal.md
**Phase:** 2 of 4 (Tracker Sync Interface & GitHub Adapter)
**Estimated tasks:** 8
**Estimated time:** 30 minutes

## Goal

Implement the `TrackerSyncAdapter` interface, `GitHubIssuesSyncAdapter`, and the sync engine (`syncToExternal`, `syncFromExternal`, `fullSync`) so that roadmap features can be bidirectionally synced with GitHub Issues using split authority (roadmap owns planning, external owns execution/assignment).

## Observable Truths (Acceptance Criteria)

1. **[Event-driven]** When `TrackerSyncAdapter.createTicket` is called with a `RoadmapFeature`, the result contains an `ExternalTicket` with `externalId` (format `"github:owner/repo#N"`) and `url`.
2. **[Event-driven]** When `syncToExternal` runs and a feature has no `externalId`, `createTicket` is called and the returned `externalId` is stored on the feature object.
3. **[Event-driven]** When `syncToExternal` runs and a feature has an `externalId`, `updateTicket` is called with current planning fields.
4. **[Event-driven]** When `syncFromExternal` pulls and the external assignee differs from the local assignee, the external assignee wins and the local field is updated.
5. **[Event-driven]** When `syncFromExternal` pulls a status that would regress the local status (e.g., `done` -> `in-progress`), the system does not apply the change unless `forceSync` is true.
6. **[Unwanted]** If the external service API fails during sync, the system does not throw -- errors are collected per-feature in `SyncResult.errors`.
7. **[State-driven]** While a `fullSync` call is in progress, subsequent `fullSync` calls queue behind the in-process mutex and execute serially.
8. **[Event-driven]** When pulling status from GitHub Issues where the issue is `open`, labels disambiguate (`"in-progress"` label -> `in-progress`, `"blocked"` label -> `blocked`, `"planned"` label -> `planned`). If ambiguous (multiple status labels or no status label), the current roadmap status is preserved.
9. **[Event-driven]** When `fullSync` runs, it reads roadmap from disk, pushes (planning fields out), pulls (execution fields back), writes updated roadmap back to disk, all within the mutex.
10. **[Ubiquitous]** `npx vitest run` in `packages/core` passes all existing + new tests.
11. **[Ubiquitous]** `harness validate` passes.

## File Map

```
CREATE packages/types/src/tracker-sync.ts                  -- ExternalTicket, ExternalTicketState, SyncResult, TrackerSyncConfig types
MODIFY packages/types/src/index.ts                         -- Re-export tracker-sync types
CREATE packages/core/src/roadmap/tracker-sync.ts           -- TrackerSyncAdapter interface
CREATE packages/core/src/roadmap/adapters/github-issues.ts -- GitHubIssuesSyncAdapter implementation
CREATE packages/core/src/roadmap/sync-engine.ts            -- syncToExternal, syncFromExternal, fullSync
MODIFY packages/core/src/roadmap/index.ts                  -- Export new modules
CREATE packages/core/tests/roadmap/tracker-sync.test.ts    -- Interface contract tests
CREATE packages/core/tests/roadmap/github-issues.test.ts   -- GitHub adapter tests with mocked fetch
CREATE packages/core/tests/roadmap/sync-engine.test.ts     -- Sync engine tests with mock adapter
```

## Tasks

### Task 1: Define tracker sync types in types package

**Depends on:** none
**Files:** `packages/types/src/tracker-sync.ts`, `packages/types/src/index.ts`

1. Create `packages/types/src/tracker-sync.ts`:

```typescript
import type { FeatureStatus } from './index';

/**
 * Represents a ticket created in an external tracking service.
 */
export interface ExternalTicket {
  /** External identifier, e.g., "github:owner/repo#42" */
  externalId: string;
  /** URL to the ticket in the external service */
  url: string;
}

/**
 * Current state of a ticket in the external service.
 * Pulled during syncFromExternal.
 */
export interface ExternalTicketState {
  /** External identifier */
  externalId: string;
  /** External status (e.g., "open", "closed") */
  status: string;
  /** External labels (used for status disambiguation on GitHub) */
  labels: string[];
  /** Current assignee in the external service, or null */
  assignee: string | null;
}

/**
 * Result of a sync operation. Collects successes and errors per-feature.
 */
export interface SyncResult {
  /** Tickets created during this sync */
  created: ExternalTicket[];
  /** External IDs of tickets that were updated */
  updated: string[];
  /** Assignment changes detected during pull */
  assignmentChanges: Array<{ feature: string; from: string | null; to: string | null }>;
  /** Per-feature errors (sync never throws) */
  errors: Array<{ featureOrId: string; error: Error }>;
}

/**
 * Configuration for external tracker sync.
 */
export interface TrackerSyncConfig {
  /** Adapter kind -- narrowed to GitHub-only for now */
  kind: 'github';
  /** Repository in "owner/repo" format (for GitHub) */
  repo?: string;
  /** Labels auto-applied to created tickets for filtering + identification */
  labels?: string[];
  /** Maps roadmap status -> external status string */
  statusMap: Record<FeatureStatus, string>;
  /**
   * Maps external status (+ optional label) -> roadmap status.
   * Compound keys like "open:in-progress" express state + label.
   */
  reverseStatusMap: Record<string, FeatureStatus>;
}
```

2. Add re-export to `packages/types/src/index.ts`. Locate the line `// --- Usage & Cost Tracking Types ---` and insert before it:

```typescript
// --- Tracker Sync Types ---
export type {
  ExternalTicket,
  ExternalTicketState,
  SyncResult,
  TrackerSyncConfig,
} from './tracker-sync';
```

3. Run: `cd packages/core && npx vitest run tests/roadmap/ --reporter=verbose` (verify existing tests still pass)
4. Run: `npx harness validate`
5. Commit: `feat(types): add tracker sync types for external service integration`

---

### Task 2: Define TrackerSyncAdapter interface

**Depends on:** Task 1
**Files:** `packages/core/src/roadmap/tracker-sync.ts`

1. Create `packages/core/src/roadmap/tracker-sync.ts`:

```typescript
import type {
  RoadmapFeature,
  Result,
  ExternalTicket,
  ExternalTicketState,
  TrackerSyncConfig,
} from '@harness-engineering/types';

/**
 * Abstract interface for syncing roadmap features with an external tracker.
 * Each adapter (GitHub, Jira, Linear) implements this interface.
 */
export interface TrackerSyncAdapter {
  /** Push a new roadmap item to the external service */
  createTicket(feature: RoadmapFeature, milestone: string): Promise<Result<ExternalTicket>>;

  /** Update planning fields on an existing ticket */
  updateTicket(
    externalId: string,
    changes: Partial<RoadmapFeature>
  ): Promise<Result<ExternalTicket>>;

  /** Pull current assignment + status from external service */
  fetchTicketState(externalId: string): Promise<Result<ExternalTicketState>>;

  /** Fetch all tickets matching the configured labels (paginated) */
  fetchAllTickets(): Promise<Result<ExternalTicketState[]>>;

  /** Assign a ticket to a person */
  assignTicket(externalId: string, assignee: string): Promise<Result<void>>;
}

/**
 * Options for sync operations that pull from external.
 * Named ExternalSyncOptions to avoid collision with the existing SyncOptions in sync.ts.
 */
export interface ExternalSyncOptions {
  /** Allow status regressions (e.g., done -> in-progress). Default: false */
  forceSync?: boolean;
}
```

2. Run: `npx harness validate`
3. Commit: `feat(roadmap): define TrackerSyncAdapter interface`

---

### Task 3: Create TrackerSyncAdapter contract tests

**Depends on:** Task 2
**Files:** `packages/core/tests/roadmap/tracker-sync.test.ts`

1. Create `packages/core/tests/roadmap/tracker-sync.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { TrackerSyncAdapter, ExternalSyncOptions } from '../../src/roadmap/tracker-sync';
import type {
  ExternalTicket,
  ExternalTicketState,
  TrackerSyncConfig,
  RoadmapFeature,
  Result,
} from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';

/** Minimal mock adapter for contract verification */
function createMockAdapter(overrides?: Partial<TrackerSyncAdapter>): TrackerSyncAdapter {
  return {
    createTicket: async () =>
      Ok({ externalId: 'github:test/repo#1', url: 'https://github.com/test/repo/issues/1' }),
    updateTicket: async () =>
      Ok({ externalId: 'github:test/repo#1', url: 'https://github.com/test/repo/issues/1' }),
    fetchTicketState: async () =>
      Ok({ externalId: 'github:test/repo#1', status: 'open', labels: [], assignee: null }),
    fetchAllTickets: async () => Ok([]),
    assignTicket: async () => Ok(undefined),
    ...overrides,
  };
}

describe('TrackerSyncAdapter interface contract', () => {
  it('createTicket returns Result<ExternalTicket> with externalId and url', async () => {
    const adapter = createMockAdapter();
    const feature: RoadmapFeature = {
      name: 'Test Feature',
      status: 'planned',
      spec: null,
      plans: [],
      blockedBy: [],
      summary: 'A test feature',
      assignee: null,
      priority: null,
      externalId: null,
    };
    const result = await adapter.createTicket(feature, 'MVP');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.externalId).toBe('github:test/repo#1');
    expect(result.value.url).toMatch(/^https:\/\//);
  });

  it('updateTicket returns Result<ExternalTicket>', async () => {
    const adapter = createMockAdapter();
    const result = await adapter.updateTicket('github:test/repo#1', { summary: 'Updated' });
    expect(result.ok).toBe(true);
  });

  it('fetchTicketState returns Result<ExternalTicketState>', async () => {
    const adapter = createMockAdapter();
    const result = await adapter.fetchTicketState('github:test/repo#1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveProperty('externalId');
    expect(result.value).toHaveProperty('status');
    expect(result.value).toHaveProperty('labels');
    expect(result.value).toHaveProperty('assignee');
  });

  it('fetchAllTickets returns Result<ExternalTicketState[]>', async () => {
    const adapter = createMockAdapter();
    const result = await adapter.fetchAllTickets();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.value)).toBe(true);
  });

  it('assignTicket returns Result<void>', async () => {
    const adapter = createMockAdapter();
    const result = await adapter.assignTicket('github:test/repo#1', '@cwarner');
    expect(result.ok).toBe(true);
  });

  it('ExternalSyncOptions defaults forceSync to undefined', () => {
    const opts: ExternalSyncOptions = {};
    expect(opts.forceSync).toBeUndefined();
  });

  it('ExternalSyncOptions accepts forceSync: true', () => {
    const opts: ExternalSyncOptions = { forceSync: true };
    expect(opts.forceSync).toBe(true);
  });
});

describe('TrackerSyncConfig shape', () => {
  it('accepts a valid GitHub config', () => {
    const config: TrackerSyncConfig = {
      kind: 'github',
      repo: 'owner/repo',
      labels: ['harness-managed'],
      statusMap: {
        backlog: 'open',
        planned: 'open',
        'in-progress': 'open',
        done: 'closed',
        blocked: 'open',
      },
      reverseStatusMap: {
        closed: 'done',
        'open:in-progress': 'in-progress',
        'open:blocked': 'blocked',
        'open:planned': 'planned',
      },
    };
    expect(config.kind).toBe('github');
    expect(config.statusMap['done']).toBe('closed');
    expect(config.reverseStatusMap['open:in-progress']).toBe('in-progress');
  });
});
```

2. Run: `cd packages/core && npx vitest run tests/roadmap/tracker-sync.test.ts`
3. Observe: all 9 tests pass
4. Run: `npx harness validate`
5. Commit: `test(roadmap): add TrackerSyncAdapter contract and config shape tests`

---

### Task 4: Implement GitHubIssuesSyncAdapter

**Depends on:** Task 2
**Files:** `packages/core/src/roadmap/adapters/github-issues.ts`

This adapter uses raw `fetch()` against the GitHub REST API (no `@octokit/rest` dependency needed -- Node 18+ has native fetch). It parses the `"github:owner/repo#N"` external ID format.

1. Create directory: `mkdir -p packages/core/src/roadmap/adapters`

2. Create `packages/core/src/roadmap/adapters/github-issues.ts`:

```typescript
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

/**
 * Resolve an external ticket's status + labels to a roadmap FeatureStatus
 * using the reverseStatusMap config. Returns null if ambiguous or unmapped.
 */
export function resolveReverseStatus(
  externalStatus: string,
  labels: string[],
  config: TrackerSyncConfig
): string | null {
  // Direct match first (e.g., "closed" -> "done")
  if (config.reverseStatusMap[externalStatus]) {
    return config.reverseStatusMap[externalStatus]!;
  }

  // Compound key match: "open:label"
  const statusLabels = ['in-progress', 'blocked', 'planned'];
  const matchingLabels = labels.filter((l) => statusLabels.includes(l));

  if (matchingLabels.length === 1) {
    const compoundKey = `${externalStatus}:${matchingLabels[0]}`;
    if (config.reverseStatusMap[compoundKey]) {
      return config.reverseStatusMap[compoundKey]!;
    }
  }

  // Ambiguous (multiple status labels) or no match -> null (preserve current)
  return null;
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
```

3. Run: `npx harness validate`
4. Commit: `feat(roadmap): implement GitHubIssuesSyncAdapter`

---

### Task 5: Write GitHub adapter tests with mocked fetch

**Depends on:** Task 4
**Files:** `packages/core/tests/roadmap/github-issues.test.ts`

1. Create `packages/core/tests/roadmap/github-issues.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import {
  GitHubIssuesSyncAdapter,
  parseExternalId,
  resolveReverseStatus,
} from '../../src/roadmap/adapters/github-issues';
import type { TrackerSyncConfig, RoadmapFeature } from '@harness-engineering/types';

const DEFAULT_CONFIG: TrackerSyncConfig = {
  kind: 'github',
  repo: 'owner/repo',
  labels: ['harness-managed'],
  statusMap: {
    backlog: 'open',
    planned: 'open',
    'in-progress': 'open',
    done: 'closed',
    blocked: 'open',
  },
  reverseStatusMap: {
    closed: 'done',
    'open:in-progress': 'in-progress',
    'open:blocked': 'blocked',
    'open:planned': 'planned',
  },
};

function mockFetch(status: number, body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  });
}

function makeFeature(overrides?: Partial<RoadmapFeature>): RoadmapFeature {
  return {
    name: 'Test Feature',
    status: 'planned',
    spec: 'docs/changes/test/proposal.md',
    plans: [],
    blockedBy: [],
    summary: 'A test feature',
    assignee: null,
    priority: null,
    externalId: null,
    ...overrides,
  };
}

describe('parseExternalId()', () => {
  it('parses valid github external ID', () => {
    const result = parseExternalId('github:owner/repo#42');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', number: 42 });
  });

  it('returns null for invalid format', () => {
    expect(parseExternalId('jira:PROJ-123')).toBeNull();
    expect(parseExternalId('github:nohash')).toBeNull();
    expect(parseExternalId('')).toBeNull();
  });
});

describe('resolveReverseStatus()', () => {
  it('maps "closed" to "done"', () => {
    expect(resolveReverseStatus('closed', [], DEFAULT_CONFIG)).toBe('done');
  });

  it('maps "open" + "in-progress" label to "in-progress"', () => {
    expect(resolveReverseStatus('open', ['harness-managed', 'in-progress'], DEFAULT_CONFIG)).toBe(
      'in-progress'
    );
  });

  it('maps "open" + "blocked" label to "blocked"', () => {
    expect(resolveReverseStatus('open', ['harness-managed', 'blocked'], DEFAULT_CONFIG)).toBe(
      'blocked'
    );
  });

  it('returns null for ambiguous (multiple status labels)', () => {
    expect(resolveReverseStatus('open', ['in-progress', 'blocked'], DEFAULT_CONFIG)).toBeNull();
  });

  it('returns null for no status label on open', () => {
    expect(resolveReverseStatus('open', ['harness-managed'], DEFAULT_CONFIG)).toBeNull();
  });
});

describe('GitHubIssuesSyncAdapter', () => {
  it('throws on invalid repo format', () => {
    expect(
      () =>
        new GitHubIssuesSyncAdapter({
          token: 'test-token',
          config: { ...DEFAULT_CONFIG, repo: 'invalid' },
        })
    ).toThrow(/Invalid repo format/);
  });

  describe('createTicket', () => {
    it('creates an issue and returns externalId', async () => {
      const fetchFn = mockFetch(201, {
        number: 42,
        html_url: 'https://github.com/owner/repo/issues/42',
      });
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
      });

      const result = await adapter.createTicket(makeFeature(), 'MVP');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.externalId).toBe('github:owner/repo#42');
      expect(result.value.url).toBe('https://github.com/owner/repo/issues/42');

      expect(fetchFn).toHaveBeenCalledOnce();
      const [url, opts] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(url).toBe('https://api.github.com/repos/owner/repo/issues');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string);
      expect(body.title).toBe('Test Feature');
      expect(body.labels).toContain('harness-managed');
      expect(body.labels).toContain('planned');
    });

    it('returns Err on API failure', async () => {
      const fetchFn = mockFetch(403, { message: 'Forbidden' });
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
      });

      const result = await adapter.createTicket(makeFeature(), 'MVP');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/403/);
    });
  });

  describe('updateTicket', () => {
    it('patches an existing issue', async () => {
      const fetchFn = mockFetch(200, { html_url: 'https://github.com/owner/repo/issues/42' });
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
      });

      const result = await adapter.updateTicket('github:owner/repo#42', {
        summary: 'Updated summary',
      });
      expect(result.ok).toBe(true);

      const [url, opts] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(url).toBe('https://api.github.com/repos/owner/repo/issues/42');
      expect(opts.method).toBe('PATCH');
    });

    it('returns Err for invalid externalId', async () => {
      const fetchFn = mockFetch(200, {});
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
      });

      const result = await adapter.updateTicket('invalid', { summary: 'x' });
      expect(result.ok).toBe(false);
    });
  });

  describe('fetchTicketState', () => {
    it('returns ticket state with assignee', async () => {
      const fetchFn = mockFetch(200, {
        state: 'open',
        labels: [{ name: 'harness-managed' }, { name: 'in-progress' }],
        assignee: { login: 'cwarner' },
      });
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
      });

      const result = await adapter.fetchTicketState('github:owner/repo#42');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.status).toBe('open');
      expect(result.value.assignee).toBe('@cwarner');
      expect(result.value.labels).toContain('in-progress');
    });

    it('returns null assignee when unassigned', async () => {
      const fetchFn = mockFetch(200, {
        state: 'closed',
        labels: [],
        assignee: null,
      });
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
      });

      const result = await adapter.fetchTicketState('github:owner/repo#42');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.assignee).toBeNull();
    });
  });

  describe('fetchAllTickets', () => {
    it('returns all issues, filtering out pull requests', async () => {
      const fetchFn = mockFetch(200, [
        { number: 1, state: 'open', labels: [{ name: 'harness-managed' }], assignee: null },
        { number: 2, state: 'closed', labels: [], assignee: { login: 'x' }, pull_request: {} },
        { number: 3, state: 'closed', labels: [], assignee: null },
      ]);
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
      });

      const result = await adapter.fetchAllTickets();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2); // PR filtered out
      expect(result.value[0]!.externalId).toBe('github:owner/repo#1');
      expect(result.value[1]!.externalId).toBe('github:owner/repo#3');
    });
  });

  describe('assignTicket', () => {
    it('assigns user (stripping @ prefix)', async () => {
      const fetchFn = mockFetch(201, {});
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
      });

      const result = await adapter.assignTicket('github:owner/repo#42', '@cwarner');
      expect(result.ok).toBe(true);

      const [, opts] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const body = JSON.parse(opts.body as string);
      expect(body.assignees).toEqual(['cwarner']);
    });
  });
});
```

2. Run: `cd packages/core && npx vitest run tests/roadmap/github-issues.test.ts`
3. Observe: all tests pass (approximately 14 tests)
4. Run: `npx harness validate`
5. Commit: `test(roadmap): add GitHubIssuesSyncAdapter tests with mocked fetch`

---

### Task 6: Implement sync engine (syncToExternal, syncFromExternal, fullSync)

**Depends on:** Task 2
**Files:** `packages/core/src/roadmap/sync-engine.ts`

1. Create `packages/core/src/roadmap/sync-engine.ts`:

```typescript
import * as fs from 'fs';
import type {
  Roadmap,
  RoadmapFeature,
  FeatureStatus,
  SyncResult,
  ExternalTicket,
  TrackerSyncConfig,
} from '@harness-engineering/types';
import { parseRoadmap } from './parse';
import { serializeRoadmap } from './serialize';
import type { TrackerSyncAdapter, ExternalSyncOptions } from './tracker-sync';
import { resolveReverseStatus } from './adapters/github-issues';

/**
 * Status rank for directional protection.
 * Mirrors the ranking in sync.ts. Sync may only advance status forward
 * (higher rank) unless forceSync is set.
 */
const STATUS_RANK: Record<FeatureStatus, number> = {
  backlog: 0,
  planned: 1,
  blocked: 1,
  'in-progress': 2,
  done: 3,
};

function isRegression(from: FeatureStatus, to: FeatureStatus): boolean {
  return STATUS_RANK[to] < STATUS_RANK[from];
}

function emptySyncResult(): SyncResult {
  return { created: [], updated: [], assignmentChanges: [], errors: [] };
}

/**
 * Push planning fields from roadmap to external service.
 * - Features without externalId get a new ticket (externalId stored on feature object)
 * - Features with externalId get updated with current planning fields
 * Mutates `roadmap` in-place (stores new externalIds).
 * Never throws -- errors collected per-feature.
 */
export async function syncToExternal(
  roadmap: Roadmap,
  adapter: TrackerSyncAdapter,
  _config: TrackerSyncConfig
): Promise<SyncResult> {
  const result = emptySyncResult();

  for (const milestone of roadmap.milestones) {
    for (const feature of milestone.features) {
      if (!feature.externalId) {
        // Create new ticket
        const createResult = await adapter.createTicket(feature, milestone.name);
        if (createResult.ok) {
          feature.externalId = createResult.value.externalId;
          result.created.push(createResult.value);
        } else {
          result.errors.push({ featureOrId: feature.name, error: createResult.error });
        }
      } else {
        // Update existing ticket
        const updateResult = await adapter.updateTicket(feature.externalId, feature);
        if (updateResult.ok) {
          result.updated.push(feature.externalId);
        } else {
          result.errors.push({ featureOrId: feature.externalId, error: updateResult.error });
        }
      }
    }
  }

  return result;
}

/**
 * Pull execution fields (assignee, status) from external service.
 * - External assignee wins over local assignee
 * - Status changes are subject to directional guard (no regression unless forceSync)
 * - Uses label-based reverse mapping for GitHub status disambiguation
 * Mutates `roadmap` in-place.
 * Never throws -- errors collected per-feature.
 */
export async function syncFromExternal(
  roadmap: Roadmap,
  adapter: TrackerSyncAdapter,
  config: TrackerSyncConfig,
  options?: ExternalSyncOptions
): Promise<SyncResult> {
  const result = emptySyncResult();
  const forceSync = options?.forceSync ?? false;

  // Build lookup from externalId to feature
  const featureByExternalId = new Map<string, RoadmapFeature>();
  for (const milestone of roadmap.milestones) {
    for (const feature of milestone.features) {
      if (feature.externalId) {
        featureByExternalId.set(feature.externalId, feature);
      }
    }
  }

  if (featureByExternalId.size === 0) return result;

  // Fetch all tickets
  const fetchResult = await adapter.fetchAllTickets();
  if (!fetchResult.ok) {
    result.errors.push({ featureOrId: '*', error: fetchResult.error });
    return result;
  }

  for (const ticketState of fetchResult.value) {
    const feature = featureByExternalId.get(ticketState.externalId);
    if (!feature) continue;

    // Assignee: external wins
    if (ticketState.assignee !== feature.assignee) {
      result.assignmentChanges.push({
        feature: feature.name,
        from: feature.assignee,
        to: ticketState.assignee,
      });
      feature.assignee = ticketState.assignee;
    }

    // Status: use reverse mapping with label disambiguation
    const resolvedStatus = resolveReverseStatus(ticketState.status, ticketState.labels, config);
    if (resolvedStatus && resolvedStatus !== feature.status) {
      const newStatus = resolvedStatus as FeatureStatus;
      if (!forceSync && isRegression(feature.status, newStatus)) {
        // Directional guard: skip regression
        continue;
      }
      feature.status = newStatus;
    }
  }

  return result;
}

/**
 * In-process mutex for serializing fullSync calls.
 * Prevents concurrent writes to roadmap.md.
 */
let syncMutex: Promise<void> = Promise.resolve();

/**
 * Full bidirectional sync: read roadmap, push, pull, write back.
 * Serialized by in-process mutex.
 */
export async function fullSync(
  roadmapPath: string,
  adapter: TrackerSyncAdapter,
  config: TrackerSyncConfig,
  options?: ExternalSyncOptions
): Promise<SyncResult> {
  // Queue behind any in-progress sync
  const previousSync = syncMutex;
  let releaseMutex: () => void;
  syncMutex = new Promise<void>((resolve) => {
    releaseMutex = resolve;
  });

  await previousSync;

  try {
    const raw = fs.readFileSync(roadmapPath, 'utf-8');
    const parseResult = parseRoadmap(raw);
    if (!parseResult.ok) {
      return {
        ...emptySyncResult(),
        errors: [{ featureOrId: '*', error: parseResult.error }],
      };
    }

    const roadmap = parseResult.value;

    // Push first (planning fields out)
    const pushResult = await syncToExternal(roadmap, adapter, config);

    // Then pull (execution fields back)
    const pullResult = await syncFromExternal(roadmap, adapter, config, options);

    // Write updated roadmap back to disk
    fs.writeFileSync(roadmapPath, serializeRoadmap(roadmap), 'utf-8');

    // Merge results
    return {
      created: pushResult.created,
      updated: pushResult.updated,
      assignmentChanges: pullResult.assignmentChanges,
      errors: [...pushResult.errors, ...pullResult.errors],
    };
  } finally {
    releaseMutex!();
  }
}

/**
 * Reset the sync mutex. Only for testing.
 */
export function _resetSyncMutex(): void {
  syncMutex = Promise.resolve();
}
```

2. Run: `npx harness validate`
3. Commit: `feat(roadmap): implement sync engine with syncToExternal, syncFromExternal, fullSync`

---

### Task 7: Write sync engine tests

**Depends on:** Task 6, Task 3 (for mock adapter pattern)
**Files:** `packages/core/tests/roadmap/sync-engine.test.ts`

1. Create `packages/core/tests/roadmap/sync-engine.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  syncToExternal,
  syncFromExternal,
  fullSync,
  _resetSyncMutex,
} from '../../src/roadmap/sync-engine';
import type { TrackerSyncAdapter, ExternalSyncOptions } from '../../src/roadmap/tracker-sync';
import type {
  Roadmap,
  RoadmapFeature,
  ExternalTicketState,
  TrackerSyncConfig,
} from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import { serializeRoadmap } from '../../src/roadmap/serialize';

const CONFIG: TrackerSyncConfig = {
  kind: 'github',
  repo: 'owner/repo',
  labels: ['harness-managed'],
  statusMap: {
    backlog: 'open',
    planned: 'open',
    'in-progress': 'open',
    done: 'closed',
    blocked: 'open',
  },
  reverseStatusMap: {
    closed: 'done',
    'open:in-progress': 'in-progress',
    'open:blocked': 'blocked',
    'open:planned': 'planned',
  },
};

function makeFeature(overrides?: Partial<RoadmapFeature>): RoadmapFeature {
  return {
    name: 'Test Feature',
    status: 'planned',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: 'A test feature',
    assignee: null,
    priority: null,
    externalId: null,
    ...overrides,
  };
}

function makeRoadmap(features: RoadmapFeature[]): Roadmap {
  return {
    frontmatter: {
      project: 'test',
      version: 1,
      lastSynced: '2026-04-01T00:00:00Z',
      lastManualEdit: '2026-04-01T00:00:00Z',
    },
    milestones: [{ name: 'M1', isBacklog: false, features }],
    assignmentHistory: [],
  };
}

function mockAdapter(overrides?: Partial<TrackerSyncAdapter>): TrackerSyncAdapter {
  let counter = 0;
  return {
    createTicket: vi.fn(async () => {
      counter++;
      return Ok({
        externalId: `github:owner/repo#${counter}`,
        url: `https://github.com/owner/repo/issues/${counter}`,
      });
    }),
    updateTicket: vi.fn(async (_id: string) =>
      Ok({ externalId: _id, url: `https://github.com/owner/repo/issues/1` })
    ),
    fetchTicketState: vi.fn(async () =>
      Ok({ externalId: '', status: 'open', labels: [], assignee: null })
    ),
    fetchAllTickets: vi.fn(async () => Ok([])),
    assignTicket: vi.fn(async () => Ok(undefined)),
    ...overrides,
  };
}

describe('syncToExternal()', () => {
  it('creates tickets for features without externalId', async () => {
    const feature = makeFeature();
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter();

    const result = await syncToExternal(roadmap, adapter, CONFIG);

    expect(result.created).toHaveLength(1);
    expect(result.created[0]!.externalId).toBe('github:owner/repo#1');
    expect(feature.externalId).toBe('github:owner/repo#1'); // mutated in-place
    expect(adapter.createTicket).toHaveBeenCalledOnce();
  });

  it('updates tickets for features with externalId', async () => {
    const feature = makeFeature({ externalId: 'github:owner/repo#42' });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter();

    const result = await syncToExternal(roadmap, adapter, CONFIG);

    expect(result.updated).toEqual(['github:owner/repo#42']);
    expect(result.created).toHaveLength(0);
    expect(adapter.updateTicket).toHaveBeenCalledOnce();
  });

  it('collects errors per-feature without throwing', async () => {
    const feature = makeFeature();
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      createTicket: vi.fn(async () => Err(new Error('API down'))),
    });

    const result = await syncToExternal(roadmap, adapter, CONFIG);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.featureOrId).toBe('Test Feature');
    expect(result.errors[0]!.error.message).toBe('API down');
    expect(result.created).toHaveLength(0);
  });

  it('handles mix of new and existing features', async () => {
    const newFeature = makeFeature({ name: 'New' });
    const existingFeature = makeFeature({ name: 'Existing', externalId: 'github:owner/repo#10' });
    const roadmap = makeRoadmap([newFeature, existingFeature]);
    const adapter = mockAdapter();

    const result = await syncToExternal(roadmap, adapter, CONFIG);

    expect(result.created).toHaveLength(1);
    expect(result.updated).toHaveLength(1);
  });
});

describe('syncFromExternal()', () => {
  it('updates assignee when external differs from local', async () => {
    const feature = makeFeature({ externalId: 'github:owner/repo#1', assignee: null });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          {
            externalId: 'github:owner/repo#1',
            status: 'open',
            labels: ['planned'],
            assignee: '@cwarner',
          },
        ])
      ),
    });

    const result = await syncFromExternal(roadmap, adapter, CONFIG);

    expect(feature.assignee).toBe('@cwarner');
    expect(result.assignmentChanges).toHaveLength(1);
    expect(result.assignmentChanges[0]).toEqual({
      feature: 'Test Feature',
      from: null,
      to: '@cwarner',
    });
  });

  it('does not regress status without forceSync', async () => {
    const feature = makeFeature({ externalId: 'github:owner/repo#1', status: 'done' });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          {
            externalId: 'github:owner/repo#1',
            status: 'open',
            labels: ['in-progress'],
            assignee: null,
          },
        ])
      ),
    });

    await syncFromExternal(roadmap, adapter, CONFIG);

    expect(feature.status).toBe('done'); // unchanged
  });

  it('allows status regression with forceSync: true', async () => {
    const feature = makeFeature({ externalId: 'github:owner/repo#1', status: 'done' });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          {
            externalId: 'github:owner/repo#1',
            status: 'open',
            labels: ['in-progress'],
            assignee: null,
          },
        ])
      ),
    });

    await syncFromExternal(roadmap, adapter, CONFIG, { forceSync: true });

    expect(feature.status).toBe('in-progress');
  });

  it('preserves status when reverse mapping is ambiguous', async () => {
    const feature = makeFeature({ externalId: 'github:owner/repo#1', status: 'planned' });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([
          {
            externalId: 'github:owner/repo#1',
            status: 'open',
            labels: ['in-progress', 'blocked'], // ambiguous
            assignee: null,
          },
        ])
      ),
    });

    await syncFromExternal(roadmap, adapter, CONFIG);

    expect(feature.status).toBe('planned'); // preserved
  });

  it('skips features without externalId', async () => {
    const feature = makeFeature({ externalId: null });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter();

    const result = await syncFromExternal(roadmap, adapter, CONFIG);

    expect(result.assignmentChanges).toHaveLength(0);
    // fetchAllTickets should not even be called when no features have externalIds
    expect(adapter.fetchAllTickets).not.toHaveBeenCalled();
  });

  it('collects errors when fetchAllTickets fails', async () => {
    const feature = makeFeature({ externalId: 'github:owner/repo#1' });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () => Err(new Error('Network failure'))),
    });

    const result = await syncFromExternal(roadmap, adapter, CONFIG);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.error.message).toBe('Network failure');
  });

  it('advances status forward (planned -> done via closed)', async () => {
    const feature = makeFeature({ externalId: 'github:owner/repo#1', status: 'planned' });
    const roadmap = makeRoadmap([feature]);
    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () =>
        Ok([{ externalId: 'github:owner/repo#1', status: 'closed', labels: [], assignee: null }])
      ),
    });

    await syncFromExternal(roadmap, adapter, CONFIG);

    expect(feature.status).toBe('done');
  });
});

describe('fullSync()', () => {
  let tmpDir: string;
  let roadmapPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fullsync-'));
    roadmapPath = path.join(tmpDir, 'roadmap.md');
    _resetSyncMutex();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeRoadmap(roadmap: Roadmap): void {
    fs.writeFileSync(roadmapPath, serializeRoadmap(roadmap), 'utf-8');
  }

  it('reads roadmap, pushes, pulls, writes back', async () => {
    const roadmap = makeRoadmap([makeFeature({ name: 'My Feature' })]);
    writeRoadmap(roadmap);

    const adapter = mockAdapter({
      fetchAllTickets: vi.fn(async () => Ok([])),
    });

    const result = await fullSync(roadmapPath, adapter, CONFIG);

    expect(result.created).toHaveLength(1); // feature had no externalId
    expect(result.errors).toHaveLength(0);

    // Verify file was written back with externalId
    const updatedRaw = fs.readFileSync(roadmapPath, 'utf-8');
    expect(updatedRaw).toContain('github:owner/repo#1');
  });

  it('serializes concurrent calls via mutex', async () => {
    const roadmap = makeRoadmap([makeFeature({ name: 'Concurrent' })]);
    writeRoadmap(roadmap);

    const callOrder: number[] = [];
    let counter = 0;

    const adapter = mockAdapter({
      createTicket: vi.fn(async () => {
        counter++;
        const myNum = counter;
        callOrder.push(myNum);
        // Simulate delay
        await new Promise((r) => setTimeout(r, 10));
        return Ok({
          externalId: `github:owner/repo#${myNum}`,
          url: `https://github.com/owner/repo/issues/${myNum}`,
        });
      }),
      fetchAllTickets: vi.fn(async () => Ok([])),
    });

    // Fire two syncs concurrently
    const [r1, r2] = await Promise.all([
      fullSync(roadmapPath, adapter, CONFIG),
      fullSync(roadmapPath, adapter, CONFIG),
    ]);

    // Both should complete without error
    expect(r1.errors).toHaveLength(0);
    expect(r2.errors).toHaveLength(0);

    // The second sync should see the externalId written by the first,
    // so it should update rather than create
    const totalCreated = r1.created.length + r2.created.length;
    const totalUpdated = r1.updated.length + r2.updated.length;
    expect(totalCreated + totalUpdated).toBeGreaterThanOrEqual(2);
  });

  it('returns error result for invalid roadmap file', async () => {
    fs.writeFileSync(roadmapPath, 'not a valid roadmap', 'utf-8');
    const adapter = mockAdapter();

    const result = await fullSync(roadmapPath, adapter, CONFIG);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.featureOrId).toBe('*');
  });
});
```

2. Run: `cd packages/core && npx vitest run tests/roadmap/sync-engine.test.ts`
3. Observe: all tests pass (approximately 14 tests)
4. Run: `npx harness validate`
5. Commit: `test(roadmap): add sync engine tests with mock adapter and filesystem`

---

### Task 8: Wire exports and verify full test suite

**Depends on:** Tasks 1-7
**Files:** `packages/core/src/roadmap/index.ts`

[checkpoint:human-verify] -- Verify all previous tasks completed before wiring exports.

1. Update `packages/core/src/roadmap/index.ts` to export the new modules. Replace entire file content:

```typescript
/**
 * Parses a roadmap from its string representation (Markdown or JSON).
 */
export { parseRoadmap } from './parse';

/**
 * Serializes a roadmap object back to its string representation.
 */
export { serializeRoadmap } from './serialize';

/**
 * Synchronizes the project roadmap with the current state of the codebase and issues.
 */
export { syncRoadmap, applySyncChanges } from './sync';

/**
 * Type definitions for roadmap synchronization and changes.
 */
export type { SyncChange, SyncOptions } from './sync';

/**
 * Tracker sync adapter interface for external service integration.
 */
export type { TrackerSyncAdapter, ExternalSyncOptions } from './tracker-sync';

/**
 * GitHub Issues sync adapter implementation.
 */
export {
  GitHubIssuesSyncAdapter,
  parseExternalId,
  resolveReverseStatus,
} from './adapters/github-issues';
export type { GitHubAdapterOptions } from './adapters/github-issues';

/**
 * Sync engine for bidirectional roadmap <-> external tracker sync.
 */
export { syncToExternal, syncFromExternal, fullSync } from './sync-engine';
```

2. Run: `cd packages/core && npx vitest run tests/roadmap/` (all roadmap tests)
3. Run: `cd packages/core && npx vitest run` (full core test suite)
4. Run: `npx harness validate`
5. Run: `npx harness check-deps`
6. Commit: `feat(roadmap): wire tracker sync exports and verify full test suite`

## Dependency Graph

```
Task 1 (types) ──┬──> Task 2 (interface) ──┬──> Task 3 (interface tests)
                  │                         │
                  │                         ├──> Task 4 (adapter) ──> Task 5 (adapter tests)
                  │                         │
                  │                         └──> Task 6 (engine) ──> Task 7 (engine tests)
                  │                                                         │
                  └─────────────────────────────────────────────────────────┴──> Task 8 (wire + verify)
```

Tasks 3, 4, and 6 can be parallelized after Task 2 completes.
Tasks 5 and 7 can be parallelized after their respective dependencies.
Task 8 requires all others.

## Learnings from Phase 1

- The `check-arch` pre-commit hook enforces module-size and complexity baselines. Every task that modifies source files requires running `npx harness check-arch --update-baseline` before committing.
- Round-trip fidelity tests pass on first try when fixture markdown lines start at column 0 (no template literal indentation).
- Extended fields are conditionally emitted in serialization -- only when at least one is non-null.
