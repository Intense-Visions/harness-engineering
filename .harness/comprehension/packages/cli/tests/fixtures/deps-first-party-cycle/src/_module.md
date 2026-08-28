---
schemaVersion: 1
module: 'packages/cli/tests/fixtures/deps-first-party-cycle/src'
sourceHash: '25049fd19d45e7165b287a5cf410e3dc293f87fe89e3f49867411c3b31970fe0'
compiledAt: '2026-08-28T01:22:09.711Z'
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
import from './a'
import from './b'
```
