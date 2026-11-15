---
schemaVersion: 1
module: 'packages/cli/src/design-pipeline'
sourceHash: '0f953f17c51ef1a2ca3a9fac9837212c18ea029aa3aa14d854eecb89f91c1771'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['context.ts', 'index.ts', 'registry.ts', 'serialize.ts']
---

## Interface Contract

```ts
export CI_OPTION_DEPRECATION
export DesignPipelineContext
export FixStopReason
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
import { listMissingInputs, probeGraphAvailable, probeInputs, runFreshen } from './phases/freshen.js'
import { runReport } from './phases/report.js'
import { VerifierRegistry } from './registry.js'
```
