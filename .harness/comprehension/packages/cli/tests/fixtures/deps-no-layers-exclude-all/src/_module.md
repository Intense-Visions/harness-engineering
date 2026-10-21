---
schemaVersion: 1
module: 'packages/cli/tests/fixtures/deps-no-layers-exclude-all/src'
sourceHash: '99faf48c0aefa7258742df6ca4152c66e0def5e04ceeeebee48d7596b81f154e'
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
