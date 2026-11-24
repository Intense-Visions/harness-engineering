---
schemaVersion: 1
module: 'packages/core/src/review/types'
sourceHash: '18a0a7028d3c95333f9a47ad43bf5460a498df3e91701500c54bfe4671ebcb2a'
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
import { EscapedFrom, FindingClass } from '@harness-engineering/types'
```
