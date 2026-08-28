---
schemaVersion: 1
module: "packages/orchestrator/tests/server/routes"
sourceHash: "4790cc3b0d72dfe42bf99daa34cb771397720688bbdcdfd78036a2277a1e9994"
compiledAt: "2026-08-28T01:22:12.722Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["chat-proxy.test.ts", "interactions.test.ts", "local-model.test.ts", "plans.test.ts", "roadmap-actions.conflict.test.ts", "roadmap-actions.file-based.test.ts", "roadmap-actions.file-less-stub.test.ts", "sessions.test.ts", "streams.test.ts"]
---

## Summary

The `packages/orchestrator/tests/server/routes` module is a comprehensive test suite for HTTP route handlers that power the orchestrator's REST API. It covers ~7 major route handlers using in-memory HTTP test servers with vitest, validating the contract between frontend clients and backend services. Each test file creates mock servers, exercises routes with various inputs, and verifies HTTP status codes, response bodies, and side effects (file writes, state mutations). The suite uses temporary directories for file-based storage tests and mocks external dependencies like child processes and stream recorders. It's organized to mirror the source structure: one test file per route handler, with shared testing utilities for HTTP request/response handling and fixture data.

## Invariants

- Route handlers return boolean — All handler functions return true when they match and process a route, false otherwise, enabling route chaining and 404 fallbacks.
- Port binding strategy — Windows CI avoids EACCES errors by using server.listen(0, ...) to let the OS assign free ports, rather than random manual allocation in the 30000–50000 range.
- Chat proxy SSE contract — The proxy spawns the Claude CLI with --print, emits Server-Sent Events with content-type: text/event-stream, generates/resumes sessions via --session-id/--resume flags, and walks assistant content blocks (text, thinking, tool_use) into individual SSE events, finishing with [DONE].
- Interactions persist as file-backed queue — Interactions stored in InteractionQueue are accessed via GET /api/interactions (list) and PATCH /api/interactions/:id (update status); status field is strictly validated (enum: pending, resolved).
- Session files carry message history — Sessions stored in temp directories hold message arrays with role + content/blocks, timestamps, artifacts, and state; GET retrieves list, POST creates, PUT updates.
- Plans are write-once files — POST /api/plans accepts {filename, content} and writes to disk, returning 201; filename is required, omission returns 400.
- Streams are recorded via StreamRecorder interface — Tests mock a StreamRecorder with getManifest, getStream, startRecording, appendEvent, endRecording, and housekeeping methods; manifest carries issue/attempt/PR metadata and retention policy.
- Local model status endpoints are stateless — Routes return live probes (available flag, resolved model, configured/detected lists, lastError/warnings) via callback functions; no persistence, only reflection of runtime state.

## Interface Contract

```ts

```

## Dependency Slice

```
import { InteractionQueue } from '../../../src/core/interaction-queue'
import { StreamManifest, StreamRecorder } from '../../../src/core/stream-recorder'
import { handleChatProxyRoute } from '../../../src/server/routes/chat-proxy'
import { handleInteractionsRoute } from '../../../src/server/routes/interactions'
import { handleLocalModelRoute, handleLocalModelsRoute } from '../../../src/server/routes/local-model'
import { handlePlansRoute } from '../../../src/server/routes/plans'
import { handleRoadmapActionsRoute } from '../../../src/server/routes/roadmap-actions'
import { handleSessionsRoute } from '../../../src/server/routes/sessions'
import { handleStreamsRoute } from '../../../src/server/routes/streams'
import { LocalModelStatus, NamedLocalModelStatus } from '@harness-engineering/types'
import * as child_process from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as http from 'node:http'
import { AddressInfo } from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
