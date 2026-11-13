---
schemaVersion: 1
module: 'scripts/lib'
sourceHash: '3ea7ee8989c694563356659fc773d69911a25fdef31f39f2e29946feeb961c4b'
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
