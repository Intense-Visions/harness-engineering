import type { ToolDefinition } from '../tool-types.js';

/**
 * Phase 3 Task 9: MCP wrapper for POST /api/v1/webhooks.
 *
 * Tier-1 (standard+). The orchestrator returns the new subscription's HMAC
 * secret in the response text on the first reveal — the agent transcript may
 * log this. The one-shot reveal model matches `auth/token create`. Callers
 * MUST treat the response body as sensitive: do not echo it into long-lived
 * stores, screenshots, or shared logs. The secret is the only material a
 * bridge needs to verify webhook delivery signatures; rotating it requires
 * deleting and re-creating the subscription.
 */
function orchestratorBase(): string {
  return process.env['HARNESS_ORCHESTRATOR_URL'] ?? 'http://127.0.0.1:8080';
}
function authHeader(): Record<string, string> {
  const tok = process.env['HARNESS_API_TOKEN'];
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

export const subscribeWebhookDefinition: ToolDefinition = {
  name: 'subscribe_webhook',
  description:
    'Subscribe to outbound webhook fan-out via POST /api/v1/webhooks. Returns the secret once. Requires subscribe-webhook scope.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'https URL to POST events to' },
      events: {
        type: 'array',
        items: { type: 'string' },
        description: 'Event-type globs (e.g. ["maintenance.completed", "interaction.*"])',
      },
    },
    required: ['url', 'events'],
  },
};

export async function handleSubscribeWebhook(input: {
  url: string;
  events: string[];
}): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const res = await fetch(`${orchestratorBase()}/api/v1/webhooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ url: input.url, events: input.events }),
  });
  const text = await res.text();
  if (!res.ok) {
    return {
      content: [{ type: 'text', text: `Subscribe failed (${res.status}): ${text}` }],
      isError: true,
    };
  }
  return { content: [{ type: 'text', text }] };
}
