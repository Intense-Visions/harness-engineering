import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphStore } from '../../../src/store/GraphStore.js';
import { JiraConnector } from '../../../src/ingest/connectors/JiraConnector.js';
import type { ConnectorConfig } from '../../../src/ingest/connectors/ConnectorInterface.js';

const JIRA_FIXTURE = {
  issues: [
    {
      key: 'ENG-123',
      fields: {
        summary: 'Fix AuthService bug',
        status: { name: 'Done' },
        priority: { name: 'High' },
        assignee: { displayName: 'John' },
        labels: ['backend'],
      },
    },
  ],
};

function makeMockHttpClient(response: unknown) {
  return async (_url: string, _options: RequestInit) => ({
    ok: true,
    json: async () => response,
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

    const connector = new JiraConnector(makeMockHttpClient(JIRA_FIXTURE));
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

    const connector = new JiraConnector(makeMockHttpClient(JIRA_FIXTURE));
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

    const connector = new JiraConnector(makeMockHttpClient(JIRA_FIXTURE));
    const result = await connector.ingest(store, {});

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('JIRA_API_KEY');
    expect(result.nodesAdded).toBe(0);
  });

  it('returns error when base URL is missing, does not throw', async () => {
    process.env['JIRA_API_KEY'] = 'test-key';
    delete process.env['JIRA_BASE_URL'];

    const connector = new JiraConnector(makeMockHttpClient(JIRA_FIXTURE));
    const result = await connector.ingest(store, {});

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('JIRA_BASE_URL');
    expect(result.nodesAdded).toBe(0);
  });
});
