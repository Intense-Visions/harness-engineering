---
schemaVersion: 1
module: 'packages/intelligence/tests/effectiveness'
sourceHash: 'e5e3b0e367b83354baeadb4f5321e091e616cd810a89e1100b7123dfb9172537'
compiledAt: '2026-08-28T01:22:11.894Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['scorer.test.ts', 'skill-scorer.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { computePersonaEffectiveness, detectBlindSpots, recommendPersona } from '../../src/effectiveness/scorer.js'
import { computeSkillEffectiveness, detectAbandonedSkills, detectFailingSkills } from '../../src/effectiveness/skill-scorer.js'
import { ExecutionOutcomeConnector } from '../../src/outcome/connector.js'
import { ExecutionOutcome } from '../../src/outcome/types.js'
import { GraphStore } from '@harness-engineering/graph'
import { SkillInvocationRecord } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
```
