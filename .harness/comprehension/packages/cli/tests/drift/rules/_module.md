---
schemaVersion: 1
module: 'packages/cli/tests/drift/rules'
sourceHash: '05b8b745b696df19fbcc5e3815b06adb656e4b84c9838482a7d5806c29f5e232'
compiledAt: '2026-08-28T01:22:09.710Z'
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
