---
schemaVersion: 1
module: 'packages/cli/src/security-craft/catalog/rubrics'
sourceHash: 'ebb76c44bbbece3f4bb8eb6d211a2bb7ac379c0970a1e5fb75c760175da6711c'
compiledAt: '2026-08-28T01:22:09.340Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'assumed-adversary-realistic.ts',
    'authz-before-action.ts',
    'data-flow-annotated.ts',
    'defense-in-depth.ts',
    'fail-closed-not-open.ts',
    'index.ts',
    'least-authority-honored.ts',
    'secret-handling-shape.ts',
    'trust-boundary-respected.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export SEED_RUBRICS
export SecurityRubric
export rubricApplies
```

## Dependency Slice

```
import { SignalKind } from '../../findings/schema.js'
import { assumedAdversaryRealisticRubric } from './assumed-adversary-realistic.js'
import { authzBeforeActionRubric } from './authz-before-action.js'
import { dataFlowAnnotatedRubric } from './data-flow-annotated.js'
import { defenseInDepthRubric } from './defense-in-depth.js'
import { failClosedNotOpenRubric } from './fail-closed-not-open.js'
import { leastAuthorityHonoredRubric } from './least-authority-honored.js'
import { secretHandlingShapeRubric } from './secret-handling-shape.js'
import { trustBoundaryRespectedRubric } from './trust-boundary-respected.js'
import { SecurityRubric } from './types.js'
```
