---
schemaVersion: 1
module: 'packages/cli/src/shared/craft'
sourceHash: 'd520af84f96fbefb006dfdedd182cef4c247ae39f72c668d8dd852a3e0dff73b'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['diagnostics.ts', 'fenced-json.test.ts', 'fenced-json.ts', 'scope.ts']
---

## Interface Contract

```ts
export craftPathError
export describeCraftResolution
export extractFencedJsonPayload
export formatCraftDiagnostic
export withCraftAbstention
```

## Dependency Slice

```
import { extractFencedJsonPayload } from './fenced-json.js'
import { CraftLlmResolution } from './llm/provider.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
```
