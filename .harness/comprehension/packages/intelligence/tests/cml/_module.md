---
schemaVersion: 1
module: 'packages/intelligence/tests/cml'
sourceHash: '976d7d77b9670d2917a084606a55b5ab116b9b11f2a00e7cd2188bea5db2ae5f'
compiledAt: '2026-08-28T01:22:11.908Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'historical.test.ts',
    'scorer.test.ts',
    'semantic.test.ts',
    'signals.test.ts',
    'structural.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { computeHistoricalComplexity } from '../../src/cml/historical.js'
import { score } from '../../src/cml/scorer.js'
import { computeSemanticComplexity } from '../../src/cml/semantic.js'
import { scoreToConcernSignals } from '../../src/cml/signals.js'
import { computeStructuralComplexity } from '../../src/cml/structural.js'
import { AffectedSystem, ComplexityScore, EnrichedSpec } from '../../src/types.js'
import { GraphStore } from '@harness-engineering/graph'
import { describe, expect, it } from 'vitest'
```
