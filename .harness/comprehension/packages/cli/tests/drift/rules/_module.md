---
schemaVersion: 1
module: 'packages/cli/tests/drift/rules'
sourceHash: '9963961d9f14557aea95c5177afdda9f181f0d1a831e05dbbad990b0129e6517'
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
