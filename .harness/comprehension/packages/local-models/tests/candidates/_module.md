---
schemaVersion: 1
module: 'packages/local-models/tests/candidates'
sourceHash: '8188fc97c4bdd50d1e2e304c5303305738a505a13728387161df879fb6c5d35f'
compiledAt: '2026-08-28T01:22:11.996Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['discover.test.ts', 'frozen.test.ts', 'parse.test.ts', 'select.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { CurationTags, curationFromCandidates, discoverCandidates } from '../../src/candidates/discover.js'
import { loadFrozenCandidates, validateFrozenCandidates } from '../../src/candidates/frozen.js'
import { extractQuantFromFilename, extractSizeB, parseHfModelToCandidates } from '../../src/candidates/parse.js'
import { selectCandidates } from '../../src/candidates/select.js'
import { FrozenCandidate } from '../../src/candidates/types.js'
import { HuggingFaceModelDetail } from '../../src/huggingface/index.js'
import { HuggingFaceModel, HuggingFaceModelDetail } from '../../src/huggingface/types.js'
import { normalizeQuantId } from '../../src/ranker/index.js'
import { describe, expect, it } from 'vitest'
```
