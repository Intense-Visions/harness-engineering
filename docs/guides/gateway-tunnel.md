# Gateway Tunnel Guide

How to expose a harness Gateway API bridge to a remote orchestrator (or a remote bridge to a local orchestrator) using Cloudflare Tunnel, Tailscale, or ngrok.

This guide is the canonical operator-side answer to "the orchestrator binds 127.0.0.1 and only delivers to https URLs — how do I actually wire up a webhook bridge?". The harness orchestrator deliberately does **not** ship a public-binding mode or a built-in tunnel; routing public traffic to a webhook receiver is a deployment concern that an off-the-shelf tunnel solves better than harness ever could (see [ADR 0011](../knowledge/decisions/0011-orchestrator-gateway-api-contract.md) for the rationale).

The end-to-end example throughout this guide is the [`examples/slack-echo-bridge/`](../../examples/slack-echo-bridge/) reference consumer: a standalone Node service that subscribes to `maintenance.completed` webhooks, verifies the `X-Harness-Signature: sha256=<hex>` HMAC SHA-256 signature, and posts a message to a Slack channel.

> _Vendor commands re-validated 2026-05-16 against `cloudflared` 2025.x, `tailscale` 1.x, `ngrok` 3.x. If you hit a command surface drift, file an issue at `github:Intense-Visions/harness-engineering` with the offending pattern._

## Why this guide exists

Three constraints on the harness side force the tunnel:

1. **The orchestrator binds `127.0.0.1` by default** ([`packages/orchestrator/src/server/http.ts:97-99`](../../packages/orchestrator/src/server/http.ts)). Override only with `HOST=0.0.0.0` and only when you genuinely need off-host inbound traffic — bare-binding to a public interface without an authn proxy in front is an explicit anti-pattern.
2. **Webhook subscription URLs must be `https://`** ([`packages/orchestrator/src/server/routes/v1/webhooks.ts:143-146`](../../packages/orchestrator/src/server/routes/v1/webhooks.ts)). The orchestrator returns `422 { error: "URL must use https" }` on `http://`.
3. **Webhook subscription URLs must not resolve to private or loopback addresses** ([`packages/orchestrator/src/server/utils/url-guard.ts`](../../packages/orchestrator/src/server/utils/url-guard.ts)). The orchestrator returns `422 { error: "URL must not target private or loopback addresses" }` for `localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `*.local`, and IPv6 loopback equivalents.

The tunnel solves all three at once: it gives you a real public `https://<random>.<vendor-domain>/` URL that resolves to a vendor edge, terminates TLS for you, and forwards traffic back to your `127.0.0.1` listener over an outbound-initiated connection.

**The HMAC signature is your authentication boundary.** The public tunnel URL is world-reachable; nothing stops a stranger from POSTing to it. The bridge verifies `X-Harness-Signature: sha256=<hex>` against a shared secret on every request, and unsigned/malformed/wrong-secret requests get rejected with 401. Treat the tunnel URL as public and the HMAC verifier as the gate. See the [Security notes](#security-notes) section.

## What you need before starting

- A running harness orchestrator (locally or on a deployed host) reachable to **you** at some address (`http://localhost:8080` for a local one, or whatever your operator wired up).
- A Gateway API token with the `subscribe-webhook` scope. Create one with:

  ```bash
  harness gateway token create --name slack-bridge --scopes subscribe-webhook
  # → prints { id: "tok_…", secret: "<one-time-secret>" } once. Save the secret.
  ```

- The Slack echo bridge built and runnable locally:

  ```bash
  cd examples/slack-echo-bridge
  npm install
  cp .env.example .env
  # edit .env — SLACK_BOT_TOKEN, SLACK_CHANNEL. HARNESS_WEBHOOK_SECRET is filled in
  # after you create the subscription further below.
  npm run build
  ```

- A Slack workspace, a bot user with `chat:write`, and a target channel **ID** (`C…` — not the channel name).

## Pick a tunnel

| Tunnel                              | Public URL persistence       | Anonymous to peers?        | Install footprint                 | Recommended for                                  |
| ----------------------------------- | ---------------------------- | -------------------------- | --------------------------------- | ------------------------------------------------ |
| [Cloudflare Tunnel](#1-cloudflare-tunnel) | Persistent named hostname    | Yes (anonymous public HTTPS) | `cloudflared` daemon, Cloudflare account, one DNS record | Production-shaped deployments; long-lived bridges |
| [Tailscale](#2-tailscale)           | Stable while peers signed in | No (peers are signed-in)   | `tailscale` daemon on both ends   | Private mesh; you own both ends                  |
| [ngrok](#3-ngrok)                   | Ephemeral (free) or reserved (paid) | Yes (anonymous public HTTPS) | `ngrok` binary, ngrok account  | Demos, CI smoke runs, 5-minute experiments       |

The order in this guide is the recommended order to reach for. Read the comparison row that matches your situation, then jump to that section.

---

## 1. Cloudflare Tunnel

Cloudflare Tunnel runs an outbound-only daemon (`cloudflared`) that connects to the Cloudflare edge and accepts public HTTPS traffic on a hostname you control (via Cloudflare DNS). The bridge stays on `127.0.0.1`; no inbound port is opened on its host.

### 1a. Bridge-local, orchestrator-remote (Slack bridge on your laptop, orchestrator on a deployed host)

This is the "I'm developing a bridge against a hosted harness" case.

**One-time setup:**

```bash
# Install
brew install cloudflared           # macOS
# or: see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

# Authenticate (opens a browser; pick the zone you'll use)
cloudflared tunnel login

# Create a named tunnel
cloudflared tunnel create harness-slack-bridge
# → prints a tunnel UUID and writes credentials to ~/.cloudflared/<uuid>.json

# Route a DNS hostname at the tunnel (replace bridge.example.com with a hostname under
# a Cloudflare-managed zone you own):
cloudflared tunnel route dns harness-slack-bridge bridge.example.com
```

**Per-session:**

```bash
# In one terminal: start the bridge on 127.0.0.1:3000
cd examples/slack-echo-bridge
npm start                          # listens on 127.0.0.1:3000 by default

# In another terminal: bring up the tunnel pointing at the bridge
cloudflared tunnel --url http://127.0.0.1:3000 run harness-slack-bridge
```

`cloudflared` is now forwarding `https://bridge.example.com/*` → `http://127.0.0.1:3000/*`.

**Register the subscription with the orchestrator:**

```bash
curl -X POST https://<orchestrator-host>/api/v1/webhooks \
  -H "authorization: Bearer <tok_…>" \
  -H "content-type: application/json" \
  -d '{
    "url": "https://bridge.example.com/webhooks/maintenance-completed",
    "events": ["maintenance.completed"]
  }'
# → { id: "whk_…", secret: "<base64url-secret>", … }
```

Copy the `secret` into `HARNESS_WEBHOOK_SECRET` in `examples/slack-echo-bridge/.env`, then restart `npm start`. Trigger a maintenance job on the orchestrator and watch:

- Bridge logs: `webhook.received` → `webhook.verified` → `slack.postMessage.ok`
- Slack channel: the formatted maintenance message lands

**Teardown:**

```bash
# Stop the bridge and cloudflared. The named tunnel + DNS record persist;
# the next session reuses both. To remove entirely:
cloudflared tunnel delete harness-slack-bridge
```

### 1b. Bridge-remote, orchestrator-local (orchestrator on your laptop, bridge on a deployed host)

This is the "I'm developing the orchestrator and want a real bridge calling it" case. Same `cloudflared` mechanics; tunnel target flips.

**Run on the bridge's host** (e.g. a Fly.io VM, EC2, or anywhere you've placed the bridge):

```bash
cloudflared tunnel --url http://127.0.0.1:3000 run harness-slack-bridge
```

**Register the subscription with the orchestrator** — but the orchestrator is on your laptop binding `127.0.0.1`. The bridge can't reach `https://localhost`, so flip the perspective: register the bridge's tunnel URL with the local orchestrator and let the orchestrator's **outbound** delivery dial out to `https://bridge.example.com`:

```bash
curl -X POST http://localhost:8080/api/v1/webhooks \
  -H "authorization: Bearer <tok_…>" \
  -H "content-type: application/json" \
  -d '{
    "url": "https://bridge.example.com/webhooks/maintenance-completed",
    "events": ["maintenance.completed"]
  }'
```

Outbound from the orchestrator goes to the public DNS name → Cloudflare edge → `cloudflared` on the bridge host → `127.0.0.1:3000`. No tunnel required on the orchestrator side.

---

## 2. Tailscale

Tailscale builds a WireGuard mesh where every host is identifiable by a magicDNS name (`<machine>.<tailnet>.ts.net`) on a private network. Unlike Cloudflare Tunnel and ngrok, Tailscale peers are **signed-in** — only members of your tailnet can resolve and reach the hostname. Pick Tailscale when you own both the orchestrator host and the bridge host and want a private link with no public surface at all.

The harness orchestrator's URL guard rejects `localhost`, RFC-1918, and `*.local`, but Tailscale's `ts.net` magicDNS names resolve to CGNAT `100.x.y.z` addresses outside those ranges, so the orchestrator accepts them.

### 2a. Bridge-local, orchestrator-remote (both on your tailnet)

**One-time setup:**

```bash
# Install on the bridge host
brew install tailscale             # macOS, or follow https://tailscale.com/download
sudo tailscale up                  # opens a browser to authenticate
tailscale status                   # confirm your machine is listed
```

Repeat on the orchestrator host. Both must share a tailnet.

**Per-session:**

```bash
# On the bridge host, start the bridge listening on the Tailscale interface OR
# on 127.0.0.1 fronted by `tailscale serve`. The `tailscale serve` route is
# cleaner because it terminates TLS at the Tailscale daemon — no certs to
# manage and you get a real https:// URL.
cd examples/slack-echo-bridge
npm start                          # listens on 127.0.0.1:3000

# In a second terminal on the same host:
tailscale serve --bg --https=443 http://127.0.0.1:3000
# → prints https://<machine>.<tailnet>.ts.net/ as the public-on-tailnet URL
```

**Register the subscription** from the orchestrator host:

```bash
curl -X POST https://<orchestrator-host>/api/v1/webhooks \
  -H "authorization: Bearer <tok_…>" \
  -H "content-type: application/json" \
  -d '{
    "url": "https://<machine>.<tailnet>.ts.net/webhooks/maintenance-completed",
    "events": ["maintenance.completed"]
  }'
```

The orchestrator's outbound delivery dials the magicDNS name; resolution succeeds **only because the orchestrator host is on the same tailnet**. A non-tailnet caller cannot resolve the hostname.

**Teardown:**

```bash
tailscale serve reset              # tears down the serve mapping
# tailscale daemon keeps running; leave as-is for the next session
```

### 2b. Bridge-remote, orchestrator-local (Tailscale mirror)

Symmetric to §1b. Run `tailscale serve` on the bridge host; from your laptop orchestrator (also on the tailnet) register the bridge's `https://<machine>.<tailnet>.ts.net/...` URL. The orchestrator's outbound delivery dials magicDNS over WireGuard.

---

## 3. ngrok

ngrok is the fastest-to-set-up option and the right choice for a 5-minute demo or a one-shot integration smoke. The free plan gives an ephemeral public hostname that rotates on every restart — fine for demos, painful for anything long-lived (you re-create the webhook subscription each rotation). The paid plan reserves a stable hostname.

### 3a. Bridge-local, orchestrator-remote

**One-time setup:**

```bash
brew install ngrok                 # macOS, or download from https://ngrok.com/download
ngrok config add-authtoken <your-ngrok-authtoken>
```

**Per-session:**

```bash
# Terminal 1: start the bridge
cd examples/slack-echo-bridge
npm start                          # 127.0.0.1:3000

# Terminal 2: bring up the tunnel
ngrok http 3000
# → prints a Forwarding line like:
#   Forwarding   https://abc123-xyz.ngrok-free.app -> http://localhost:3000
```

**Register the subscription:**

```bash
curl -X POST https://<orchestrator-host>/api/v1/webhooks \
  -H "authorization: Bearer <tok_…>" \
  -H "content-type: application/json" \
  -d '{
    "url": "https://abc123-xyz.ngrok-free.app/webhooks/maintenance-completed",
    "events": ["maintenance.completed"]
  }'
```

Trigger a maintenance job. Watch the ngrok inspector at `http://127.0.0.1:4040` to see each delivery's request/response pair — invaluable for debugging signature mismatches.

**Teardown:**

```bash
# Ctrl-C the ngrok process. The hostname is gone; if you restart ngrok you'll
# get a new hostname and the orchestrator's stored subscription will start
# failing on every delivery. Delete and re-create the subscription:
curl -X DELETE https://<orchestrator-host>/api/v1/webhooks/whk_… \
  -H "authorization: Bearer <tok_…>"
```

### 3b. Bridge-remote, orchestrator-local

Same pattern; run `ngrok http 3000` on the bridge host, register the resulting `https://*.ngrok-free.app/...` URL with the laptop-local orchestrator.

---

## Verifying it worked

End-to-end, a successful `maintenance.completed` delivery looks like this:

1. **Orchestrator side** (`harness gateway deliveries list` or the dashboard's webhook page): the latest delivery row shows `status: delivered`, `attempts: 1`, `responseCode: 200`.
2. **Bridge logs:**
   ```
   webhook.received   { deliveryId: "dlv_…", eventType: "maintenance.completed" }
   webhook.verified   { deliveryId: "dlv_…" }
   slack.postMessage.ok { channel: "C…", ts: "1730000000.001" }
   ```
3. **Slack:** the formatted maintenance-completed message appears in the configured channel.

If any of those three is missing, jump to [Troubleshooting](#troubleshooting).

## HMAC verification

The bridge verifies `X-Harness-Signature: sha256=<lowercase-hex>` on every delivery against `HMAC-SHA256(HARNESS_WEBHOOK_SECRET, rawBody)` using constant-time compare. The canonical 5-line snippet lives in [`examples/slack-echo-bridge/src/signer.ts`](../../examples/slack-echo-bridge/src/signer.ts) — read that file rather than copy-pasting from this guide, since the bridge owns the canonical implementation and this guide does not.

If you build a non-Slack bridge in another language, the wire contract is:

- Header: `X-Harness-Signature: sha256=<lowercase-hex-digest>`
- Body: the raw request body (do **not** reparse before computing the digest)
- Secret: the `secret` field returned **once** from `POST /api/v1/webhooks`
- Comparison: constant-time / `timingSafeEqual`-style; reject pairs of unequal byte length before comparing

The orchestrator also includes `X-Harness-Delivery-Id` ([`packages/orchestrator/src/gateway/webhooks/delivery.ts:147`](../../packages/orchestrator/src/gateway/webhooks/delivery.ts)) — stable across retries of the same delivery — that you can use as a dedup key if your bridge needs exactly-once semantics.

## Troubleshooting

| Symptom                                                                              | Likely cause                                                                                                              | Fix                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/webhooks` returns `422 { error: "URL must use https" }`                | The URL you sent starts with `http://` (e.g. you copied the bridge's local URL instead of the tunnel URL).                | Re-read the tunnel-forwarder output; use the `https://` URL it printed.                                                                                                                                              |
| `POST /api/v1/webhooks` returns `422 { error: "URL must not target private…" }`      | The URL hostname matches `localhost`, `127.x.x.x`, `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `169.254.x.x`, or `*.local`. | The tunnel isn't pointing at a public hostname. For ngrok, look for the `Forwarding` line and copy the `*.ngrok-free.app` URL. For Tailscale, use the `*.ts.net` magicDNS name, not `100.x.y.z` directly.            |
| Bridge logs `webhook.signature.mismatch` (HTTP 401) on every delivery               | `HARNESS_WEBHOOK_SECRET` in `.env` doesn't match what the orchestrator generated for this subscription.                   | Re-read the **one-time** `secret` field from the `POST /api/v1/webhooks` response (you can't fetch it again). If you've lost it, `DELETE /api/v1/webhooks/<id>` and re-create the subscription, then update `.env`. |
| Orchestrator dashboard shows `status: failed, responseCode: 502` for every delivery  | The tunnel is up but the bridge isn't listening on the upstream port the tunnel forwards to (typo on the port).            | Confirm `npm start` is running. Check the tunnel's upstream: `cloudflared tunnel --url http://127.0.0.1:3000` ⇄ bridge `PORT=3000` (or whatever you set).                                                            |
| Delivery succeeds but you don't see a Slack message                                  | Bridge returned 200 but Slack rejected the post (bad channel ID, missing `chat:write`).                                   | Read the bridge log line `slack.postMessage.failed`. Common: `channel_not_found` → use the channel **ID** (`C…`), not the name. `not_authed` / `invalid_auth` → rotate `SLACK_BOT_TOKEN`.                            |
| ngrok URL rotated overnight; deliveries 502 ever since                               | Free-plan ngrok rotates URLs on restart. The orchestrator still has the old `*.ngrok-free.app` URL in its subscription.   | `DELETE /api/v1/webhooks/<id>` then re-register with the current ngrok URL, copy the fresh `secret` into `.env`, restart the bridge. Or use Cloudflare Tunnel / paid-ngrok for a stable hostname.                    |
| Cloudflare Tunnel: `cloudflared` exits with `error connecting to origin`             | The bridge isn't on `127.0.0.1:3000` (different port, not running, or bound to `0.0.0.0` and firewalled).                 | Run `curl -i http://127.0.0.1:3000/healthz` (or whatever the bridge exposes) directly from the tunnel host — it must succeed locally before `cloudflared` can forward.                                              |
| Tailscale: orchestrator on the same tailnet still gets `URL must not target private` | The orchestrator's `isPrivateHost` check rejected the address you used.                                                   | Use the magicDNS name (`<machine>.<tailnet>.ts.net`), not the `100.x.y.z` Tailscale IP and not `<machine>.local`.                                                                                                    |
| Delivery payload returns 413                                                         | Bridge body cap (default 1 MiB) exceeded.                                                                                 | Default cap is 1,048,576 bytes ([`packages/orchestrator/src/server/utils.ts:3`](../../packages/orchestrator/src/server/utils.ts)). Bump the bridge's `maxBodyBytes` if you genuinely need larger payloads.           |

## Security notes

- **The HMAC signature is the authentication boundary, not the tunnel.** Public tunnels (Cloudflare, ngrok) expose the bridge's URL to the internet. Anyone who guesses or learns the URL can POST to it. The bridge's only defense is rejecting requests whose `X-Harness-Signature` doesn't validate against the shared secret. **Do not skip signature verification under "but my URL is secret."** URL secrecy is broken (Phase 0 §156 explicitly rejected the URL-secrecy model).
- **Tailscale gives you peer authentication too, layered on top of HMAC.** Only signed-in tailnet members can resolve the magicDNS name, so an internet stranger cannot reach the bridge at all. HMAC verification is still required (and the bridge still enforces it) as defense-in-depth.
- **Cloudflare Tunnel optionally chains Cloudflare Access in front of the public hostname** for IP allowlisting / SSO before traffic reaches `cloudflared`. Useful when the bridge's audience is internal even though the URL is technically public.
- **Never commit `HARNESS_WEBHOOK_SECRET` or the tunnel-vendor auth tokens to git.** The bridge's `.env` is gitignored by default; keep it that way. If you leak a webhook secret, `DELETE /api/v1/webhooks/<id>` immediately and re-create the subscription — there is no rotation endpoint (Phase 0 §154).
- **Audit-log shape.** Every delivery attempt writes one row to the orchestrator's `webhook-queue.sqlite`. Failed deliveries persist the response body to the `lastError` column. If your bridge surfaces verbose error strings that embed bearer tokens (e.g. `@slack/web-api` does this in rare transport failures — see [the slack-bridge README "Verbatim Slack errors" note](../../examples/slack-echo-bridge/README.md)), those strings land on disk. Production bridges in regulated environments should redact `Bearer …` / `xoxb-…` substrings from their 502 response bodies.

## Next steps

- **Building a non-Slack bridge?** Re-use the wire contract: read [`examples/slack-echo-bridge/src/signer.ts`](../../examples/slack-echo-bridge/src/signer.ts) for HMAC, [`examples/slack-echo-bridge/src/webhook-handler.ts`](../../examples/slack-echo-bridge/src/webhook-handler.ts) for the HTTP shape, and the OpenAPI artifact at [`docs/api/openapi.yaml`](../api/openapi.yaml) for the orchestrator's full surface.
- **Production deployment?** If you're running the orchestrator in Docker behind a real reverse proxy (Caddy, nginx, Traefik), the tunnel pattern is unnecessary — that proxy gives you `https://` on a real hostname, and you set `HOST=0.0.0.0` so the orchestrator listens on the container's network namespace. See [Docker Deployment](docker.md) for the container setup. The tunnel patterns here are explicitly for the developer-machine + remote-counterpart case.
- **Operator runbook for the harness Gateway API?** See [ADR 0011](../knowledge/decisions/0011-orchestrator-gateway-api-contract.md) for the Gateway API design rationale and the long-form decision log.
