---
schemaVersion: 1
module: 'packages/cli/tests/align/codemods'
sourceHash: 'b967fbb36f5ab1ac35c741b91360fea81da07af6be8dd1832e4153c220f93ef5'
compiledAt: '2026-08-28T01:22:09.506Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['t001-hex.test.ts', 't002-and-t003.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { applyT001Codemod } from '../../../src/align/codemods/t001-hex'
import { applyT002Codemod } from '../../../src/align/codemods/t002-font-family'
import { applyT003Codemod } from '../../../src/align/codemods/t003-px-spacing'
import { DriftFinding } from '../../../src/drift/findings/finding'
import { describe, expect, it } from 'vitest'
```
