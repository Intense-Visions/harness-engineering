---
schemaVersion: 1
module: 'examples/slack-echo-bridge/src'
sourceHash: '869a0cb66dc4c223e3fd29eff5fa463152bce38f5c2636d69ab23b79034d2c1e'
compiledAt: '2026-08-28T01:22:08.623Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'logger.ts', 'signer.ts', 'slack-client.ts', 'types.ts', 'webhook-handler.ts']
---

## Summary

`examples/slack-echo-bridge/src` is a teaching reference webhook consumer that receives maintenance-task events from the Harness orchestrator, verifies their authenticity via HMAC SHA-256, and posts results to Slack. The module is intentionally minimal—no logging framework, no abstractions beyond what's needed—to demonstrate the wire-contract discipline and webhook-consumer patterns that external authors should adopt. The flow is: env-var validation → HTTP server init → per-request signature verification → Slack dispatch with structured logging.

## Invariants

- Raw request body must be preserved verbatim for HMAC verification; no JSON parse→stringify round-trips allowed as whitespace and key-order affect the signature
- Signature verification must use timing-safe comparison (timingSafeEqual) with length check before comparison to prevent timing attacks and TypeError leakage
- All required environment variables (HARNESS_WEBHOOK_SECRET, SLACK_BOT_TOKEN, SLACK_CHANNEL) must be validated at boot; missing values cause immediate exit(1)
- PORT must be a valid integer between 1–65535; invalid values cause boot failure, not silent fallback
- Request body size is capped at 1 MiB by default; oversized payloads return HTTP 413 and halt accumulation to prevent memory exhaustion
- Wire-contract types are intentionally duplicated (not imported) to prove the contract is self-contained for external consumers without harness source access
- Slack errors surface verbatim with no translation layer; the orchestrator decides retry logic based on raw error codes
- SlackPoster acts as a seam between HTTP handler and Slack SDK; tests mock the poster to keep handler logic independent of @slack/web-api internals
- Graceful shutdown must allow in-flight handlers to complete with a configurable timeout (default 5 seconds); SIGTERM/SIGINT wiring is the caller's responsibility
- JSON-line logging is mandatory (level, event, timestamp, fields); this discipline is part of the teaching contract
- Only POST to the configured path (default /webhooks/maintenance-completed) is handled; other methods and paths return 404
- Delivery ID is extracted from the request and threaded through all log records to enable tracing a single delivery across handler steps

## Interface Contract

```ts

```

## Dependency Slice

```
import { log } from './logger.js'
import { verify } from './signer.js'
import { SlackPoster, createSlackPoster } from './slack-client.js'
import { GatewayEvent, MaintenanceCompletedData } from './types.js'
import { createWebhookServer, installShutdownHandlers } from './webhook-handler.js'
import { WebClient } from '@slack/web-api'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { IncomingMessage, Server, ServerResponse, createNodeServer } from 'node:http'
```
