---
schemaVersion: 1
module: 'packages/cli/tests/drift/catalog'
sourceHash: '986c8e0e8c6516ca7047f01f7d207045b50d847bd7381fea94ab837864d9e984'
compiledAt: '2026-08-28T01:22:09.695Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { getDriftCodes, listDriftCodes, lookupDriftCode } from '../../../src/drift/catalog/index.js'
import { getDriftCodesPublic, lookupDriftCodePublic } from '../../../src/drift/exports.js'
import { severityFor } from '../../../src/drift/findings/finding.js'
import { describe, expect, it } from 'vitest'
```
