---
schemaVersion: 1
module: 'packages/core/src/provenance'
sourceHash: 'bd562f32e39568454e4ef4f87bf610667d6cdd7ae96c23dc9cb2636119e80117'
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
    'validate-trailer.test.ts',
    'validate-trailer.ts',
  ]
---

## Interface Contract

```ts
export DeadRuleCandidate
export DeadRuleReason
export PROVENANCE_TRAILER_KEYS
export PROVENANCE_TRAILER_VERSION
export ProvenanceReport
export ProvenanceShapeFinding
export ProvenanceShapeIssueCode
export ProvenanceShapeResult
export ProvenanceShapeWarningCode
export ProvenanceTrailer
export ProvenanceTrailerInput
export RuleProvenanceInput
export SolutionEnforcement
export UnexplainedConstraint
export appendProvenanceTrailer
export buildProvenanceReport
export collectProvenanceTrailerEntries
export collectSolutionEnforcements
export formatProvenanceTrailer
export hasProvenanceTrailer
export parseProvenanceTrailer
export validateProvenanceTrailer
```

## Dependency Slice

```
import { PROVENANCE_TRAILER_KEYS, PROVENANCE_TRAILER_VERSION, ProvenanceTrailer, ProvenanceTrailerInput, appendProvenanceTrailer, collectProvenanceTrailerEntries, formatProvenanceTrailer, hasProvenanceTrailer, parseProvenanceTrailer } from './commit-trailer'
import { collectSolutionEnforcements } from './io'
import { RuleProvenanceInput, SolutionEnforcement, buildProvenanceReport } from './report'
import { validateProvenanceTrailer } from './validate-trailer'
import matter from 'gray-matter'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
