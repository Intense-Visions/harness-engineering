---
schemaVersion: 1
module: 'packages/cli/src/audit/component-anatomy/catalog'
sourceHash: '17b756b9f00f18eb251b0796cb2ae4e93627037b00d353633d99578ce676066d'
compiledAt: '2026-08-28T01:22:08.715Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts']
---

## Interface Contract

```ts
export getCatalogTypes
export listConventions
export lookupConvention
```

## Dependency Slice

```
import { ConventionRule } from '../rules/convention-rule.js'
import { buttonConvention } from './conventions/button.js'
import { checkboxConvention } from './conventions/checkbox.js'
import { dialogConvention } from './conventions/dialog.js'
import { emptyStateConvention } from './conventions/empty-state.js'
import { inputConvention } from './conventions/input.js'
import { selectConvention } from './conventions/select.js'
import { switchConvention } from './conventions/switch.js'
```
