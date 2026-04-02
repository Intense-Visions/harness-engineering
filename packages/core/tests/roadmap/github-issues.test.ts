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
