import { describe, it, expect, vi } from 'vitest';
import type { GatewayEvent, NotificationEnvelope } from '@harness-engineering/types';
import { SlackSink } from './slack-sink';

const WEBHOOK_URL = 'https://hooks.slack.com/services/T/B/X';

function mkEnvelope(over: Partial<NotificationEnvelope> = {}): NotificationEnvelope {
  return {
    title: 'Hello',
    summary: 'world',
    severity: 'info',
    ...over,
  };
}

function mkRawEvent(): GatewayEvent {
  return {
    id: 'evt_abc',
    type: 'custom.unknown',
    timestamp: new Date().toISOString(),
    data: { hello: 'world' },
  };
}

function okResponse(body = 'ok'): Response {
  return new Response(body, { status: 200, statusText: 'OK' });
}

describe('SlackSink', () => {
  it('POSTs an envelope as a section block on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const sink = new SlackSink({ id: 'team', webhookUrl: WEBHOOK_URL, fetchImpl });
    const result = await sink.deliver({ payload: mkEnvelope(), wrapped: true });
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const args = fetchImpl.mock.calls[0]!;
    expect(args[0]).toBe(WEBHOOK_URL);
    const body = JSON.parse(args[1].body) as { text: string; blocks: unknown[] };
    expect(body.text).toContain('Hello');
    expect(Array.isArray(body.blocks)).toBe(true);
  });

  it('includes action buttons when the envelope has actions', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const sink = new SlackSink({ id: 'team', webhookUrl: WEBHOOK_URL, fetchImpl });
    await sink.deliver({
      payload: mkEnvelope({
        actions: [{ label: 'View', url: 'https://example.com/x' }],
      }),
      wrapped: true,
    });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body) as {
      blocks: Array<{ type: string; elements?: unknown[] }>;
    };
    const actions = body.blocks.find((b) => b.type === 'actions');
    expect(actions).toBeDefined();
    expect(actions?.elements).toHaveLength(1);
  });

  it('renders raw event payloads as code blocks when wrapped is false', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse());
    const sink = new SlackSink({ id: 'team', webhookUrl: WEBHOOK_URL, fetchImpl });
    await sink.deliver({ payload: mkRawEvent(), wrapped: false });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body) as { text: string };
    expect(body.text).toContain('custom.unknown');
  });

  it('returns Err with HTTP status on non-2xx response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));
    const sink = new SlackSink({ id: 'team', webhookUrl: WEBHOOK_URL, fetchImpl });
    const result = await sink.deliver({ payload: mkEnvelope(), wrapped: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.httpStatus).toBe(429);
      expect(result.error).toContain('429');
    }
  });

  it('reports a timeout error when the fetch is aborted', async () => {
    const fetchImpl = vi.fn().mockImplementation(
      (_url: string, opts: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        })
    );
    const sink = new SlackSink({
      id: 'team',
      webhookUrl: WEBHOOK_URL,
      fetchImpl,
      timeoutMs: 5,
    });
    const result = await sink.deliver({ payload: mkEnvelope(), wrapped: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('timeout');
    }
  });

  it('does not retry — one fetch call per deliver', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('fail', { status: 500 }));
    const sink = new SlackSink({ id: 'team', webhookUrl: WEBHOOK_URL, fetchImpl });
    await sink.deliver({ payload: mkEnvelope(), wrapped: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
