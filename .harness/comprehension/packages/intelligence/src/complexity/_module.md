---
schemaVersion: 1
module: 'packages/intelligence/src/complexity'
sourceHash: 'e630447af84952a5eaf40cb0159c3948a99f7d48a61a8d17e94efae1d75e39b6'
compiledAt: '2026-08-28T01:22:11.855Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'acceptance.test.ts',
    'classifier.test.ts',
    'classifier.ts',
    'derive-tier.test.ts',
    'derive-tier.ts',
    'index.ts',
    'signals.test.ts',
    'signals.ts',
    'static-pass.test.ts',
    'static-pass.ts',
    'tiebreak.test.ts',
    'tiebreak.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export ClassifyInput
export ComplexitySignals
export DEFAULT_DEGRADE_AT_PCT
export Phase
export RANK_TIER
export SENSITIVE_BLAST_THRESHOLD
export STATIC_WEIGHTS
export StaticVerdict
export TIER_RANK
export TiebreakResult
export applyBudgetClamp
export baseTier
export blastRadiusVeto
export classify
export deriveRequiredTier
export llmTiebreak
export runStaticPass
export serializeSignals
```

## Dependency Slice

```
import { AnalysisProvider, AnalysisRequest } from '../analysis-provider/interface.js'
import { blastRadiusVeto, deriveRequiredTier } from '../index.js'
import { ClassifyInput, classify } from './classifier.js'
import { SENSITIVE_BLAST_THRESHOLD, baseTier, blastRadiusVeto, deriveRequiredTier } from './derive-tier.js'
import { serializeSignals } from './signals.js'
import { STATIC_WEIGHTS, runStaticPass } from './static-pass.js'
import { llmTiebreak } from './tiebreak.js'
import { ComplexitySignals, Phase, StaticVerdict } from './types.js'
import { CapabilityTier, ComplexityLevel, ComplexityVerdict, RoutingPolicy, RoutingRisk } from '@harness-engineering/types'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
```
