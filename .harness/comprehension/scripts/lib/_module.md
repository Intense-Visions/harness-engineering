---
schemaVersion: 1
module: 'scripts/lib'
sourceHash: 'b75574e5bd076293d2485ba8365efbd36a9731a511238aca17277cdcf2e1213a'
compiledAt: '2026-08-28T01:22:12.804Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['baseline-diff-guard.mjs', 'diff-scope-guard.mjs', 'plugin-config.mjs']
---

## Interface Contract

```ts
export PLUGIN_CONFIGS
export STANDARD_HOOKS
export assertBaselineOnly
export assertDiffScope
export getConfig
```

## Dependency Slice

```
import { assertDiffScope } from './diff-scope-guard.mjs'
```
