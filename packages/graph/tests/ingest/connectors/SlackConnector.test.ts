import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphStore } from '../../../src/store/GraphStore.js';
import { SlackConnector } from '../../../src/ingest/connectors/SlackConnector.js';
import type { ConnectorConfig } from '../../../src/ingest/connectors/ConnectorInterface.js';

const SLACK_FIXTURE = {
  ok: true,
  messages: [
    {
      text: 'Fixed bug in auth-service.ts hashPassword function',
      user: 'U123',
      ts: '1234567890.123456',
    },
  ],
};

function makeMockHttpClient(response: unknown) {
  return async (_url: string, _options: RequestInit) => ({
    ok: true,
    json: async () => response,
  });
}

describe('SlackConnector', () => {
  let store: GraphStore;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    store = new GraphStore();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('creates conversation nodes', async () => {
    process.env['SLACK_API_KEY'] = 'xoxb-test';

    const connector = new SlackConnector(makeMockHttpClient(SLACK_FIXTURE));
    const config: ConnectorConfig = { channels: ['C123'] };

    const result = await connector.ingest(store, config);

    expect(result.nodesAdded).toBe(1);
    expect(result.errors).toHaveLength(0);

    const node = store.getNode('conversation:slack:C123:1234567890.123456');
    expect(node).not.toBeNull();
    expect(node!.type).toBe('conversation');
    expect(node!.metadata.author).toBe('U123');
    expect(node!.metadata.channel).toBe('C123');
    expect(node!.metadata.timestamp).toBe('1234567890.123456');
  });

  it('creates references edges to matching code nodes', async () => {
    process.env['SLACK_API_KEY'] = 'xoxb-test';

    // Pre-populate store with code node
    store.addNode({
      id: 'function:hashPassword',
      type: 'function',
      name: 'hashPassword',
      metadata: {},
    });

    const connector = new SlackConnector(makeMockHttpClient(SLACK_FIXTURE));
    const config: ConnectorConfig = { channels: ['C123'] };

    const result = await connector.ingest(store, config);

    expect(result.edgesAdded).toBeGreaterThanOrEqual(1);

    const edges = store.getEdges({
      from: 'conversation:slack:C123:1234567890.123456',
      to: 'function:hashPassword',
      type: 'references',
    });
    expect(edges).toHaveLength(1);
  });

  it('returns error when API key is missing, does not throw', async () => {
    delete process.env['SLACK_API_KEY'];

    const connector = new SlackConnector(makeMockHttpClient(SLACK_FIXTURE));
    const config: ConnectorConfig = { channels: ['C123'] };

    const result = await connector.ingest(store, config);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('SLACK_API_KEY');
    expect(result.nodesAdded).toBe(0);
  });

  it('handles multiple channels', async () => {
    process.env['SLACK_API_KEY'] = 'xoxb-test';

    const connector = new SlackConnector(makeMockHttpClient(SLACK_FIXTURE));
    const config: ConnectorConfig = { channels: ['C123', 'C456'] };

    const result = await connector.ingest(store, config);

    expect(result.nodesAdded).toBe(2);
  });
});
