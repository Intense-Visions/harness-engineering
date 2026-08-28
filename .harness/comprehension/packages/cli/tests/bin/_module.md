---
schemaVersion: 1
module: 'packages/cli/tests/bin'
sourceHash: '1b218ebaa635e12b3ab750c2fc2356fe45d6aa3cc641c1870c2482031361d90a'
compiledAt: '2026-08-28T01:22:09.576Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
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
