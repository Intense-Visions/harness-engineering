---
schemaVersion: 1
module: 'packages/local-models/src/proposals'
sourceHash: '2c51b80e5d9fb2d4295cb04ba10a91c95904d0d1f735d01c2d7d3f297d359a66'
compiledAt: '2026-08-28T01:22:11.972Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['engine.ts', 'index.ts', 'justification.ts']
---

## Interface Contract

```ts
export DedupPair
export DiffInput
export JustificationInput
export buildJustification
export diffPoolAgainstRanking
```

## Dependency Slice

```
import { PoolEntry, PoolState } from '../pool/types.js'
import { estimateDiskGb } from '../ranker/index.js'
import { RankedModel } from '../ranker/types.js'
import { buildJustification } from './justification.js'
import { ModelProposalContent } from '@harness-engineering/types'
```
