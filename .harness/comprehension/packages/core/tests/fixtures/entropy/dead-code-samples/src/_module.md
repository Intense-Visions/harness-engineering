---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/dead-code-samples/src'
sourceHash: '051b015b7f941aefea6c2439a35b2858f3f9ad6fc8af5a5f2a92ce40bd1f52bf'
compiledAt: '2026-08-28T01:22:10.858Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['helper.ts', 'index.ts', 'unused.ts', 'used.ts', 'with-unused-import.ts']
---

## Interface Contract

```ts
export usedFunction
export wrapper
```

## Dependency Slice

```
import { anotherHelper, helper } from './helper'
```
