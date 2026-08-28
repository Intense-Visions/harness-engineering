---
schemaVersion: 1
module: 'packages/cli/src/test-craft/catalog/rubrics'
sourceHash: '40d2c65be4baad53fc0547459c35729f5949e1ed50491ae3c037718e9cfea584'
compiledAt: '2026-08-28T01:22:09.476Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'arrange-act-assert.ts',
    'contract-not-implementation.ts',
    'contract-not-narrative-name.ts',
    'deleting-loses-something.ts',
    'explicit-failure-mode.ts',
    'fixture-earns-setup-cost.ts',
    'index.ts',
    'meaningful-assertion.ts',
    'single-responsibility.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export SEED_RUBRICS
export TestRubric
```

## Dependency Slice

```
import { arrangeActAssertRubric } from './arrange-act-assert.js'
import { contractNotImplementationRubric } from './contract-not-implementation.js'
import { contractNotNarrativeNameRubric } from './contract-not-narrative-name.js'
import { deletingLosesSomethingRubric } from './deleting-loses-something.js'
import { explicitFailureModeRubric } from './explicit-failure-mode.js'
import { fixtureEarnsSetupCostRubric } from './fixture-earns-setup-cost.js'
import { meaningfulAssertionRubric } from './meaningful-assertion.js'
import { singleResponsibilityRubric } from './single-responsibility.js'
import { TestRubric } from './types.js'
```
