import { WebClient } from '@slack/web-api';
import type { MaintenanceCompletedData } from './types.js';

/**
 * Thin wrapper around Slack's WebClient.chat.postMessage.
 *
 * Why a wrapper at all: webhook-handler.test.ts mocks THIS, not the
 * raw WebClient. The wrapper is the seam between "HTTP handler logic"
 * and "Slack-API surface area" — keeping it narrow makes the handler
 * test independent of @slack/web-api's internals.
 *
 * Slack errors surface verbatim — we do NOT translate them. The
 * orchestrator's webhook delivery worker treats 5xx as retryable; the
 * caller is responsible for choosing 5xx vs 4xx based on the Slack
 * error category.
 */

export interface SlackPoster {
  postMaintenanceCompleted(data: MaintenanceCompletedData): Promise<void>;
}

export function createSlackPoster(opts: { token: string; channel: string }): SlackPoster {
  const client = new WebClient(opts.token);
  return {
    async postMaintenanceCompleted(data: MaintenanceCompletedData): Promise<void> {
      const text = `Maintenance task \`${data.taskId}\` completed: *${data.status}* (${data.findings} findings, ${data.fixed} fixed)`;
      const res = await client.chat.postMessage({ channel: opts.channel, text });
      if (!res.ok) {
        // The SDK throws on transport errors; this catches the `{ ok: false }` rare path.
        throw new Error(`slack chat.postMessage returned ok=false: ${String(res.error)}`);
      }
    },
  };
}
