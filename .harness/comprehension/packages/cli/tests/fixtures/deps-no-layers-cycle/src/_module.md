---
schemaVersion: 1
module: 'packages/cli/tests/fixtures/deps-no-layers-cycle/src'
sourceHash: '1e4f57001167400419042b4c37cbafd2922d53d0fae9dfa1cd3dbec191bb2509'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['a.ts', 'b.ts']
---

## Interface Contract

```ts
export a
export b
```

## Dependency Slice

```
import { a } from './a.js'
import { b } from './b.js'
```
