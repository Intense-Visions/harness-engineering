---
schemaVersion: 1
module: 'packages/local-models/src/candidates'
sourceHash: '2226672abd15fc9834683be2af9920180a00eff3a95eb29f6d418896f7d30047'
compiledAt: '2026-08-28T01:22:11.956Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['discover.ts', 'frozen.ts', 'index.ts', 'parse.ts', 'select.ts', 'types.ts']
---

## Interface Contract

```ts
export CandidateSelectionBounds
export CurationTags
export DiscoverCandidatesOptions
export DiscoverCandidatesResult
export ExtractedSize
export FROZEN_CANDIDATES_VERSION
export FrozenCandidate
export FrozenCandidatesFile
export LoadFrozenCandidatesResult
export ParseCandidateOptions
export curationFromCandidates
export discoverCandidates
export extractQuantFromFilename
export extractSizeB
export loadFrozenCandidates
export parseHfModelToCandidates
export selectCandidates
export validateFrozenCandidates
```

## Dependency Slice

```
import { HuggingFaceClient, HuggingFaceModelDetail } from '../huggingface/index.js'
import { RankerCandidate, normalizeQuantId } from '../ranker/index.js'
import bundledCandidates from './candidates.json'
import { parseHfModelToCandidates } from './parse.js'
import { FrozenCandidate, FrozenCandidatesFile, LoadFrozenCandidatesResult } from './types.js'
```
