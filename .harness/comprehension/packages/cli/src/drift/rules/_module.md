---
schemaVersion: 1
module: 'packages/cli/src/drift/rules'
sourceHash: 'e475848d21c16ff838ac8d824f8f5a01323048f5cfd08885205558578561e662'
compiledAt: '2026-08-28T01:22:09.224Z'
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
