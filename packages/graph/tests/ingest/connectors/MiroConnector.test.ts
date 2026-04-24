import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphStore } from '../../../src/store/GraphStore.js';
import { MiroConnector } from '../../../src/ingest/connectors/MiroConnector.js';
import type { ConnectorConfig } from '../../../src/ingest/connectors/ConnectorInterface.js';

const MIRO_BOARD_FIXTURE = {
  id: 'board-001',
  name: 'Sprint Planning',
  description: 'Q2 sprint planning board',
};

const MIRO_ITEMS_FIXTURE = {
  data: [
    {
      id: 'item-001',
      type: 'sticky_note',
      data: { content: '<p>User authentication must use OAuth2</p>' },
    },
    {
      id: 'item-002',
      type: 'sticky_note',
      data: { content: '<p>API rate limiting required for all endpoints</p>' },
    },
    {
      id: 'item-003',
      type: 'shape',
      data: { content: '<p>Payment Gateway</p>' },
    },
    {
      id: 'item-004',
      type: 'text',
      data: {
        content: '<p>Integration points between AuthService and PaymentService</p>',
      },
    },
  ],
};

function makeMockHttpClient(boardResponse: unknown, itemsResponse: unknown) {
  return async (url: string, _options?: { headers?: Record<string, string> }) => ({
    ok: true as const,
    json: async () => (url.includes('/items') ? itemsResponse : boardResponse),
  });
}

describe('MiroConnector', () => {
  let store: GraphStore;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    store = new GraphStore();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('creates document node for board', async () => {
    process.env['MIRO_API_KEY'] = 'test-key';

    const connector = new MiroConnector(makeMockHttpClient(MIRO_BOARD_FIXTURE, MIRO_ITEMS_FIXTURE));
    const config: ConnectorConfig = { boardIds: ['board-001'] };

    const result = await connector.ingest(store, config);

    expect(result.errors).toHaveLength(0);

    const node = store.getNode('miro:board:board-001');
    expect(node).not.toBeNull();
    expect(node!.type).toBe('document');
    expect(node!.name).toBe('Sprint Planning');
    expect(node!.metadata.source).toBe('miro');
    expect(node!.metadata.boardId).toBe('board-001');
  });

  it('creates business_concept nodes from sticky notes', async () => {
    process.env['MIRO_API_KEY'] = 'test-key';

    const connector = new MiroConnector(makeMockHttpClient(MIRO_BOARD_FIXTURE, MIRO_ITEMS_FIXTURE));
    const config: ConnectorConfig = { boardIds: ['board-001'] };

    await connector.ingest(store, config);

    const stickyNode1 = store.getNode('miro:item:item-001');
    expect(stickyNode1).not.toBeNull();
    expect(stickyNode1!.type).toBe('business_concept');
    expect(stickyNode1!.metadata.itemType).toBe('sticky_note');

    const stickyNode2 = store.getNode('miro:item:item-002');
    expect(stickyNode2).not.toBeNull();
    expect(stickyNode2!.type).toBe('business_concept');

    // text items also become business_concept nodes
    const textNode = store.getNode('miro:item:item-004');
    expect(textNode).not.toBeNull();
    expect(textNode!.type).toBe('business_concept');
    expect(textNode!.metadata.itemType).toBe('text');

    // shape items are skipped (not sticky_note or text)
    const shapeNode = store.getNode('miro:item:item-003');
    expect(shapeNode).toBeNull();
  });

  it('strips HTML from content', async () => {
    process.env['MIRO_API_KEY'] = 'test-key';

    const connector = new MiroConnector(makeMockHttpClient(MIRO_BOARD_FIXTURE, MIRO_ITEMS_FIXTURE));
    const config: ConnectorConfig = { boardIds: ['board-001'] };

    await connector.ingest(store, config);

    const node = store.getNode('miro:item:item-001');
    expect(node).not.toBeNull();
    expect(node!.content).not.toContain('<p>');
    expect(node!.content).not.toContain('</p>');
    expect(node!.content).toBe('User authentication must use OAuth2');
  });

  it('returns error when MIRO_API_KEY is missing', async () => {
    delete process.env['MIRO_API_KEY'];

    const connector = new MiroConnector(makeMockHttpClient(MIRO_BOARD_FIXTURE, MIRO_ITEMS_FIXTURE));
    const config: ConnectorConfig = { boardIds: ['board-001'] };

    const result = await connector.ingest(store, config);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('MIRO_API_KEY');
    expect(result.nodesAdded).toBe(0);
  });

  it('creates edges to matching code nodes', async () => {
    process.env['MIRO_API_KEY'] = 'test-key';

    // Pre-populate store with a code node
    store.addNode({
      id: 'class:AuthService',
      type: 'class',
      name: 'AuthService',
      metadata: {},
    });

    const connector = new MiroConnector(makeMockHttpClient(MIRO_BOARD_FIXTURE, MIRO_ITEMS_FIXTURE));
    const config: ConnectorConfig = { boardIds: ['board-001'] };

    const result = await connector.ingest(store, config);

    expect(result.edgesAdded).toBeGreaterThanOrEqual(1);

    // item-004 mentions "AuthService" so it should have a documents edge
    const edges = store.getEdges({
      from: 'miro:item:item-004',
      to: 'class:AuthService',
      type: 'documents',
    });
    expect(edges).toHaveLength(1);
  });

  it('continues processing remaining boards when one board fails', async () => {
    process.env['MIRO_API_KEY'] = 'test-key';

    const failingBoard = 'board-bad';
    const httpClient = async (url: string, _options?: { headers?: Record<string, string> }) => {
      if (url.includes(failingBoard)) {
        return { ok: false as const, json: async () => ({}) };
      }
      return {
        ok: true as const,
        json: async () => (url.includes('/items') ? MIRO_ITEMS_FIXTURE : MIRO_BOARD_FIXTURE),
      };
    };

    const connector = new MiroConnector(httpClient);
    const config: ConnectorConfig = { boardIds: [failingBoard, 'board-001'] };

    const result = await connector.ingest(store, config);

    // First board failed, second board succeeded
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain(failingBoard);
    // Second board was still processed
    expect(result.nodesAdded).toBeGreaterThan(0);
  });

  it('reports correct ingest counts', async () => {
    process.env['MIRO_API_KEY'] = 'test-key';

    const connector = new MiroConnector(makeMockHttpClient(MIRO_BOARD_FIXTURE, MIRO_ITEMS_FIXTURE));
    const config: ConnectorConfig = { boardIds: ['board-001'] };

    const result = await connector.ingest(store, config);

    expect(result.errors).toHaveLength(0);
    // 1 board + 3 items (item-003 is a shape and is skipped)
    expect(result.nodesAdded).toBe(4);
    // 3 contains edges (board -> each item)
    expect(result.edgesAdded).toBeGreaterThanOrEqual(3);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
