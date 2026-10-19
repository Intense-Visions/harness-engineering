---
schemaVersion: 1
module: 'packages/cli/src/design-pipeline/phases'
sourceHash: '4788df7179b849f0cd6ec9d7d712e8b60fc946e249961e214c3108b50729c8a6'
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
import { DesignPipelineContext, Verdict, newContext } from '../context.js'
import { VerifierRegistry } from '../registry.js'
import { runDetect } from './detect.js'
import { FixInput, runFix } from './fix.js'
import { resolveGraphDir } from '@harness-engineering/graph'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
