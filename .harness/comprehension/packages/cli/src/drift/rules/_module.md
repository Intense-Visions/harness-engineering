---
schemaVersion: 1
module: 'packages/cli/src/drift/rules'
sourceHash: 'c7446f49ae67181f297505e8136552fd1eca3a82038fea797499213fbfedc513'
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
