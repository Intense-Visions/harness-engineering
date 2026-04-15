import { describe, it, expect, vi } from 'vitest';
import { GitHubIssuesSyncAdapter, parseExternalId } from '../../src/roadmap/adapters/github-issues';
import { resolveReverseStatus } from '../../src/roadmap/tracker-sync';
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

function mockResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function mockFetch(status: number, body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue(mockResponse(status, body));
}

/** Returns a fetch mock that responds differently per call in sequence. */
function mockFetchSequence(...responses: Array<{ status: number; body: unknown }>): typeof fetch {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce(mockResponse(r.status, r.body));
  }
  return fn as unknown as typeof fetch;
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
    it('creates an issue with milestone and feature label', async () => {
      const fetchFn = mockFetchSequence(
        // 1. loadMilestones GET — return empty array (no existing milestones)
        { status: 200, body: [] },
        // 2. ensureMilestone POST — create "MVP" milestone
        { status: 201, body: { number: 1 } },
        // 3. createTicket POST — create the issue
        { status: 201, body: { number: 42, html_url: 'https://github.com/owner/repo/issues/42' } }
      );
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

      expect(fetchFn).toHaveBeenCalledTimes(3);
      // Check the issue creation call (3rd call)
      const [url, opts] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[2]!;
      expect(url).toBe('https://api.github.com/repos/owner/repo/issues');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string);
      expect(body.title).toBe('Test Feature');
      expect(body.labels).toContain('harness-managed');
      expect(body.labels).toContain('planned');
      expect(body.labels).toContain('feature');
      expect(body.milestone).toBe(1);
    });

    it('reuses cached milestone on second create', async () => {
      const fetchFn = mockFetchSequence(
        // 1. loadMilestones GET — return existing "MVP" milestone
        { status: 200, body: [{ number: 5, title: 'MVP' }] },
        // 2. createTicket POST (no ensureMilestone needed — cached)
        { status: 201, body: { number: 43, html_url: 'https://github.com/owner/repo/issues/43' } }
      );
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
      });

      const result = await adapter.createTicket(makeFeature(), 'MVP');
      expect(result.ok).toBe(true);
      expect(fetchFn).toHaveBeenCalledTimes(2);
      const body = JSON.parse((fetchFn as ReturnType<typeof vi.fn>).mock.calls[1]![1].body);
      expect(body.milestone).toBe(5);
    });

    it('returns Err on API failure', async () => {
      const fetchFn = mockFetchSequence(
        // loadMilestones
        { status: 200, body: [] },
        // ensureMilestone
        { status: 201, body: { number: 1 } },
        // createTicket — fails
        { status: 403, body: { message: 'Forbidden' } }
      );
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
        maxRetries: 0,
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
        title: 'Test Feature',
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
        title: 'Test Feature',
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
        {
          number: 1,
          title: 'Issue A',
          state: 'open',
          labels: [{ name: 'harness-managed' }],
          assignee: null,
        },
        {
          number: 2,
          title: 'PR B',
          state: 'closed',
          labels: [],
          assignee: { login: 'x' },
          pull_request: {},
        },
        { number: 3, title: 'Issue C', state: 'closed', labels: [], assignee: null },
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

  describe('getAuthenticatedUser', () => {
    it('returns @login from GET /user', async () => {
      const fetchFn = mockFetch(200, { login: 'cwarner' });
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
      });

      const result = await adapter.getAuthenticatedUser();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe('@cwarner');

      const [url] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(url).toBe('https://api.github.com/user');
    });

    it('caches result after first call', async () => {
      const fetchFn = mockFetch(200, { login: 'cwarner' });
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
      });

      await adapter.getAuthenticatedUser();
      await adapter.getAuthenticatedUser();
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('returns Err on API failure', async () => {
      const fetchFn = mockFetch(401, { message: 'Bad credentials' });
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'bad',
        config: DEFAULT_CONFIG,
        fetchFn,
        maxRetries: 0,
      });

      const result = await adapter.getAuthenticatedUser();
      expect(result.ok).toBe(false);
    });
  });

  describe('createTicket with assignee', () => {
    it('includes assignees in payload when feature has assignee', async () => {
      const fetchFn = mockFetchSequence(
        { status: 200, body: [{ number: 1, title: 'MVP' }] },
        { status: 201, body: { number: 10, html_url: 'https://github.com/owner/repo/issues/10' } }
      );
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
      });

      const result = await adapter.createTicket(makeFeature({ assignee: '@alice' }), 'MVP');
      expect(result.ok).toBe(true);

      const body = JSON.parse((fetchFn as ReturnType<typeof vi.fn>).mock.calls[1]![1].body);
      expect(body.assignees).toEqual(['alice']);
    });

    it('omits assignees when feature has no assignee', async () => {
      const fetchFn = mockFetchSequence(
        { status: 200, body: [{ number: 1, title: 'MVP' }] },
        { status: 201, body: { number: 11, html_url: 'https://github.com/owner/repo/issues/11' } }
      );
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
      });

      const result = await adapter.createTicket(makeFeature({ assignee: null }), 'MVP');
      expect(result.ok).toBe(true);

      const body = JSON.parse((fetchFn as ReturnType<typeof vi.fn>).mock.calls[1]![1].body);
      expect(body.assignees).toBeUndefined();
    });
  });

  describe('updateTicket with assignee', () => {
    it('includes assignees when assignee changes', async () => {
      const fetchFn = mockFetch(200, { html_url: 'https://github.com/owner/repo/issues/42' });
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
      });

      await adapter.updateTicket('github:owner/repo#42', { assignee: '@bob' });
      const body = JSON.parse((fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]![1].body);
      expect(body.assignees).toEqual(['bob']);
    });

    it('clears assignees when assignee set to null', async () => {
      const fetchFn = mockFetch(200, { html_url: 'https://github.com/owner/repo/issues/42' });
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
      });

      await adapter.updateTicket('github:owner/repo#42', { assignee: null });
      const body = JSON.parse((fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]![1].body);
      expect(body.assignees).toEqual([]);
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

  describe('addComment', () => {
    it('posts a comment to the issue', async () => {
      const fetchFn = mockFetch(201, {});
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
      });

      const result = await adapter.addComment('github:owner/repo#42', 'My comment body');
      expect(result.ok).toBe(true);

      const [url, opts] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(url).toBe('https://api.github.com/repos/owner/repo/issues/42/comments');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string);
      expect(body.body).toBe('My comment body');
    });

    it('returns Err for invalid externalId', async () => {
      const fetchFn = mockFetch(201, {});
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
      });

      const result = await adapter.addComment('invalid', 'My comment body');
      expect(result.ok).toBe(false);
    });

    it('returns Err on API failure', async () => {
      const fetchFn = mockFetch(403, { message: 'Forbidden' });
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
        maxRetries: 0,
      });

      const result = await adapter.addComment('github:owner/repo#42', 'My comment body');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/403/);
    });
  });

  describe('fetchComments', () => {
    it('returns Err with not-implemented message (Phase 1 stub)', async () => {
      const fetchFn = mockFetch(200, []);
      const adapter = new GitHubIssuesSyncAdapter({
        token: 'tok',
        config: DEFAULT_CONFIG,
        fetchFn,
      });

      const result = await adapter.fetchComments('github:owner/repo#42');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/not implemented/i);
    });
  });
});
