---
schemaVersion: 1
module: 'packages/core/tests/fixtures/circular-deps'
sourceHash: '6b828b44b6a00baeb6967347f0e1a597f0aa3bba05ae7c6310926b4f601387cc'
compiledAt: '2026-08-28T01:22:10.854Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['a.ts', 'b.ts', 'c.ts']
---

## Interface Contract

```ts
export a
export b
export c
```

## Dependency Slice

```
import { a } from './a'
import { b } from './b'
import { c } from './c'
```
