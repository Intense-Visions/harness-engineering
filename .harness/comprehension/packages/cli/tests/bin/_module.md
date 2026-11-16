---
schemaVersion: 1
module: 'packages/cli/tests/bin'
sourceHash: '93bc4b4b88c7e242416168b8db7ea360216f7d8ec1d73f59172f0f7bbe7c97d4'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'blocking-stdio.test.ts',
    'command-telemetry.test.ts',
    'first-run-integration.test.ts',
    'freshness-check-hooks.test.ts',
    'harness-update-check.test.ts',
    'update-check-hooks.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { makeStdioPipesBlocking } from '../../src/bin/blocking-stdio'
import { _findProjectRoot, _flushTelemetryBackground, _resetForTest, _resolveCommandName, _writeCommandRecordSync, installCommandTelemetry, truncateAdoptionFile } from '../../src/bin/command-telemetry'
import { printFreshnessNotification, runFreshnessCheckAtStartup } from '../../src/bin/freshness-check-hooks'
import '../../src/bin/harness'
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
