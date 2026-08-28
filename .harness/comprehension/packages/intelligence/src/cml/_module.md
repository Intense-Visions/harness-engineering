---
schemaVersion: 1
module: 'packages/intelligence/src/cml'
sourceHash: '6c57a1f93993030e2a4bea7777671f076885bb86e818a0876ef517f8e9220a50'
compiledAt: '2026-08-28T01:22:11.838Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['historical.ts', 'scorer.ts', 'semantic.ts', 'signals.ts', 'structural.ts']
---

## Interface Contract

```ts
export computeHistoricalComplexity
export computeSemanticComplexity
export computeStructuralComplexity
export score
export scoreToConcernSignals
```

## Dependency Slice

```
import { BlastRadius, ComplexityScore, EnrichedSpec } from '../types.js'
import { computeHistoricalComplexity } from './historical.js'
import { computeSemanticComplexity } from './semantic.js'
import { computeStructuralComplexity } from './structural.js'
import { CascadeSimulator, GraphStore } from '@harness-engineering/graph'
import { ConcernSignal } from '@harness-engineering/types'
```
