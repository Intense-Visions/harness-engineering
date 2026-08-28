---
schemaVersion: 1
module: 'packages/cli/tests/brand/rules'
sourceHash: '85190782bfde194c9d9b7caec44ad6ed97218e5a6becf22a2022c925c8b26a0b'
compiledAt: '2026-08-28T01:22:09.582Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['forbidden-phrases.test.ts', 'token-misuse.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { BrandTokenIndex } from '../../../src/brand/resolvers/token-extensions'
import { runForbiddenPhrasesRule } from '../../../src/brand/rules/forbidden-phrases-rule'
import { runTokenMisuseRule } from '../../../src/brand/rules/token-misuse-rule'
import { describe, expect, it } from 'vitest'
```
