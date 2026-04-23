import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphStore } from '../../../src/store/GraphStore.js';
import { ConfluenceConnector } from '../../../src/ingest/connectors/ConfluenceConnector.js';
import type { ConnectorConfig } from '../../../src/ingest/connectors/ConnectorInterface.js';

const CONFLUENCE_FIXTURE = {
  results: [
    {
      id: '123',
      title: 'Auth Guide',
      status: 'current',
      body: { storage: { value: 'handleAuth function docs' } },
      _links: { webui: '/wiki/spaces/DEV/pages/123' },
    },
  ],
  _links: { next: null },
};

function makeMockHttpClient(response: unknown) {
  return async (_url: string, _options?: { headers?: Record<string, string> }) => ({
    ok: true as const,
    json: async () => response,
  });
}

describe('ConfluenceConnector', () => {
  let store: GraphStore;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    store = new GraphStore();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('creates document nodes from Confluence pages with correct metadata', async () => {
    process.env['CONFLUENCE_API_KEY'] = 'test-key';
    process.env['CONFLUENCE_BASE_URL'] = 'https://confluence.example.com';

    const connector = new ConfluenceConnector(makeMockHttpClient(CONFLUENCE_FIXTURE));
    const config: ConnectorConfig = { spaceKey: 'DEV' };

    const result = await connector.ingest(store, config);

    expect(result.nodesAdded).toBe(1);
    expect(result.errors).toHaveLength(0);

    const node = store.getNode('confluence:123');
    expect(node).not.toBeNull();
    expect(node!.type).toBe('document');
    expect(node!.name).toBe('Auth Guide');
    expect(node!.metadata.spaceKey).toBe('DEV');
    expect(node!.metadata.url).toBe('/wiki/spaces/DEV/pages/123');
    expect(node!.metadata.source).toBe('confluence');
    expect(node!.metadata.pageId).toBe('123');
    expect(node!.metadata.status).toBe('current');
  });

  it('links documents to code via keyword matching', async () => {
    process.env['CONFLUENCE_API_KEY'] = 'test-key';
    process.env['CONFLUENCE_BASE_URL'] = 'https://confluence.example.com';

    // Pre-populate store with a code node matching "handleAuth"
    store.addNode({
      id: 'function:handleAuth',
      type: 'function',
      name: 'handleAuth',
      metadata: {},
    });

    const connector = new ConfluenceConnector(makeMockHttpClient(CONFLUENCE_FIXTURE));
    const result = await connector.ingest(store, { spaceKey: 'DEV' });

    expect(result.edgesAdded).toBeGreaterThanOrEqual(1);

    const edges = store.getEdges({
      from: 'confluence:123',
      to: 'function:handleAuth',
      type: 'documents',
    });
    expect(edges).toHaveLength(1);
  });

  it('returns error when API key env var is missing, does not throw', async () => {
    delete process.env['CONFLUENCE_API_KEY'];

    const connector = new ConfluenceConnector(makeMockHttpClient(CONFLUENCE_FIXTURE));
    const result = await connector.ingest(store, {});

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('CONFLUENCE_API_KEY');
    expect(result.nodesAdded).toBe(0);
  });

  it('handles empty response with no pages', async () => {
    process.env['CONFLUENCE_API_KEY'] = 'test-key';
    process.env['CONFLUENCE_BASE_URL'] = 'https://confluence.example.com';

    const emptyResponse = { results: [], _links: { next: null } };
    const connector = new ConfluenceConnector(makeMockHttpClient(emptyResponse));
    const result = await connector.ingest(store, { spaceKey: 'DEV' });

    expect(result.nodesAdded).toBe(0);
    expect(result.edgesAdded).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('creates contains edge from parent to child page', async () => {
    process.env['CONFLUENCE_API_KEY'] = 'test-key';
    process.env['CONFLUENCE_BASE_URL'] = 'https://confluence.example.com';

    const fixture = {
      results: [
        {
          id: '456',
          title: 'Child Page',
          status: 'current',
          body: { storage: { value: 'child content' } },
          ancestors: [{ id: '100' }, { id: '200' }],
          _links: { webui: '/wiki/pages/456' },
        },
      ],
      _links: { next: null },
    };

    const connector = new ConfluenceConnector(makeMockHttpClient(fixture));
    const result = await connector.ingest(store, { spaceKey: 'DEV' });

    expect(result.nodesAdded).toBe(1);
    const edges = store.getEdges({
      from: 'confluence:200',
      to: 'confluence:456',
      type: 'contains',
    });
    expect(edges).toHaveLength(1);

    const node = store.getNode('confluence:456');
    expect(node!.metadata.parentPageId).toBe('200');
  });

  it('stores page labels in metadata', async () => {
    process.env['CONFLUENCE_API_KEY'] = 'test-key';
    process.env['CONFLUENCE_BASE_URL'] = 'https://confluence.example.com';

    const fixture = {
      results: [
        {
          id: '789',
          title: 'Labeled Page',
          status: 'current',
          body: { storage: { value: 'labeled content' } },
          metadata: {
            labels: { results: [{ name: 'architecture' }, { name: 'backend' }] },
          },
          _links: { webui: '/wiki/pages/789' },
        },
      ],
      _links: { next: null },
    };

    const connector = new ConfluenceConnector(makeMockHttpClient(fixture));
    await connector.ingest(store, { spaceKey: 'DEV' });

    const node = store.getNode('confluence:789');
    expect(node!.metadata.labels).toEqual(['architecture', 'backend']);
  });

  it('runs body through condenseContent at default 8000 limit', async () => {
    process.env['CONFLUENCE_API_KEY'] = 'test-key';
    process.env['CONFLUENCE_BASE_URL'] = 'https://confluence.example.com';

    const longBody = 'a'.repeat(10000);
    const fixture = {
      results: [
        {
          id: '999',
          title: 'Long Page',
          status: 'current',
          body: { storage: { value: longBody } },
          _links: { webui: '/wiki/pages/999' },
        },
      ],
      _links: { next: null },
    };

    const connector = new ConfluenceConnector(makeMockHttpClient(fixture));
    await connector.ingest(store, { spaceKey: 'DEV' });

    const node = store.getNode('confluence:999');
    expect(node!.content!.length).toBeLessThanOrEqual(8001);
    expect(node!.metadata.condensed).toBeDefined();
    expect(node!.metadata.originalLength).toBeGreaterThan(8000);
  });
});
