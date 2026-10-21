---
schemaVersion: 1
module: 'packages/cli/tests/fixtures/duplication-partial-extraction-project/src/plain'
sourceHash: 'e2364e12032620b861c637562604c4928248a9c7d312119985ef122b50eb8950'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['one.ts', 'three.ts', 'two.ts']
---

## Interface Contract

```ts
export labelOne
export labelThree
export labelTwo
export sumOne
export sumThree
export sumTwo
```

## Dependency Slice

```
import { LABEL } from '../shared/labels.js'
```
