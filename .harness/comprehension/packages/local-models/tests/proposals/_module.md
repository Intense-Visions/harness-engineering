---
schemaVersion: 1
module: "packages/local-models/tests/proposals"
sourceHash: "03928d412c9f1b26889cd762b7fbe293cfa076329a90340643c345d9f67f30fa"
compiledAt: "2026-08-28T01:22:12.044Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["engine.test.ts", "justification.test.ts"]
---

## Summary

The proposals module tests a model upgrade engine that generates one swap proposal per pool entry by ranking candidates, filtering by score threshold + hardware fit, and deduplicating against rejected/pending pairs (pair-scoped) and pending install targets (target-scoped). It also tests justification rendering that rounds floats to avoid leaking imprecision to operators.

## Invariants

- F6: at most one proposal per pool entry; no target appears twice
- F7: (target, replaces) pairs in rejected/pending history are skipped; rejection is pair-scoped not model-scoped
- Target-level dedup: pending (target, replaces) blocks proposing same target to any pool member
- Threshold: candidates must beat current score by >= proposalThreshold; ties suppressed
- Hardware: only fitsHardware=true models within vramGb fit for proposal
- No re-proposal of pool-resident models (matched by ollamaName)
- Fallback: rejected top candidate → next-best viable; emit nothing only if all viable suppressed
- T7: swap proposals carry target's absolute ranked score (not delta) so installed entry seeds at real rank
- Justification: floats rounded to whole numbers (scores) / 1 decimal (GB); no long-float leakage to operators

## Interface Contract

```ts

```

## Dependency Slice

```
import { PoolEntry, PoolState } from '../../src/pool/types.js'
import { diffPoolAgainstRanking } from '../../src/proposals/engine.js'
import { buildJustification } from '../../src/proposals/justification.js'
import { estimateDiskGb } from '../../src/ranker/disk.js'
import { RankedModel } from '../../src/ranker/types.js'
import { describe, expect, it } from 'vitest'
```
