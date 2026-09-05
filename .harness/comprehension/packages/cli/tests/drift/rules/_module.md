---
schemaVersion: 1
module: 'packages/cli/tests/drift/rules'
sourceHash: '0771c5f6e34199bc50e5f50e128dda547ea2d81e0c4efced036a6c788267ba22'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['primitive-adoption.test.ts', 'token-bypass.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { ComponentRegistry } from '../../../src/drift/resolvers/component-registry'
import { TokenSet } from '../../../src/drift/resolvers/tokens'
import { runPrimitiveAdoptionRule } from '../../../src/drift/rules/primitive-adoption-rule'
import { runTokenBypassRule } from '../../../src/drift/rules/token-bypass-rule'
import { describe, expect, it } from 'vitest'
```
