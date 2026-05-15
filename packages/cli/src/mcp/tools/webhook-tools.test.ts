import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { subscribeWebhookDefinition, handleSubscribeWebhook } from './webhook-tools';

const originalFetch = global.fetch;
beforeEach(() => {
  process.env['HARNESS_API_TOKEN'] = 'test.tok';
});
afterEach(() => {
  global.fetch = originalFetch;
  delete process.env['HARNESS_API_TOKEN'];
});

describe('subscribe_webhook MCP tool', () => {
  it('definition has expected name and schema', () => {
    expect(subscribeWebhookDefinition.name).toBe('subscribe_webhook');
    expect((subscribeWebhookDefinition.inputSchema as { required: string[] }).required).toEqual([
      'url',
      'events',
    ]);
  });

  it('posts to /api/v1/webhooks and returns the response text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '{"id":"whk_abc","secret":"sek"}',
      status: 200,
    }) as unknown as typeof fetch;
    const result = await handleSubscribeWebhook({
      url: 'https://example.com/hook',
      events: ['maintenance.completed'],
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('whk_abc');
  });

  it('returns isError on non-2xx', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => 'URL must use https',
      status: 422,
    }) as unknown as typeof fetch;
    const result = await handleSubscribeWebhook({
      url: 'http://example.com/hook',
      events: ['*.*'],
    });
    expect(result.isError).toBe(true);
  });
});
