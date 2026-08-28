---
schemaVersion: 1
module: 'packages/core/src/notifications'
sourceHash: '1463c9ad5253369886f975a39e32bc0927cd21ec16e04bb3247af4a259b2e488'
compiledAt: '2026-08-28T01:22:10.430Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['config-loader.ts', 'index.ts']
---

## Summary

The `packages/core/src/notifications` module exports a single function, `loadNotificationsConfig`, that bootstraps notifications routing by reading and validating a `notifications` section from `harness.config.json`. It returns a `Result<NotificationsConfig, Error>`: if the config file or `notifications` section is absent, it returns `Ok({ sinks: [] })` to enable incremental adoption; if present, it parses and validates against `NotificationsConfigSchema` (Zod). All errors—file I/O, JSON parse, validation—are captured and returned as `Err` with detailed field-path messages. Per Hermes Phase 3 spec D4, sink configuration lives in `harness.config.json` (not a separate file) because sinks hold no per-record secrets at rest; the secret is resolved from an env-var at runtime.

## Invariants

- Empty defaults on absence: missing config file or missing notifications section must return Ok({ sinks: [] }) — any project without explicit config still has a valid, empty notifications state.
- Schema is the contract: all incoming notifications config must pass NotificationsConfigSchema.safeParse() — invalid config is rejected, never partially accepted.
- Detailed validation errors: when schema validation fails, error messages must include the field path and Zod's validation reason, one per line — callers need to know exactly what to fix.
- Result pattern enforced: the function always returns Result<NotificationsConfig, Error> — callers are forced to pattern-match on Ok/Err, preventing silent config failures.
- One-time load: this is a bootstrap function, not a live config reloader — the result is expected to be cached at initialization, not polled repeatedly.

## Interface Contract

```ts
export loadNotificationsConfig
```

## Dependency Slice

```
import { Err, Ok, Result } from '../shared/result'
import { NotificationsConfig, NotificationsConfigSchema } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
