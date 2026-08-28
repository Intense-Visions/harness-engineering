---
schemaVersion: 1
module: 'packages/cli/src/commands/notifications'
sourceHash: 'a69afb7ac89584f799729d53bc79d2b00c860ac0a36ced5a6623f6ebc6bb0e95'
compiledAt: '2026-08-28T01:22:08.849Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'test.ts']
---

## Summary

This module provides a CLI command for testing notification sink delivery. It's a thin integration layer between harness config, the `SinkRegistry` from orchestrator, and sink adapters (like Slack). The core entry point is `runNotificationsTest()`, which loads notification sinks from `harness.config.json`, builds a `SinkRegistry` from the config, looks up the named sink, generates a synthetic `notification.test` event with a unique ID, and delivers it through the sink's adapter, respecting the sink's `wrap_response` flag. The CLI wraps this as `harness notifications test <sink-id> [--message TEXT]` with JSON output support. It's designed as the operator's one-shot probe after config changes and as the phase-readiness gate for external test consumers.

## Invariants

- Config is required: must load successfully or fail with clear error; empty sinks list is invalid
- Sink lookup is strict: must exist by exact ID in registry; errors list available sinks for UX
- Registry lifecycle: must call .dispose() after use to clean up resources
- Event structure is fixed: type always notification.test; ID has evt\_ prefix + random hex; includes ISO timestamp and message
- Wrapping is configurable: payload is passed through wrapAsEnvelope() only if sink's wrap_response is true
- Delivery result is opaque: handler adapters define success/failure; CLI just passes through
- Exit codes are distinct: SUCCESS (0) on delivery, ERROR (1) on any failure—no partial success
- JSON output is self-contained: result object serializes independently; human output goes to logger

## Interface Contract

```ts
export createNotificationsCommand
export runNotificationsTest
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { ExitCode } from '../../utils/errors'
import { createNotificationsTestSubcommand } from './test'
import { loadNotificationsConfig } from '@harness-engineering/core'
import { SinkConfigError, SinkRegistry, wrapAsEnvelope } from '@harness-engineering/orchestrator'
import { GatewayEvent } from '@harness-engineering/types'
import { Command } from 'commander'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
```
