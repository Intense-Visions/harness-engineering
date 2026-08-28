---
schemaVersion: 1
module: 'packages/cli/src/shared/craft'
sourceHash: '17977cd076d61e99a4ef2c22a447bf5a614174586fce7ecf48f89fd88119681d'
compiledAt: '2026-08-28T01:22:09.341Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['diagnostics.ts', 'fenced-json.test.ts', 'fenced-json.ts']
---

## Interface Contract

```ts
export describeCraftResolution
export extractFencedJsonPayload
export formatCraftDiagnostic
```

## Dependency Slice

```
import { extractFencedJsonPayload } from './fenced-json.js'
import { CraftLlmResolution } from './llm/provider.js'
import { describe, expect, it } from 'vitest'
```
