---
schemaVersion: 1
module: 'packages/cli/tests/fixtures/duplication-partial-extraction-project/src'
sourceHash: 'd29dfc8b76ab6c8f8b45a98ac761d3c8dd98cc4fec51fba433e41aad917576fc'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['beta.ts', 'index.ts']
---

## Interface Contract

```ts
export LABEL
export extractPayload
export keepAlpha
export keepBeta
export keepGamma
export labelOne
export labelThree
export labelTwo
export sumOne
export sumThree
export sumTwo
```

## Dependency Slice

```
import { extractPayload } from './shared/payload.js'
```
