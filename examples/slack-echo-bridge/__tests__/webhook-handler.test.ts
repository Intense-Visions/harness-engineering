import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createWebhookServer, installShutdownHandlers } from '../src/webhook-handler.js';
import type { SlackPoster } from '../src/slack-client.js';
import { TEST_SECRET, makeMaintenanceCompletedEvent, signBody } from './fixtures.js';

function startOnPort0(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function stop(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('webhook-handler', () => {
  let slack: SlackPoster & { postMaintenanceCompleted: ReturnType<typeof vi.fn> };
  let server: Server;
  let port: number;

  beforeEach(async () => {
    slack = { postMaintenanceCompleted: vi.fn(async () => undefined) };
    server = createWebhookServer({ secret: TEST_SECRET, slack });
    port = await startOnPort0(server);
  });

  afterEach(async () => {
    await stop(server);
    vi.restoreAllMocks();
  });

  async function post(
    headers: Record<string, string>,
    body: string
  ): Promise<{ status: number; json: unknown }> {
    const res = await fetch(`http://127.0.0.1:${port}/webhooks/maintenance-completed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  }

  it('accepts a valid signed delivery and calls Slack', async () => {
    const event = makeMaintenanceCompletedEvent();
    const body = JSON.stringify(event);
    const sig = signBody(TEST_SECRET, body);
    const { status, json } = await post(
      {
        'x-harness-signature': sig,
        'x-harness-delivery-id': 'dlv_test',
        'x-harness-event-type': event.type,
      },
      body
    );
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(slack.postMaintenanceCompleted).toHaveBeenCalledOnce();
  });

  it('rejects invalid signatures with 401 and does NOT call Slack', async () => {
    const event = makeMaintenanceCompletedEvent();
    const body = JSON.stringify(event);
    const { status, json } = await post(
      { 'x-harness-signature': 'sha256=deadbeef', 'x-harness-event-type': event.type },
      body
    );
    expect(status).toBe(401);
    expect(json).toEqual({ error: 'signature mismatch' });
    expect(slack.postMaintenanceCompleted).not.toHaveBeenCalled();
  });

  it('rejects unsupported event types with 400', async () => {
    const event = { ...makeMaintenanceCompletedEvent(), type: 'maintenance.error' };
    const body = JSON.stringify(event);
    const sig = signBody(TEST_SECRET, body);
    const { status } = await post(
      { 'x-harness-signature': sig, 'x-harness-event-type': event.type },
      body
    );
    expect(status).toBe(400);
    expect(slack.postMaintenanceCompleted).not.toHaveBeenCalled();
  });

  it('returns 502 with verbatim Slack error when chat.postMessage throws', async () => {
    slack.postMaintenanceCompleted.mockRejectedValueOnce(new Error('rate_limited'));
    const event = makeMaintenanceCompletedEvent();
    const body = JSON.stringify(event);
    const sig = signBody(TEST_SECRET, body);
    const { status, json } = await post(
      { 'x-harness-signature': sig, 'x-harness-event-type': event.type },
      body
    );
    expect(status).toBe(502);
    expect(json).toMatchObject({
      error: 'slack delivery failed',
      detail: expect.stringContaining('rate_limited'),
    });
  });

  it('returns 400 with "invalid json body" when a signed-but-malformed body fails JSON.parse and does NOT call Slack', async () => {
    // Body is a valid HMAC input (so it passes verify()) but is NOT valid JSON.
    // Exercises the JSON.parse catch branch in webhook-handler.ts.
    const body = 'not-json';
    const sig = signBody(TEST_SECRET, body);
    const { status, json } = await post(
      {
        'x-harness-signature': sig,
        'x-harness-delivery-id': 'dlv_invalid_json',
        'x-harness-event-type': 'maintenance.completed',
      },
      body
    );
    expect(status).toBe(400);
    expect(json).toMatchObject({ error: expect.stringContaining('invalid json body') });
    expect(slack.postMaintenanceCompleted).not.toHaveBeenCalled();
  });

  it('returns 404 for unrelated paths', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/random`, { method: 'POST' });
    expect(res.status).toBe(404);
    expect(slack.postMaintenanceCompleted).not.toHaveBeenCalled();
  });

  it('installShutdownHandlers wires SIGTERM/SIGINT without throwing', () => {
    // Smoke: we cannot actually emit SIGTERM in-test without killing the
    // vitest process. Assert the function is invokable and does not throw.
    expect(() => installShutdownHandlers(server, 1)).not.toThrow();
  });
});
