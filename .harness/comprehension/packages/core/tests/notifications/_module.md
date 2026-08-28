---
schemaVersion: 1
module: 'packages/core/tests/notifications'
sourceHash: 'a0a1c8fde31bd60cb1438b3c8af0eeeafbe11d9bf1f2b4ef97d88b63b8409921'
compiledAt: '2026-08-28T01:22:10.870Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['config-loader.test.ts']
---

## Summary

`config-loader.test.ts` validates that `loadNotificationsConfig()` correctly parses notification sink definitions from `harness.config.json`. It exercises the happy path (valid config with slack sink), graceful degradation (missing file/section → empty sinks), and error handling (schema violations, malformed JSON). The test suite uses temporary directories to isolate each case and verifies that schema errors include operator-friendly path info (`notifications.sinks.0.id` format) rather than opaque messages.

## Invariants

- Result monad contract: loadNotificationsConfig() returns {ok: boolean, value?, error?} (never throws)
- Defensive defaults: Missing config file or absent notifications section both yield {ok: true, value: {sinks: []}}
- Schema-aware parsing: Malformed JSON and type violations (e.g., ID not kebab-case) both return {ok: false} with error containing dotted field path
- Sink shape invariant: Each sink carries id (required, kebab-case), kind, events[], optional wrap_response, and config object; violations fail schema validation
- Cleanup responsibility: Tests create temp directories but afterEach cleanup is load-bearing; tests fail silently without it

## Interface Contract

```ts

```

## Dependency Slice

```
import { loadNotificationsConfig } from '../../src/notifications/config-loader'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
