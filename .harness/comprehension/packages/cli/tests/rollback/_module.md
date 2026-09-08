---
schemaVersion: 1
module: 'packages/cli/tests/rollback'
sourceHash: 'f7a462ec7499baa01d5152c95a67d9d8e06a6067d007886b76ef2a00004f0873'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'breadcrumb.test.ts',
    'compose.test.ts',
    'eval-gate.test.ts',
    'io-cov544b.test.ts',
    'io.test.ts',
    'sweep.test.ts',
    'workflow-yaml.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { HarnessConfig } from '../../src/config/schema'
import { ROLLBACK_EVENTS_FILE, appendRollbackEvent, linkRollbackEventToGraph } from '../../src/rollback/breadcrumb'
import { ROLLBACK_LABEL, buildRevertBody, composeRevertPr } from '../../src/rollback/compose'
import { isEvalArmEnabled, runEvalTriggerIfEnabled } from '../../src/rollback/eval-gate'
import { GitSeam, computeRevertDryRun, createNodeRollbackIO } from '../../src/rollback/io'
import { SweepSignalRule, createPrResolver, detectCrossing, parseWindow, pointsInWindow, runRollbackSweep, windowStart } from '../../src/rollback/sweep'
import { RollbackDecision } from '@harness-engineering/core'
import { SignalPoint } from '@harness-engineering/signals'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
```
