---
schemaVersion: 1
module: 'packages/cli/src/git'
sourceHash: '367eae2528d88eedcdd43def664d3acfebc061f75afe71fb854dc95647634cbb'
compiledAt: '2026-08-29T15:37:24.197Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'comprehension-merge-driver.test.ts',
    'comprehension-merge-driver.ts',
    'merge-driver-setup.test.ts',
    'merge-driver-setup.ts',
  ]
---

## Interface Contract

```ts
export COMPREHENSION_MERGE_DRIVER_COMMAND
export configureComprehensionMergeDriver
export configureMergeOursDriver
export defaultGitRunner
export moduleFromShardPath
export runComprehensionMergeDriver
```

## Dependency Slice

```
import { MergeDriverIO, moduleFromShardPath, runComprehensionMergeDriver } from './comprehension-merge-driver'
import { COMPREHENSION_MERGE_DRIVER_COMMAND, configureComprehensionMergeDriver, configureMergeOursDriver } from './merge-driver-setup'
import { COMPREHENSION_ROOT, ComprehensionSourceFile, ExtractStatic, GenerateSemantic, compileModule, parseUnit, serializeUnit, serveGate } from '@harness-engineering/core'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
```
