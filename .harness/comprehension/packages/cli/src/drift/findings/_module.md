---
schemaVersion: 1
module: 'packages/cli/src/drift/findings'
sourceHash: '30d1ac56099b90bb9edb5a4f795a620bc0519dbf19f1b08df95eeacf242e04da'
compiledAt: '2026-08-28T01:22:09.218Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['finding.ts', 'types.ts']
---

## Interface Contract

```ts
export DriftFindingCode
export DriftSeverity
export DriftStrictness
export severityFor
```

## Dependency Slice

```
import { lookupDriftCode } from '../catalog/index.js'
import { DriftFindingCode, DriftSeverity, DriftStrictness } from './types.js'
```
