---
schemaVersion: 1
module: 'packages/core/src/dictionary'
sourceHash: '77c855664829a2b6841b6e8274044df0c61cd056c1398721a65117f6179d2587'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'codebook.test.ts',
    'codebook.ts',
    'index.ts',
    'membership.test.ts',
    'membership.ts',
    'mine.test.ts',
    'mine.ts',
    'report.test.ts',
    'report.ts',
  ]
---

## Interface Contract

```ts
export BuildCodebookReportInputs
export CODEBOOK_SCHEMA_VERSION
export Codebook
export CodebookEntry
export CodebookHistoryRecord
export CodebookReport
export CorpusDocument
export CorpusSpan
export DEFAULT_MEMBERSHIP_CONFIG
export DEFAULT_MINE_CONFIG
export HANDLE_PREFIX
export MembershipConfig
export MembershipDecision
export MembershipStatus
export MineConfig
export MinedTerm
export PinnedReference
export SavingsProjection
export StaleReference
export TermBinding
export auditStaleReferences
export buildCodebookReport
export decideMembership
export definitionHash
export deriveHandle
export emptyCodebook
export expand
export liveLabelsFromDecisions
export mineRecurringSpans
export netSaving
export normalizeSpanText
export reconcileCodebook
export verifyEntry
```

## Dependency Slice

```
import { Codebook, HANDLE_PREFIX, TermBinding, auditStaleReferences, definitionHash, deriveHandle, emptyCodebook, expand, reconcileCodebook, verifyEntry } from './codebook'
import { DEFAULT_MEMBERSHIP_CONFIG, MembershipConfig, MembershipDecision, decideMembership, liveLabelsFromDecisions, netSaving } from './membership'
import { CorpusDocument, MineConfig, MinedTerm, mineRecurringSpans, normalizeSpanText } from './mine'
import { buildCodebookReport } from './report'
import * as crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
```
