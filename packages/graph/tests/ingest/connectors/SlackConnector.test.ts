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
  return async (_url: string, _options?: { headers?: Record<string, string> }) => ({
    ok: true as const,
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

  it('fetches thread replies and concatenates into node content', async () => {
    process.env['SLACK_API_KEY'] = 'xoxb-test';

    const historyResponse = {
      ok: true,
      messages: [
        {
          text: 'Should we use Redis or Memcached?',
          user: 'U100',
          ts: '1000.000',
          reply_count: 2,
          thread_ts: '1000.000',
        },
      ],
    };

    const repliesResponse = {
      ok: true,
      messages: [
        { text: 'Should we use Redis or Memcached?', user: 'U100', ts: '1000.000' },
        { text: 'Redis - it supports pub/sub', user: 'U200', ts: '1000.001' },
        { text: 'Agreed, going with Redis', user: 'U100', ts: '1000.002' },
      ],
    };

    const httpClient = async (url: string) => ({
      ok: true as const,
      json: async () => (url.includes('conversations.replies') ? repliesResponse : historyResponse),
    });

    const connector = new SlackConnector(httpClient);
    const result = await connector.ingest(store, { channels: ['C100'] });

    expect(result.nodesAdded).toBe(1);
    const node = store.getNode('conversation:slack:C100:1000.000');
    expect(node!.content).toContain('Redis - it supports pub/sub');
    expect(node!.content).toContain('Agreed, going with Redis');
    expect(node!.metadata.threadReplyCount).toBe(2);
  });

  it('stores reaction counts in metadata', async () => {
    process.env['SLACK_API_KEY'] = 'xoxb-test';

    const fixture = {
      ok: true,
      messages: [
        {
          text: 'Deploy approved',
          user: 'U100',
          ts: '2000.000',
          reactions: [
            { name: '+1', count: 5 },
            { name: 'white_check_mark', count: 3 },
          ],
        },
      ],
    };

    const connector = new SlackConnector(makeMockHttpClient(fixture));
    await connector.ingest(store, { channels: ['C200'] });

    const node = store.getNode('conversation:slack:C200:2000.000');
    expect(node!.metadata.reactions).toEqual({ '+1': 5, white_check_mark: 3 });
  });

  it('applies condenseContent with maxContentLength', async () => {
    process.env['SLACK_API_KEY'] = 'xoxb-test';

    const longText = 'decision: '.repeat(500);
    const fixture = {
      ok: true,
      messages: [
        {
          text: longText,
          user: 'U100',
          ts: '3000.000',
        },
      ],
    };

    const connector = new SlackConnector(makeMockHttpClient(fixture));
    await connector.ingest(store, { channels: ['C300'], maxContentLength: 100 });

    const node = store.getNode('conversation:slack:C300:3000.000');
    expect(node!.content!.length).toBeLessThanOrEqual(101);
    expect(node!.metadata.condensed).toBeDefined();
  });
});
