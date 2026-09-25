---
schemaVersion: 1
module: 'packages/cli/tests/shared'
sourceHash: 'f3432c8399ba21d2c113bdd618c07502d8d332d41988914a0a852892b354762f'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['design-scan-targets.test.ts', 'state-events.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runAuditBrand } from '../../src/brand'
import { runDetectDrift } from '../../src/drift'
import { runAudit } from '../../src/mcp/tools/audit-anatomy'
import { DESIGN_SCAN_EXTENSIONS, collectDesignScanFiles, resolveDesignExcludePatterns } from '../../src/shared/design-scan-targets'
import { emitApprovalRequested, emitApprovalResolved, emitCoreEvent, emitUserInputCaptured, readAuditTimeline, readHarnessState } from '../../src/shared/state-events'
import { HarnessState, eventSourcing } from '@harness-engineering/core'
import * as fs from 'fs'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
