import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphStore } from '../../../src/store/GraphStore.js';
import { JiraConnector } from '../../../src/ingest/connectors/JiraConnector.js';
import type { ConnectorConfig } from '../../../src/ingest/connectors/ConnectorInterface.js';

const JIRA_SEARCH_FIXTURE = {
  issues: [
    {
      key: 'ENG-123',
      fields: {
        summary: 'Fix AuthService bug',
        description: 'Auth service throws on timeout',
        status: { name: 'Done' },
        priority: { name: 'High' },
        assignee: { displayName: 'John' },
        labels: ['backend'],
      },
    },
  ],
  total: 1,
};

const JIRA_COMMENTS_EMPTY = { comments: [] };

function makeMockHttpClient(searchResponse: unknown, commentsResponse?: unknown) {
  const comments = commentsResponse ?? JIRA_COMMENTS_EMPTY;
  return async (url: string, _options?: { headers?: Record<string, string> }) => ({
    ok: true as const,
    json: async () => (url.includes('/comment') ? comments : searchResponse),
  });
}

describe('JiraConnector', () => {
  let store: GraphStore;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    store = new GraphStore();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('creates issue nodes with correct metadata', async () => {
    process.env['JIRA_API_KEY'] = 'test-key';
    process.env['JIRA_BASE_URL'] = 'https://jira.example.com';

    const connector = new JiraConnector(makeMockHttpClient(JIRA_SEARCH_FIXTURE));
    const config: ConnectorConfig = { project: 'ENG' };

    const result = await connector.ingest(store, config);

    expect(result.nodesAdded).toBe(1);
    expect(result.errors).toHaveLength(0);

    const node = store.getNode('issue:jira:ENG-123');
    expect(node).not.toBeNull();
    expect(node!.name).toBe('Fix AuthService bug');
    expect(node!.type).toBe('issue');
    expect(node!.metadata.key).toBe('ENG-123');
    expect(node!.metadata.status).toBe('Done');
    expect(node!.metadata.priority).toBe('High');
    expect(node!.metadata.assignee).toBe('John');
    expect(node!.metadata.labels).toEqual(['backend']);
  });

  it('creates applies_to edges to matching code nodes', async () => {
    process.env['JIRA_API_KEY'] = 'test-key';
    process.env['JIRA_BASE_URL'] = 'https://jira.example.com';

    // Pre-populate store with code node
    store.addNode({
      id: 'class:AuthService',
      type: 'class',
      name: 'AuthService',
      metadata: {},
    });

    const connector = new JiraConnector(makeMockHttpClient(JIRA_SEARCH_FIXTURE));
    const result = await connector.ingest(store, {});

    expect(result.edgesAdded).toBeGreaterThanOrEqual(1);

    const edges = store.getEdges({
      from: 'issue:jira:ENG-123',
      to: 'class:AuthService',
      type: 'applies_to',
    });
    expect(edges).toHaveLength(1);
  });

  it('returns error when API key is missing, does not throw', async () => {
    delete process.env['JIRA_API_KEY'];

    const connector = new JiraConnector(makeMockHttpClient(JIRA_SEARCH_FIXTURE));
    const result = await connector.ingest(store, {});

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('JIRA_API_KEY');
    expect(result.nodesAdded).toBe(0);
  });

  it('returns error when base URL is missing, does not throw', async () => {
    process.env['JIRA_API_KEY'] = 'test-key';
    delete process.env['JIRA_BASE_URL'];

    const connector = new JiraConnector(makeMockHttpClient(JIRA_SEARCH_FIXTURE));
    const result = await connector.ingest(store, {});

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('JIRA_BASE_URL');
    expect(result.nodesAdded).toBe(0);
  });

  it('includes comment text in issue node content', async () => {
    process.env['JIRA_API_KEY'] = 'test-key';
    process.env['JIRA_BASE_URL'] = 'https://jira.example.com';

    const searchResponse = {
      issues: [
        {
          key: 'ENG-100',
          fields: {
            summary: 'Auth bug',
            description: 'Login fails on timeout',
            status: { name: 'Open' },
            priority: { name: 'High' },
            assignee: { displayName: 'Alice' },
            labels: [],
          },
        },
      ],
      total: 1,
    };

    const commentsResponse = {
      comments: [
        {
          author: { displayName: 'Bob' },
          body: 'Reproduced on staging',
          created: '2026-01-01T00:00:00Z',
        },
        {
          author: { displayName: 'Alice' },
          body: 'Fixed in PR #42',
          created: '2026-01-02T00:00:00Z',
        },
      ],
    };

    const httpClient = makeMockHttpClient(searchResponse, commentsResponse);
    const connector = new JiraConnector(httpClient);
    const result = await connector.ingest(store, { maxContentLength: 4000 });

    expect(result.nodesAdded).toBe(1);
    const node = store.getNode('issue:jira:ENG-100');
    expect(node!.content).toContain('Bob');
    expect(node!.content).toContain('Reproduced on staging');
    expect(node!.content).toContain('Alice');
    expect(node!.content).toContain('Fixed in PR #42');
    expect(node!.metadata.commentCount).toBe(2);
  });

  it('applies condenseContent with maxContentLength config', async () => {
    process.env['JIRA_API_KEY'] = 'test-key';
    process.env['JIRA_BASE_URL'] = 'https://jira.example.com';

    const longDescription = 'a'.repeat(5000);
    const searchResponse = {
      issues: [
        {
          key: 'ENG-200',
          fields: {
            summary: 'Long issue',
            description: longDescription,
            status: { name: 'Open' },
            priority: null,
            assignee: null,
            labels: [],
          },
        },
      ],
      total: 1,
    };

    const httpClient = makeMockHttpClient(searchResponse);
    const connector = new JiraConnector(httpClient);
    await connector.ingest(store, { maxContentLength: 500 });

    const node = store.getNode('issue:jira:ENG-200');
    expect(node!.content!.length).toBeLessThanOrEqual(501);
    expect(node!.metadata.condensed).toBeDefined();
    expect(node!.metadata.originalLength).toBeGreaterThan(500);
  });

  it('extracts acceptance criteria from description', async () => {
    process.env['JIRA_API_KEY'] = 'test-key';
    process.env['JIRA_BASE_URL'] = 'https://jira.example.com';

    const searchResponse = {
      issues: [
        {
          key: 'ENG-300',
          fields: {
            summary: 'Feature X',
            description:
              'Overview\n\nAcceptance Criteria:\n- [x] User can log in\n- [ ] Error shown on failure\n\nGiven a user When they submit Then form validates',
            status: { name: 'Open' },
            priority: null,
            assignee: null,
            labels: [],
          },
        },
      ],
      total: 1,
    };

    const httpClient = makeMockHttpClient(searchResponse);
    const connector = new JiraConnector(httpClient);
    await connector.ingest(store, {});

    const node = store.getNode('issue:jira:ENG-300');
    const ac = node!.metadata.acceptanceCriteria as string[];
    expect(ac).toEqual(
      expect.arrayContaining([
        expect.stringContaining('User can log in'),
        expect.stringContaining('Error shown on failure'),
        expect.stringContaining('Given a user When they submit Then form validates'),
      ])
    );
  });

  it('extracts non-null custom fields', async () => {
    process.env['JIRA_API_KEY'] = 'test-key';
    process.env['JIRA_BASE_URL'] = 'https://jira.example.com';

    const searchResponse = {
      issues: [
        {
          key: 'ENG-400',
          fields: {
            summary: 'Custom fields test',
            description: null,
            status: { name: 'Open' },
            priority: null,
            assignee: null,
            labels: [],
            customfield_10001: 'Sprint 5',
            customfield_10002: null,
            customfield_10003: 'Team Alpha',
          },
        },
      ],
      total: 1,
    };

    const httpClient = makeMockHttpClient(searchResponse);
    const connector = new JiraConnector(httpClient);
    await connector.ingest(store, {});

    const node = store.getNode('issue:jira:ENG-400');
    expect(node!.metadata.customFields).toEqual({
      customfield_10001: 'Sprint 5',
      customfield_10003: 'Team Alpha',
    });
  });
});
