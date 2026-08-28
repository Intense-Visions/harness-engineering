---
schemaVersion: 1
module: 'packages/cli/src/bin'
sourceHash: '7dfc1bae072df428d6871fa8df0e7ef09572d18e644a7aadfce08fdc8debd0e5'
compiledAt: '2026-08-28T01:22:08.743Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'command-telemetry.ts',
    'freshness-check-hooks.ts',
    'harness-mcp.ts',
    'harness.ts',
    'update-check-hooks.ts',
  ]
---

## Summary

The `packages/cli/src/bin` module is the CLI entry point orchestrating startup, command telemetry, and background checks across five files. **harness.ts** runs the main sequence: first-run welcome → background version/freshness checks (fire-and-forget) → program creation → telemetry installation → parseAsync → notifications. Notifications skip the `update` subcommand to avoid stale-cache contradictions. **command-telemetry.ts** records every CLI invocation to `.harness/metrics/adoption.jsonl` in adoption-tracker format, capturing command name (e.g., `cli/validate.affected`), duration, and outcome. Records persist synchronously on process exit and can be opted out via config or environment variables. **update-check-hooks.ts** spawns a background version check against npm (gated by `updateCheckInterval` config and 24h default), printing notifications to stderr if an upgrade is available. **freshness-check-hooks.ts** checks if skill providers (`skills-lock.json`) have newer versions using the same interval config. **harness-mcp.ts** is a separate entry point for the MCP server. The design enforces silent telemetry—all observability code catches errors internally and never blocks; background processes are fully detached.

## Invariants

- Telemetry must never crash the CLI — all observability code silently catches errors; missing adoption.jsonl is not an error
- Background checks are fully detached — spawned with detached:true and unref(), stdio ignored, never block parseAsync
- Command telemetry survives process.exit() — recorded synchronously in exit handler so it persists even on early termination
- Adoption records append (not overwrite) — appendFileSync preserves history; truncation happens only on successful flush
- Project root found by config file walk, not PWD — finds harness.config.json walking up from cwd, enabling repo-relative metrics storage
- Config intervals cached per process — readConfigInterval() caches after first call; subsequent calls return cached value without I/O
- Telemetry can be globally disabled — via harness.config.json telemetry.enabled:false or env DO_NOT_TRACK=1 / HARNESS_TELEMETRY_OPTOUT=1
- Command variants are additive and scoped — only cli/validate carries variants (affected vs full); undefined for all other commands to avoid spurious fields
- Excluded commands skip telemetry — help and completion not recorded (too noisy, meta)
- Startup sequence is strictly ordered — first-run welcome before all else, notifications after parseAsync, update subcommand skips notifications to avoid contradictions
- Session-start dispatch is non-blocking — fire-and-forget promise; banner prints after parseAsync regardless of dispatch result
- Freshness checks require at least one lockfile — early return if no global/project skills-lock.json exists
- PostHog API key is hardcoded and safe — public write-only ingest key (no data reads possible), marked SEC-SEC-002 exception

## Interface Contract

```ts
export DEFAULT_INTERVAL_MS
export POSTHOG_API_KEY
export _findProjectRoot
export _flushTelemetryBackground
export _resetConfigCache
export _resetForTest
export _resolveCommandName
export _writeCommandRecordSync
export installCommandTelemetry
export printFreshnessNotification
export printUpdateNotification
export readConfigInterval
export runFreshnessCheckAtStartup
export runUpdateCheckAtStartup
export truncateAdoptionFile
```

## Dependency Slice

```
import { findConfigFile, loadConfig } from '../config/loader'
import { createProgram, handleError } from '../index'
import { startServer } from '../mcp/index.js'
import { getFreshnessNotification, isFreshnessCheckEnabled, readFreshnessState, shouldRunFreshnessCheck, spawnBackgroundFreshnessCheck } from '../registry/freshness-checker'
import { SessionDispatchResult, formatDispatchBanner, sessionStartDispatch } from '../skill/dispatch-session'
import { printFirstRunWelcome } from '../utils/first-run'
import { resolveGlobalCommunityBaseDir, resolveGlobalSkillsDir } from '../utils/paths'
import { CLI_VERSION } from '../version'
import { installCommandTelemetry } from './command-telemetry'
import { printFreshnessNotification, runFreshnessCheckAtStartup } from './freshness-check-hooks'
import { DEFAULT_INTERVAL_MS, printUpdateNotification, readConfigInterval, runUpdateCheckAtStartup } from './update-check-hooks'
import { getUpdateNotification, isUpdateCheckEnabled, readCheckState, shouldRunCheck, spawnBackgroundCheck } from '@harness-engineering/core'
import { Command } from 'commander'
import from 'dotenv/config'
import * as fs from 'fs'
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, parsePath, resolve } from 'node:path'
import * as path from 'path'
```
