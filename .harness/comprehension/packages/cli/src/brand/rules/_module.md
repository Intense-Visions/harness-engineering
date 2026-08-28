---
schemaVersion: 1
module: 'packages/cli/src/brand/rules'
sourceHash: '1a5b2e81533feb4d5ac09e5d62082ee7be7eea3c65d8d47bfa7d1f7ca93e0fb4'
compiledAt: '2026-08-28T01:22:08.748Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['forbidden-phrases-rule.ts', 'token-misuse-rule.ts']
---

## Interface Contract

```ts
export runForbiddenPhrasesRule
export runTokenMisuseRule
```

## Dependency Slice

```
import { BrandFinding, BrandStrictness, severityFor } from '../findings/finding.js'
import { BrandTokenIndex } from '../resolvers/token-extensions.js'
import ts from 'typescript'
```
