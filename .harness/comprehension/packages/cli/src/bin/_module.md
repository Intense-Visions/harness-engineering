---
schemaVersion: 1
module: 'packages/cli/src/bin'
sourceHash: '7dfc1bae072df428d6871fa8df0e7ef09572d18e644a7aadfce08fdc8debd0e5'
compiledAt: '2026-08-28T01:22:08.743Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'command-telemetry.ts',
    'freshness-check-hooks.ts',
    'harness-mcp.ts',
    'harness.ts',
    'update-check-hooks.ts',
  ]
---

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
