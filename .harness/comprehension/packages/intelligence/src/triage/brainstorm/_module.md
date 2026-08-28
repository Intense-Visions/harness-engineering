---
schemaVersion: 1
module: 'packages/intelligence/src/triage/brainstorm'
sourceHash: 'c0ff0047c3c24f64aa370fb700321d9a9655621eb933508d1c5217e92d111504'
compiledAt: '2026-08-28T01:22:11.865Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['runner.test.ts', 'runner.ts', 'types.ts']
---

## Summary

The `brainstorm` module implements an autonomous fork-decision loop for roadmap auto-triage: it iteratively asks an injected LLM generator to surface architectural decisions, auto-accepts only forks with `confidence: 'high'`, and halts (escalating to human) on any lower confidence. The runner is pure, total (never throws), and deterministic, with the generator responsible for overconfidence hardening via N-sampling.

## Invariants

- Only confidence='high' auto-accepts; 'medium' and 'low' halt immediately
- Function is total: generator errors map to halted{reason:'error'}, never throw
- Generator itself downgrades confidence to 'low' when recommendation flips across N samples (overconfidence hardening)
- Depth budget maxForks is always respected; loop never asks generator beyond it
- Deterministic: identical input + stub ⇒ byte-identical outcome (no timers, randomness, or side effects visible to callers)

## Interface Contract

```ts
export DEPTH_BY_LEVEL
export depthForLevel
export runAutoBrainstorm
```

## Dependency Slice

```
import { runAutoBrainstorm } from './runner.js'
import { BrainstormInput, BrainstormOutcome, DepthBudget, Fork, ForkDecision, ForkGenerator, SpecDraft } from './types.js'
import { ComplexityLevel } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
```
