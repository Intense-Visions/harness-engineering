---
schemaVersion: 1
module: 'packages/cli/src/drift/rules'
sourceHash: 'c090537acdc45dfb393bf53daf92ac1095ea16c506a8e6bafd6a015f29867d43'
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
