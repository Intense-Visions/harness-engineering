---
schemaVersion: 1
module: 'packages/cli/src/design-pipeline/phases'
sourceHash: '756d57a8eb0977fb9a92d64b98d6d4ae40583e6a78850c7a1302e1578c7f7d86'
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
export listMissingInputs
export probeGraphAvailable
export probeInputs
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
