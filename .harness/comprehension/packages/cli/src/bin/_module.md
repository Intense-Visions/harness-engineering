---
schemaVersion: 1
module: 'packages/cli/src/bin'
sourceHash: 'b3912960ce0ec9aa7a07967fd64a32a5f37383634b1b328cd0a2345562a003c4'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'blocking-stdio.ts',
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
export makeStdioPipesBlocking
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
import { installErrorJsonSerialization } from '../output/error-json'
import { getFreshnessNotification, isFreshnessCheckEnabled, readFreshnessState, shouldRunFreshnessCheck, spawnBackgroundFreshnessCheck } from '../registry/freshness-checker'
import { SessionDispatchResult, formatDispatchBanner, sessionStartDispatch } from '../skill/dispatch-session'
import { printFirstRunWelcome } from '../utils/first-run'
import { resolveGlobalCommunityBaseDir, resolveGlobalSkillsDir } from '../utils/paths'
import { CLI_VERSION } from '../version'
import { makeStdioPipesBlocking } from './blocking-stdio'
import { installCommandTelemetry } from './command-telemetry'
import { printFreshnessNotification, runFreshnessCheckAtStartup } from './freshness-check-hooks'
import { DEFAULT_INTERVAL_MS, printUpdateNotification, readConfigInterval, runUpdateCheckAtStartup } from './update-check-hooks'
import { getUpdateNotification, isUpdateCheckEnabled, readCheckState, shouldRunCheck, spawnBackgroundCheck } from '@harness-engineering/core'
import { Command } from 'commander'
import 'dotenv/config'
import * as fs from 'fs'
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parsePath, resolve } from 'node:path'
import * as path from 'path'
```
