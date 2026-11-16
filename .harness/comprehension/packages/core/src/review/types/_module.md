---
schemaVersion: 1
module: 'packages/core/src/review/types'
sourceHash: 'da4078c882f69a069bba3447596bf1f0ddb0e16479bc1e6efb880ff7ea5c7133'
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
import { ClumpedCommentReport, GitHubInlineComment, PrMetadata, ReviewAssessment, ReviewStrength } from './output'
```
