# Slack Echo Bridge — Reference Consumer for the harness Gateway API

A standalone Node service that subscribes to `maintenance.completed` webhooks from a running harness orchestrator, verifies the `X-Harness-Signature` HMAC SHA-256 signature, and posts a formatted message to a Slack channel.

This is the **canonical reference consumer** for the harness Gateway API (Phase 0). It exists to prove that an external author — with no harness-engineering source checkout — can build a working bridge using only the published wire contract.

## What this is NOT

- Not a production bridge (no idempotency suppression — duplicate Slack messages on orchestrator retry are possible by design)
- Not a generic webhook framework (single event type, single Slack channel)
- Not part of the harness pnpm workspace (intentionally standalone)

## Install

```bash
git clone <harness-engineering-repo-url>
cd harness-engineering/examples/slack-echo-bridge
npm install
```

The bridge declares one runtime dependency (`@slack/web-api`) and three devDependencies (`typescript`, `tsx`, `vitest`). It has **zero harness-engineering source dependencies** — `npm install` works against the public npm registry alone.

## Quickstart

```bash
cd examples/slack-echo-bridge
npm install
cp .env.example .env
# edit .env — fill in HARNESS_WEBHOOK_SECRET, SLACK_BOT_TOKEN, SLACK_CHANNEL
npm run build
npm start
```

The bridge now listens on `http://127.0.0.1:3000/webhooks/maintenance-completed`. To accept deliveries from a real orchestrator, expose it via a tunnel (see "Exposing the bridge to the internet" below).

Then in a separate shell, register the subscription with your harness orchestrator:

```bash
# 1. Get an auth token with subscribe-webhook scope:
harness gateway token create --name slack-bridge --scopes subscribe-webhook

# 2. Tell the orchestrator to POST to your bridge:
curl -X POST http://localhost:3000/api/v1/webhooks \
  -H "authorization: Bearer <tok_…>" \
  -H "content-type: application/json" \
  -d '{
    "url": "https://<your-tunnel-host>/webhooks/maintenance-completed",
    "events": ["maintenance.completed"]
  }'
# → returns { id: "whk_…", secret: "<base64url-secret>", … }

# 3. Copy the `secret` field into HARNESS_WEBHOOK_SECRET in .env, then restart the bridge.

# 4. Trigger a maintenance job; watch the bridge log webhook.received → webhook.delivered
#    and watch your Slack channel receive the message.
```

**The orchestrator generates the secret on `POST /api/v1/webhooks`. The bridge does not choose it. Capture the one-time `secret` field from the response and export it as `HARNESS_WEBHOOK_SECRET` before starting the bridge.**

## Environment variables

| Name                     | Required | Default     | Description                                                                                                                                                                                                        |
| ------------------------ | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `HARNESS_WEBHOOK_SECRET` | yes      | —           | Opaque base64url string (~44 chars) from the `POST /api/v1/webhooks` response. Treat as a one-time secret — capture once, store securely, never log. Bridges that lose it must delete + recreate the subscription. |
| `SLACK_BOT_TOKEN`        | yes      | —           | Slack bot token with `chat:write` scope. See https://api.slack.com/authentication/token-types#bot.                                                                                                                 |
| `SLACK_CHANNEL`          | yes      | —           | Slack channel **ID** (not name — find it via channel details → "About").                                                                                                                                           |
| `PORT`                   | no       | `3000`      | HTTP port the bridge listens on.                                                                                                                                                                                   |
| `HOST`                   | no       | `127.0.0.1` | HTTP bind address. Override to `0.0.0.0` only when the bridge MUST accept off-host connections directly (otherwise prefer a tunnel).                                                                               |

## Verifying signatures (the snippet)

Every delivery carries `X-Harness-Signature: sha256=<lowercase-hex>` where the signature is `HMAC-SHA256(secret, rawBody)`. To verify in any language with HMAC stdlib:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
const a = Buffer.from(expected);
const b = Buffer.from(headerSig);
if (a.length !== b.length || !timingSafeEqual(a, b)) reject();
```

**`rawBody` MUST be the verbatim bytes of the request.** A `JSON.parse → JSON.stringify` round-trip will break verification (whitespace and key order are not preserved). The bridge in this directory reads the body with `req.on('data')` chunks → `Buffer.concat`, NOT via a JSON-body-parser middleware.

See `src/signer.ts` for the full implementation with the length-mismatch guard (which avoids `timingSafeEqual`'s otherwise-thrown `TypeError` on length mismatch).

## Exposing the bridge to the internet

The orchestrator runs on `127.0.0.1` by default and will only deliver to `https://` URLs. To accept deliveries from a live orchestrator on a developer machine, expose the bridge via a tunnel. See `docs/guides/gateway-tunnel.md` for the canonical setups (Tailscale, Cloudflare Tunnel, ngrok).

> _Note: `docs/guides/gateway-tunnel.md` is a forthcoming Hermes Phase 0.2 deliverable and has not been written yet. Until then, use Tailscale, Cloudflare Tunnel, or ngrok directly per their own docs — point the tunnel at `http://127.0.0.1:3000` (or whatever `PORT` you chose) and use the resulting public HTTPS URL as the `url` field when calling `POST /api/v1/webhooks`._

## Known properties (intentional)

- **No idempotency suppression.** If the orchestrator retries (Phase 4 retry ladder), the bridge will post **duplicate Slack messages**. The bridge does not track `X-Harness-Delivery-Id` and has no dedup store. To add exactly-once Slack delivery, store seen `X-Harness-Delivery-Id` values yourself — for example:

  ```ts
  // Sketch — NOT in this bridge by default.
  const seen = new Set<string>(); // or Redis SETNX with TTL for multi-instance
  if (seen.has(deliveryId)) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true })); // matches the bridge's success-response shape
    return;
  }
  seen.add(deliveryId);
  // … then post to Slack
  ```

  The orchestrator guarantees a stable `X-Harness-Delivery-Id` across retries of the same delivery, so a `Set`/Redis/SQLite-backed dedup is sufficient.

- **Single event type.** This bridge handles `maintenance.completed` only; other event types receive 400. To handle more, edit `webhook-handler.ts`'s type filter.

- **Verbatim Slack errors.** Slack API errors (rate-limit, channel-not-found, token-revoked) surface in the response body to the orchestrator. The orchestrator's Phase 4 delivery worker retries 5xx with exponential backoff; 4xx is treated as terminal failure.

  Adopters running in regulated environments should be aware that `@slack/web-api` transport-layer errors (network failures, DNS errors) can in rare cases embed request configuration — including a `Bearer xoxb-…` header — inside the error string the bridge surfaces verbatim. The orchestrator's Phase 4 delivery worker persists the 502 response body to the `lastError` column of `.harness/webhook-queue.sqlite`, so a leaked token would land in that file. The bridge's default verbatim behavior is the right teaching shape for a reference; production adopters in regulated environments should consider wrapping `createSlackPoster` to redact `Bearer …` substrings and `xoxb-…` prefixes from the error string before it propagates back to the orchestrator.

## Troubleshooting

| Symptom                                             | Likely cause                                                                                                                                     | Fix                                                                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bridge logs `webhook.signature.mismatch` (HTTP 401) | `HARNESS_WEBHOOK_SECRET` does not match the secret the orchestrator generated for the subscription; or a JSON-body-parser is mutating `rawBody`. | Recreate the subscription via `POST /api/v1/webhooks` and copy the fresh `secret` into `.env`. Confirm no middleware reads/reparses the body before `verify`.             |
| Bridge logs `webhook.event.unsupported` (HTTP 400)  | Subscription was created with extra event types this bridge does not handle.                                                                     | Either delete the subscription and recreate with `events: ['maintenance.completed']`, or extend the type filter in `src/webhook-handler.ts`.                              |
| Bridge logs `slack.postMessage.failed` (HTTP 502)   | Slack rejected the call: token missing scope, channel id invalid, rate-limited, etc. The verbatim Slack error is in the response body.           | Read the `detail` field in the 502 body. Common: `channel_not_found` → use the channel **ID** (`C…`), not the name. `not_authed` / `invalid_auth` → rotate the bot token. |
| `missing required env var: …` at boot               | One of the three required env vars is unset or empty.                                                                                            | Check `.env` is in the working dir, has been sourced (via `npm start` of a dotenv-loading process manager, or shell `export`), and contains all three values.             |
| Orchestrator refuses to create subscription         | The bridge URL is `http://` (orchestrator requires `https://`) or unreachable from the orchestrator's network.                                   | Start a tunnel and use the public `https://…` URL. See "Exposing the bridge to the internet".                                                                             |
| `EADDRINUSE` on `npm start`                         | `PORT` is already in use by another local service.                                                                                               | Set `PORT=3001` (or any free port) in `.env` and restart.                                                                                                                 |

## Customizing the bridge

The bridge is ~150 LoC of idiomatic Node. Common edits:

- **Add an event type:** edit the `event.type !== 'maintenance.completed'` filter in `src/webhook-handler.ts`.
- **Change the Slack message:** edit `createSlackPoster` in `src/slack-client.ts`.
- **Swap the logger:** the structured-logger seam is `src/logger.ts` — drop in pino / winston / your favorite.
- **Use Express or Fastify:** keep `verify()` from `src/signer.ts` and the raw-body capture pattern; the rest is yours.
- **Add idempotency suppression:** see the sketch under "Known properties → No idempotency suppression".
- **Tune the body-size cap:** `createWebhookServer` accepts `maxBodyBytes` (default 1 MiB). Orchestrator payloads are kilobytes; the cap is a defense-in-depth limit for adopters who expose the bridge through a tunnel.

## Tests

```bash
npm test
```

Fourteen tests covering signature verification (6 cases) and HTTP flow (8 cases — happy path, invalid signature, unsupported event type, Slack failure, invalid JSON body, 404 path, oversized body, SIGTERM smoke). All run under Node 20+ via vitest with no harness-engineering source dependency.

To typecheck without emitting:

```bash
npm run typecheck
```

## License

Same license as the parent repository — see the root `LICENSE`.
