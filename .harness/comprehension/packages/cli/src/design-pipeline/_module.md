---
schemaVersion: 1
module: 'packages/cli/src/design-pipeline'
sourceHash: 'c30775bac53e39552034a1bf94c00683576fe956e82360628a88569b28adc4ca'
compiledAt: '2026-08-28T01:22:09.117Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['context.ts', 'index.ts', 'registry.ts']
---

## Interface Contract

```ts
export DesignPipelineContext
export Verdict
export runDesignPipeline
```

## Dependency Slice

```
import { FixOutcome } from '../align/findings/outcome.js'
import { AnatomyFinding } from '../audit/component-anatomy/findings/finding.js'
import { BrandFinding } from '../brand/findings/finding.js'
import { CraftFinding } from '../design-craft/findings/schema.js'
import { DriftFinding } from '../drift/findings/finding.js'
import { runAnatomyAudit } from '../mcp/tools/audit-anatomy.js'
import { runAuditBrand } from '../mcp/tools/audit-brand.js'
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { Verifier } from '../shared/verifier.js'
import { DesignPipelineContext, newContext } from './context.js'
import { runAudit } from './phases/audit.js'
import { runDetect } from './phases/detect.js'
import { runFill } from './phases/fill.js'
import { runFix } from './phases/fix.js'
import { runFreshen } from './phases/freshen.js'
import { runReport } from './phases/report.js'
import { VerifierRegistry } from './registry.js'
```
