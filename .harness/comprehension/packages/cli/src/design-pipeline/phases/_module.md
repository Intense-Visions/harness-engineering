---
schemaVersion: 1
module: 'packages/cli/src/design-pipeline/phases'
sourceHash: 'e49972148dd36c39a78dd2e5ab203f321c51057ee2c10a0c5a92be8f29508bbb'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'audit.ts',
    'detect.test.ts',
    'detect.ts',
    'fill.ts',
    'fix.test.ts',
    'fix.ts',
    'freshen.ts',
    'report.ts',
  ]
---

## Interface Contract

```ts
export probeGraphAvailable
export runAudit
export runDetect
export runFill
export runFix
export runFreshen
export runReport
```

## Dependency Slice

```
import { AnatomyFinding } from '../../audit/component-anatomy/findings/finding.js'
import { BrandFinding } from '../../brand/findings/finding.js'
import { DriftFinding } from '../../drift/findings/finding.js'
import { runAlignDesignSystem } from '../../mcp/tools/align-design-system.js'
import { runDesignCraft } from '../../mcp/tools/design-craft.js'
import { runDetectDrift } from '../../mcp/tools/detect-drift.js'
import { DesignPipelineContext, FixStopReason, Verdict, newContext } from '../context.js'
import { VerifierRegistry } from '../registry.js'
import { runDetect } from './detect.js'
import { FixInput, runFix } from './fix.js'
import { resolveGraphDir } from '@harness-engineering/graph'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
