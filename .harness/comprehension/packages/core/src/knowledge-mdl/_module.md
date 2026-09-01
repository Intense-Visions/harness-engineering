---
schemaVersion: 1
module: 'packages/core/src/knowledge-mdl'
sourceHash: '2fa576ce411457bccba306da912add57d00b76f612d876c53b0088880ce95e33'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'adapter.ts',
    'consolidate.test.ts',
    'consolidate.ts',
    'cost.test.ts',
    'cost.ts',
    'index.ts',
    'matched-comparison.test.ts',
    'matched-comparison.ts',
    'report.test.ts',
    'report.ts',
    'score.test.ts',
    'score.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export CompressionValue
export DEFAULT_MDL_CONFIG
export DescriptionCost
export EntryScore
export InclusionEvent
export KnowledgeEntry
export MdlConfig
export MdlReport
export MdlVerdict
export MergeCandidate
export PruneRecommendation
export RunOutcome
export buildKnowledgeEntriesFromLearnings
export buildMdlReport
export computeDescriptionCost
export estimateCompressionValue
export findMergeCandidates
export inclusionRunIds
export scoreEntries
export scoreEntry
```

## Dependency Slice

```
import { CHARS_PER_TOKEN, estimateTokens } from '../compaction/envelope'
import { computeEntryHash, parseFrontmatter } from '../state/learnings-content'
import { checkOverlap } from '../state/learnings-overlap'
import { buildKnowledgeEntriesFromLearnings } from './adapter'
import { MergeCandidate, findMergeCandidates } from './consolidate'
import { DescriptionCost, computeDescriptionCost, inclusionRunIds } from './cost'
import { CompressionValue, estimateCompressionValue } from './matched-comparison'
import { buildMdlReport } from './report'
import { EntryScore, scoreEntries, scoreEntry } from './score'
import { DEFAULT_MDL_CONFIG, InclusionEvent, KnowledgeEntry, MdlConfig, MdlVerdict, RunOutcome } from './types'
import { describe, expect, it } from 'vitest'
```
