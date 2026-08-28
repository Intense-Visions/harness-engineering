---
schemaVersion: 1
module: 'packages/cli/tests/commands/notifications'
sourceHash: '50081c25f88be453bbc5fe2267c79ebfee7081d0880e4fd30f1c8e4bc27b43b1'
compiledAt: '2026-08-28T01:22:09.603Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['test.test.ts']
---

## Summary

This module tests the `runNotificationsTest` function, which validates notification sink configurations (currently Slack webhooks) and sends test events. The test suite covers configuration validation (ensuring sinks are defined), sink ID resolution, environment variable expansion for webhook URLs, and HTTP delivery verification via mocked fetch. Tests use temporary directories per test and mock globalThis.fetch to avoid network I/O.

## Invariants

- Configuration is read from harness.config.json in the provided basedir; missing sinks configuration returns an error
- Sink lookup is exact-match on sink ID only; no pattern matching or aliases; error lists available sink names
- Webhook URLs are indirected through environment variable names (webhookUrlEnv); missing env vars fail before dispatch
- Slack test events are POSTed as JSON with a text field containing 'Test' as the marker
- Function returns { ok: true } on success or { ok: false, error: string } on failure; callers key off the ok boolean
- Process environment (CLI_TEST_SLACK_URL) and temporary directories are cleaned up after each test to prevent cross-test pollution
- globalThis.fetch is the only outbound HTTP channel and must be mocked for test isolation
- wrap_response config field is supported on sinks but does not affect test delivery in the tested scenarios

## Interface Contract

```ts

```

## Dependency Slice

```
import from '../../../src/commands/notifications/test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
