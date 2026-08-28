---
schemaVersion: 1
module: 'examples/slack-echo-bridge'
sourceHash: '35f77d9e52dfd1adeba844e006694b643c279a1013df359603952593dc11b5c0'
compiledAt: '2026-08-28T01:22:08.601Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['vitest.config.ts']
---

## Summary

**slack-echo-bridge** is a reference Node.js consumer for Harness Gateway API webhooks. It runs a minimal HTTP server that receives maintenance-completed events from the orchestrator, verifies HMAC-SHA256 signatures, and posts summaries to Slack. The bridge demonstrates secure webhook ingestion: signature verification using raw request bytes, environment-based configuration with fail-closed validation, graceful shutdown, and size-limiting to prevent DoS. The module is designed as a portable example — types are intentionally duplicated from the source so external engineers can install and run the bridge in isolation without access to the full harness codebase.

## Invariants

- Raw bytes for HMAC: Signature verification must use the verbatim request body buffer, not parsed JSON. Whitespace and key-order changes during JSON round-trips break the HMAC.
- Secrets are one-time and unlogged: The webhook secret is captured from environment once at boot and never logged or re-issued. Missing secrets cause immediate exit(1).
- Signature format is 'sha256=<hex>': Header X-Harness-Signature contains the scheme prefix; verification rejects signatures without it.
- Type definitions are standalone: Interfaces (GatewayEvent, MaintenanceCompletedData) are duplicated from packages/orchestrator/src/ and intentionally NOT imported, so the bridge works without harness-engineering source in scope.
- POST-only on specific path: Requests with wrong method or path get 404. Default path is /webhooks/maintenance-completed (configurable).
- Body size-capped (default 1 MiB): Oversized payloads return 413 without buffering the excess into memory.
- Event-type filtering: Only maintenance.completed events are processed; others get 400. Unknown event types are safely rejected.
- Slack failures are 502 (retryable): Slack delivery errors return 502 so the orchestrator retries. Signature mismatches or parse errors return 401/400 (non-retryable).
- Graceful shutdown with timeout: SIGTERM/SIGINT stops accepting new connections, waits ≤5s for in-flight requests to drain, then exits 0. Timeout forces exit 1.
- Config fail-closed at boot: All required environment variables (HARNESS_WEBHOOK_SECRET, SLACK_BOT_TOKEN, SLACK_CHANNEL) are validated before the server listens. Missing vars trigger immediate stderr write + exit(1).
- Slack poster is a test seam: The SlackPoster interface decouples handler logic from @slack/web-api internals, allowing webhook-handler tests to mock Slack independently.
- Timing-safe signature comparison: Uses crypto.timingSafeEqual to defend against timing attacks; handles length mismatches before comparing.

## Interface Contract

```ts
export default
```

## Dependency Slice

```
import { defineConfig } from 'vitest/config'
```
