---
schemaVersion: 1
module: 'packages/core/tests/update-checker'
sourceHash: '7e06ea866e1f5f315378097b38800a5a86bc4cbea89f43fbb66746b08845faa9'
compiledAt: '2026-08-28T01:22:11.116Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['update-checker-edge-cases.test.ts', 'update-checker.test.ts']
---

## Summary

The `update-checker` test suite validates a background update-notification system. It exports five core functions: `isUpdateCheckEnabled()` (respects `HARNESS_NO_UPDATE_CHECK` env var and config intervals), `shouldRunCheck()` (throttles by elapsed time), `readCheckState()` (parses `~/.harness/update-check.json` with strict type validation), `invalidateCheckState()` (clears state), and `spawnBackgroundCheck()` (spawns a background subprocess to check for new versions). The module is designed for resilience: file reads never throw (return null on any corruption), directory paths are created atomically, and subprocess failures are swallowed. State is serialized in a JSON file at `~/.harness/update-check.json` with fields `{ lastCheckTime, latestVersion, currentVersion }`.

## Invariants

- readCheckState() never throws for any file content (missing directory, missing file, empty, truncated JSON, binary, wrong type, nested wrong types) — always returns null | UpdateCheckState
- Type safety on deserialization: lastCheckTime must be number, currentVersion must be string; arrays, strings, and primitives are rejected; non-string latestVersion normalizes to null
- spawnBackgroundCheck() inline script uses renameSync with crypto.randomBytes-derived temp filename for atomic writes; missing ~/.harness/ created via mkdirSync(recursive: true)
- HARNESS_NO_UPDATE_CHECK=1 or zero/missing config interval fully disables checks
- Interval-based throttling: check runs only when lastCheckTime + interval ≤ Date.now() (boundary inclusive); null state always triggers check
- Spawn failure (ENOENT, etc.) is caught internally and never propagates to callers

## Interface Contract

```ts

```

## Dependency Slice

```
import { UpdateCheckState, getUpdateNotification, invalidateCheckState, isUpdateCheckEnabled, readCheckState, shouldRunCheck, spawnBackgroundCheck } from '../../src/update-checker'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
