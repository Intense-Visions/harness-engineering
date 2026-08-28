---
schemaVersion: 1
module: 'packages/cli/src/align/suggestions'
sourceHash: '5d10b8da5dd319b1dd5c66b62a1264ca0f977467909adb5e89bfddfe36a08894'
compiledAt: '2026-08-28T01:22:08.708Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['p-primitives.test.ts', 'p-primitives.ts', 't004-deprecated.ts']
---

## Interface Contract

```ts
export emitPrimitiveSuggestion
export emitT004Suggestion
```

## Dependency Slice

```
import { DriftFinding, DriftFindingCode } from '../../drift/findings/finding'
import { DriftFinding } from '../../drift/findings/finding.js'
import { FixSuggestion } from '../findings/outcome.js'
import { emitPrimitiveSuggestion } from './p-primitives'
import { describe, expect, it } from 'vitest'
```
