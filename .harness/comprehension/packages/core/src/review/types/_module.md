---
schemaVersion: 1
module: 'packages/core/src/review/types'
sourceHash: 'a847f9551f5e69907c6e7e020a06854762b0020c547785a91f5f9164e26150e2'
compiledAt: '2026-08-28T01:22:10.506Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'context.ts',
    'fan-out.ts',
    'index.ts',
    'mechanical.ts',
    'meta-judge.ts',
    'output.ts',
    'parallel-groups.ts',
    'pipeline.ts',
  ]
---

## Interface Contract

```ts
export *
```

## Dependency Slice

```
import { ContextBundle, DiffInfo, GraphAdapter, ReviewDomain } from './context'
import { ReviewFinding } from './fan-out'
import { EvidenceCoverageReport, MechanicalCheckResult } from './mechanical'
import { Rubric } from './meta-judge'
import { GitHubInlineComment, PrMetadata, ReviewAssessment, ReviewStrength } from './output'
```
