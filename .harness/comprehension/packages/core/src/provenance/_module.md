---
schemaVersion: 1
module: 'packages/core/src/provenance'
sourceHash: 'c72fcc03f896629d7f523b792a96ecc978f386ea133c2909265b5f759c6a49c2'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'commit-trailer.test.ts',
    'commit-trailer.ts',
    'index.ts',
    'io.test.ts',
    'io.ts',
    'report.test.ts',
    'report.ts',
  ]
---

## Interface Contract

```ts
export DeadRuleCandidate
export DeadRuleReason
export PROVENANCE_TRAILER_KEYS
export PROVENANCE_TRAILER_VERSION
export ProvenanceReport
export ProvenanceTrailer
export ProvenanceTrailerInput
export RuleProvenanceInput
export SolutionEnforcement
export UnexplainedConstraint
export appendProvenanceTrailer
export buildProvenanceReport
export collectSolutionEnforcements
export formatProvenanceTrailer
export hasProvenanceTrailer
export parseProvenanceTrailer
```

## Dependency Slice

```
import { PROVENANCE_TRAILER_KEYS, PROVENANCE_TRAILER_VERSION, ProvenanceTrailerInput, appendProvenanceTrailer, formatProvenanceTrailer, hasProvenanceTrailer, parseProvenanceTrailer } from './commit-trailer'
import { collectSolutionEnforcements } from './io'
import { RuleProvenanceInput, SolutionEnforcement, buildProvenanceReport } from './report'
import matter from 'gray-matter'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
