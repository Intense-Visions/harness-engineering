import { createSlackPoster } from './slack-client.js';
import { createWebhookServer, installShutdownHandlers } from './webhook-handler.js';
import { log } from './logger.js';

/**
 * Entry point for the slack-echo-bridge reference consumer.
 *
 * Reads env-var config, builds the Slack poster + webhook server, wires
 * SIGTERM/SIGINT shutdown handlers, and listens on PORT/HOST. Required
 * env vars cause exit(1) at boot — missing config should NEVER produce a
 * half-running bridge.
 *
 * Env-var contract (see README "Environment variables"):
 *   HARNESS_WEBHOOK_SECRET  (required) — 32-byte hex from POST /api/v1/webhooks response
 *   SLACK_BOT_TOKEN         (required) — Slack bot token with chat:write scope
 *   SLACK_CHANNEL           (required) — Slack channel ID (NOT name)
 *   PORT                    (optional) — bind port, default 3000
 *   HOST                    (optional) — bind host, default 127.0.0.1
 */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (typeof v !== 'string' || v.length === 0) {
    process.stderr.write(`missing required env var: ${name}\n`);
    process.exit(1);
  }
  return v;
}

function main(): void {
  const secret = requireEnv('HARNESS_WEBHOOK_SECRET');
  const slackToken = requireEnv('SLACK_BOT_TOKEN');
  const slackChannel = requireEnv('SLACK_CHANNEL');
  const port = Number.parseInt(process.env['PORT'] ?? '3000', 10);
  const host = process.env['HOST'] ?? '127.0.0.1';

  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    process.stderr.write(`invalid PORT: ${process.env['PORT']}\n`);
    process.exit(1);
  }

  const slack = createSlackPoster({ token: slackToken, channel: slackChannel });
  const server = createWebhookServer({ secret, slack });
  installShutdownHandlers(server);

  server.listen(port, host, () => {
    log.info('bridge.listening', {
      host,
      port,
      path: '/webhooks/maintenance-completed',
    });
  });
}

main();
