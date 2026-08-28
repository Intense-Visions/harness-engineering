---
schemaVersion: 1
module: 'packages/intelligence/src/complexity'
sourceHash: 'e630447af84952a5eaf40cb0159c3948a99f7d48a61a8d17e94efae1d75e39b6'
compiledAt: '2026-08-28T01:22:11.855Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The `packages/intelligence/src/complexity` module is the Adaptive Model Routing (AMR) complexity classifier. It routes code changes through a three-stage cascade (D4): static heuristics (no LLM cost), fast-tier tie-break (if low-confidence), and standard-tier escalation (if still low AND risk-high). The output is a ComplexityVerdict recording which stage decided. A separate hard-floor veto (D5) forces `strong` tier for sensitive paths, public APIs, core/types layers, or high blast radius. The tier routing is deterministic; static-only paths cost zero LLM calls. Phase-aware capping prevents pre-diff verdicts from achieving high confidence.

## Invariants

- Static-only path is free: high/medium-confidence static = zero LLM calls; offline mode returns static unchanged
- Escalation is conditional: second tie-break LLM only fires if riskHigh && confidence=low after first break
- Complexity → tier is deterministic: trivial/simple map ≤ their base tier; low-confidence verdicts never drop below policy floor
- Veto gate is orthogonal: blastRadiusVeto (sensitivePath, publicApi, core layer, blast radius ≥ threshold) forces strong tier after complexity→tier derivation, independent of riskHigh classifier gate
- Pre-diff capped at medium: verdicts from phase='pre-diff' never earn high confidence, even post-escalation (S3-001)
- Policy is immutable: deriveRequiredTier receives RoutingPolicy as read-only; never mutates caller's object
- Phase scopes signal set: pre-diff signals lack blastRadius key; post-diff signals include it; this controls whether static can claim high confidence
- No double-veto: riskHigh gate (spend a second LLM to sharpen low-confidence) is orthogonal to hard blastRadiusVeto (tier floor); both fire independently

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
