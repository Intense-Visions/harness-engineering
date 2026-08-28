---
schemaVersion: 1
module: 'packages/cli/src/commands/gateway'
sourceHash: '0caac9ecbe70929ea3de226328b419be95f796f5d859eca93f70f96cc4fab409'
compiledAt: '2026-08-28T01:22:08.816Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['deliveries.test.ts', 'deliveries.ts', 'index.ts', 'token.test.ts', 'token.ts']
---

## Summary

The gateway command is a CLI module that exposes webhook queue and token management via direct SQLite operations, decoupled from the orchestrator's HTTP API. It wraps WebhookQueue and token store primitives with commander-based subcommands for deliveries (list, retry, purge) and tokens (create, list, revoke). The implementation exports thin runner functions as testable wrappers over the underlying queue API; this allows both tests to lock the CLI shape and ops to recover a dead orchestrator by manipulating the queue directly when the HTTP API is unavailable.

## Invariants

- Queue path resolution is orchestrator-aligned: HARNESS_WEBHOOK_QUEUE_PATH env var or .harness/webhook-queue.sqlite relative to CWD. Divergence silently operates on wrong data.
- Purge requires at least one explicit filter (--dead-only, --older-than, or --all). Unbounded purge is rejected with exit code 1. Critical safety rail preventing silent bulk deletion.
- TTY confirmation is mandatory before deletion: when run on a TTY, ttyPurgeConfirm prompts yes/no and passes confirm callback to runner. Non-TTY scripts omit the prompt. Prevents accidental bulk deletes in manual ops.
- Runner functions (runDeliveriesList, runDeliveriesRetry, runDeliveriesPurge) are thin wrappers exported for testability. Tests drive queue operations without parsing commander args, locking the shape against silent drift.
- Direct SQLite access bypasses the orchestrator's HTTP API intentionally. This is the ops recovery path when orchestrator is down—CLI must work on raw .sqlite file without auth/routing layers.

## Interface Contract

```ts
export createGatewayCommand
```

## Dependency Slice

```
import { createDeliveriesCommand, runDeliveriesList, runDeliveriesPurge, runDeliveriesRetry } from './deliveries'
import { createTokenCommand, runTokenCreate, runTokenList, runTokenRevoke } from './token'
import { MAX_ATTEMPTS, QueueRow, TokenStore, WebhookQueue } from '@harness-engineering/orchestrator'
import { TokenScope } from '@harness-engineering/types'
import { Command } from 'commander'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
