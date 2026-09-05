---
schemaVersion: 1
module: 'packages/cli/src/drift/rules'
sourceHash: '031e5519195c8951e8114db7976ab7b3cce7d443dc9f82ce966a1f270018e351'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['primitive-adoption-rule.ts', 'token-bypass-rule.ts']
---

## Interface Contract

```ts
export runPrimitiveAdoptionRule
export runTokenBypassRule
```

## Dependency Slice

```
import { DriftFinding, DriftStrictness, severityFor } from '../findings/finding.js'
import { ComponentRegistry } from '../resolvers/component-registry.js'
import { TokenSet } from '../resolvers/tokens.js'
import ts from 'typescript'
```
