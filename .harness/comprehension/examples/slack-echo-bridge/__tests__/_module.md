---
schemaVersion: 1
module: 'examples/slack-echo-bridge/__tests__'
sourceHash: 'add282a2ac9bdfffa1ff3c7b601f4ee98c279a11a8f5ceb09badac364ecb8dbb'
compiledAt: '2026-08-28T01:22:08.615Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['fixtures.ts', 'signer.test.ts', 'webhook-handler.test.ts']
---

## Summary

The `__tests__` module exercises the webhook-receiver half of a Slack notification bridge that listens for orchestrator `maintenance.completed` events, verifies their HMAC-SHA256 signatures, and posts formatted status updates to Slack. The suite covers three layers: **fixtures** (reusable test data and signing helpers), **signer verification** (HMAC validation edge cases including malformed headers and tampered payloads), and **webhook-handler integration** (HTTP server behavior across happy and sad paths—valid signatures, size caps, JSON parse errors, Slack delivery failures, and graceful shutdown). A key regression guard uses deliberately non-zero fixture counts (findings: 3, fixed: 1) to catch type-safety bugs where these were mistakenly declared or treated as arrays rather than numbers.

## Invariants

- Fixture counts are non-zero and load-bearing: findings: 3 and fixed: 1 are intentional to catch regressions where the pipeline or Slack rendering would silently default these to 0.
- Signature verification is fail-closed and silent: invalid or missing signatures must reject the request (401) without calling Slack, preventing unwanted notifications on tampering.
- Length-guarded before timing-safe compare: verify() must catch length mismatches and return false without throwing, since timingSafeEqual itself would throw on mismatches.
- Payload size cap fires before cryptographic work: the size check must occur in readBody() before signature verification or JSON parsing to fail fast (413) without burning CPU.
- Type safety on findings/fixed fields: these must remain numeric throughout the wire shape → rendering path; any regression to array types or .length calls will fail the rendered-text assertion.
- Shutdown handlers cover both SIGTERM and SIGINT: both signals must trigger server.close() followed by process.exit() with a forced-exit timeout to prevent hangs.
- Unrelated paths are silent 404s: requests outside /webhooks/maintenance-completed must not trigger Slack calls or consume validation resources.

## Interface Contract

```ts
export TEST_SECRET
export makeMaintenanceCompletedEvent
export signBody
```

## Dependency Slice

```
import { verify } from '../src/signer.js'
import { SlackPoster } from '../src/slack-client.js'
import { GatewayEvent, MaintenanceCompletedData } from '../src/types.js'
import { createWebhookServer, installShutdownHandlers } from '../src/webhook-handler.js'
import { TEST_SECRET, makeMaintenanceCompletedEvent, signBody } from './fixtures.js'
import { createHmac } from 'node:crypto'
import { Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
