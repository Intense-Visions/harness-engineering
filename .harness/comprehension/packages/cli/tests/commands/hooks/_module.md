---
schemaVersion: 1
module: 'packages/cli/tests/commands/hooks'
sourceHash: '516c9bf9674e699bc3740bb3c454c6c8b7fb1c4f9cc63218daea0eabd2e59b89'
compiledAt: '2026-08-28T01:22:09.601Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['run.test.ts']
---

## Summary

**Run** tests the `harness hooks run <name> [payload]` CLI command, which invokes registered hook handlers with optional JSON payloads. The module verifies a fail-soft seam: hook names are parsed and delegated, but the command always exits 0 regardless of whether the hook exists or the payload is valid. It also tests the optional archival path—when `HARNESS_SESSION_RETROSPECTION=1` is set, the hook delegates to a shared archive seam that writes a per-thread sentinel file. Tests mock the archive and orchestrator packages so they run in-process without sqlite or a real build, verifying the parse→delegate→archive chain fires.

## Invariants

- Always exit 0: runHook() returns 0 for all paths (unknown hook, malformed payload, missing payload, valid execution) — fail-soft design prevents hook failures from surfacing to callers
- Object.hasOwn guard: Prototype names (toString, constructor, hasOwnProperty) must be rejected as unknown hooks, never delegated, and never reach the archive seam
- Parse before delegate: JSON payload is parsed before reaching retrospectSession, so the parsed object (not raw string) proves correct wiring
- Sentinel per thread-id: When archiving succeeds, .harness/state/retrospection/<thread-id>.archived is written — proves both parsing captured the thread-id and that archive call succeeded
- No cross-test pollution: HARNESS_SESSION_RETROSPECTION flag is saved before each test and restored after, so opt-in cases don't leak
- Graceful degradation: Malformed JSON, missing payload, and disabled retrospection all return 0 without error; no sentinel written when flag is unset
- Command shape: createRunCommand() produces a Commander.js Command named 'run' with required <name> argument and optional [payload] argument

## Interface Contract

```ts

```

## Dependency Slice

```
import { createRunCommand, runHook } from '../../../src/commands/hooks/run'
import { Command } from 'commander'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
