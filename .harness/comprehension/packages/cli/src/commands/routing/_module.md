---
schemaVersion: 1
module: 'packages/cli/src/commands/routing'
sourceHash: 'aa87bf5d4e0d7b789753cbcc23be858482d58bc8da9256e15b3dd1dcabc19e4b'
compiledAt: '2026-08-28T01:22:08.868Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'config.ts',
    'decisions.ts',
    'http-client.test.ts',
    'http-client.ts',
    'index.ts',
    'routing.test.ts',
    'status.ts',
    'telemetry.ts',
    'trace.ts',
  ]
---

## Summary

The routing module provides CLI observability into the orchestrator's backend-routing system via subcommands that query live routing state. It exports `createRoutingCommand`, which composes five subcommands (`config`, `decisions`, `status`, `trace`, `telemetry`) under a shared HTTP client. **Core responsibilities:** config displays active backends and resolved fallback chains (GET `/api/v1/routing/config`); decisions queries a ring buffer of recent routing decisions with AND-combined filters like `--skill`, `--mode`, `--backend`, `--last` (GET `/api/v1/routing/decisions`); HTTP layer provides shared helpers (`getJson`, `postJson`, `orchestratorBase`, `authHeader`) that handle auth tokens, base-URL resolution, and error translation. **UX pattern:** each subcommand supports both human-readable rendering (aligned columns, summarized use-cases) and `--json` passthrough for shell pipelines, with errors standardizing on three cases: status 0 (connection failure), 503 (legacy config—no BackendRouter), or other HTTP codes (logged as-is).

## Invariants

- orchestratorBase() defaults to http://127.0.0.1:8080 — only reads HARNESS_ORCHESTRATOR_URL env var; callers must not hardcode.
- authHeader() returns {} when HARNESS_API_TOKEN is unset — gracefully degrades; server must not require auth for public endpoints.
- fetch rejections map to status 0 — getJson/postJson catch rejections (e.g. ECONNREFUSED) separately from HTTP error statuses; status 0 is reserved for network I/O failures.
- Decisions filters are AND-combined — buildQuery joins skill + mode + backend + limit as query params; server interprets as intersection.
- Decisions endpoint returns newest-first — rendering assumes first item is most recent; --last <N> uses server-side limit, not client-side slicing.
- Empty-string 2xx responses parse as body: null — not body: {} or an error; renderHuman must check if (r.body) before access.
- Status 503 = missing BackendRouter — specific signal for legacy single-backend configs; distinct error message prevents user confusion with generic 503.
- renderHuman must handle zero-length collections — decisions buffer empty logs '(no decisions in buffer)'; resolved chains empty logs '(none)'.

## Interface Contract

```ts
export createRoutingCommand
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { ExitCode } from '../../utils/errors'
import { createConfigCommand } from './config'
import { createDecisionsCommand } from './decisions'
import { authHeader, getJson, orchestratorBase, postJson } from './http-client'
import { createStatusCommand } from './status'
import { createTelemetryCommand } from './telemetry'
import { createTraceCommand } from './trace'
import { CapabilityTier, RoutingDecision, RoutingStatus, RoutingTelemetry, RoutingUseCase } from '@harness-engineering/types'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
