---
schemaVersion: 1
module: 'packages/intelligence/src/effectiveness'
sourceHash: '902ab95159c04907885c5ba3c22847d253ac52c4d729d1e701aa066407133aa5'
compiledAt: '2026-08-28T01:22:11.838Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['scorer.ts', 'skill-scorer.ts', 'types.ts']
---

## Interface Contract

```ts
export computePersonaEffectiveness
export computeSkillEffectiveness
export detectAbandonedSkills
export detectBlindSpots
export detectFailingSkills
export recommendPersona
```

## Dependency Slice

```
import { AbandonedSkill, BlindSpot, FailingSkill, PersonaEffectivenessScore, PersonaRecommendation, SkillEffectivenessScore } from './types.js'
import { GraphStore } from '@harness-engineering/graph'
import { SkillInvocationRecord } from '@harness-engineering/types'
```
