---
schemaVersion: 1
module: 'scripts/lib'
sourceHash: 'e871fe8f9c52070db43f9eb161c83ebcb62212d3b552b645eb74ad152f1bf518'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'baseline-diff-guard.mjs',
    'core-public-symbols.mjs',
    'diff-scope-guard.mjs',
    'plugin-config.mjs',
  ]
---

## Interface Contract

```ts
export MANIFEST_HEADER
export PLUGIN_CONFIGS
export STANDARD_HOOKS
export assertBaselineOnly
export assertDiffScope
export computePublicSymbols
export diffSymbols
export getConfig
export parseManifest
export renderManifest
```

## Dependency Slice

```
import { assertDiffScope } from './diff-scope-guard.mjs'
import ts from 'typescript'
```
