---
schemaVersion: 1
module: 'packages/cli/tests/shared'
sourceHash: '5ac6d4bbcc4d71d190c84bc86fba6017769b963e0b8c7fddeb3a40b43b3964b2'
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
import { DESIGN_SCAN_EXTENSIONS, collectDesignScanFiles, isExcluded, resolveDesignExcludePatterns } from '../../src/shared/design-scan-targets'
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
