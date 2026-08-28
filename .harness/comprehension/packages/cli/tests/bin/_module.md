---
schemaVersion: 1
module: 'packages/cli/tests/bin'
sourceHash: '1b218ebaa635e12b3ab750c2fc2356fe45d6aa3cc641c1870c2482031361d90a'
compiledAt: '2026-08-28T01:22:09.576Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'command-telemetry.test.ts',
    'first-run-integration.test.ts',
    'freshness-check-hooks.test.ts',
    'harness-update-check.test.ts',
    'update-check-hooks.test.ts',
  ]
---

## Summary

**packages/cli/tests/bin** validates the CLI's command telemetry instrumentation—the plumbing that records which harness subcommands users run, how long they take, and whether they succeed. The suite tests command name resolution (converting nested commander.js subcommands into dotted telemetry identifiers like `cli/validate`, `cli/hooks.init`), project root discovery (walking up to `harness.config.json`), JSONL record writing to `.harness/metrics/adoption.jsonl`, telemetry opt-out gates (`DO_NOT_TRACK`, `HARNESS_TELEMETRY_OPTOUT`, config-level disable), background flushing of buffered telemetry via subprocess, and hook integration into commander's lifecycle. Tests are hermetic (isolated temp directories) and handle edge cases like write permission failures gracefully.

## Invariants

- Command name resolution uses actionCommand, not thisCommand — preAction must resolve the actually-executed subcommand, not the root program, or adoption records vanish
- Root 'harness' command maps to empty string — \_resolveCommandName(program) returns '' for the root, so telemetry distinguishes 'harness' alone from 'harness validate'
- Variant field is optional — records omit variant unless explicitly passed; downstream code treats absence as 'not recorded' not null
- JSONL is append-only within a session — records concatenate; truncateAdoptionFile() happens between sessions only
- Multiple opt-out signals abort silently — DO_NOT_TRACK, HARNESS_TELEMETRY_OPTOUT, and config telemetry.enabled:false each independently skip flush with no error thrown
- Reporter script existence gates flush — spawning the background process only happens if the reporter binary exists at expected path; missing file silently skips, no fallback
- Session IDs are deterministic — format is cli-<epoch-ms>, stable within single CLI invocation for batch attribution
- Write errors are silently handled — \_writeCommandRecordSync does not throw on permission/path errors, adoption file absence, or directory creation failure

## Interface Contract

```ts

```

## Dependency Slice

```
import { _findProjectRoot, _flushTelemetryBackground, _resetForTest, _resolveCommandName, _writeCommandRecordSync, installCommandTelemetry, truncateAdoptionFile } from '../../src/bin/command-telemetry'
import { printFreshnessNotification, runFreshnessCheckAtStartup } from '../../src/bin/freshness-check-hooks'
import from '../../src/bin/harness'
import { _resetConfigCache, printUpdateNotification, runUpdateCheckAtStartup } from '../../src/bin/update-check-hooks'
import { findConfigFile, loadConfig } from '../../src/config/loader'
import { printFirstRunWelcome } from '../../src/utils/first-run'
import { CLI_VERSION } from '../../src/version'
import { getUpdateNotification, isUpdateCheckEnabled, readCheckState, shouldRunCheck, spawnBackgroundCheck } from '@harness-engineering/core'
import { Command } from 'commander'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
