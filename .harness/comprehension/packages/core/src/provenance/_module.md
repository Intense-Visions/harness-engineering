---
schemaVersion: 1
module: 'packages/core/src/provenance'
sourceHash: 'b541af53ecc8e09499ba7e67feaeeab967ba29160bf9fc57633f0c2f96c00738'
compiledAt: '2026-08-28T01:22:10.447Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'io.test.ts', 'io.ts', 'report.test.ts', 'report.ts']
---

## Interface Contract

```ts
export DeadRuleCandidate
export DeadRuleReason
export ProvenanceReport
export RuleProvenanceInput
export SolutionEnforcement
export UnexplainedConstraint
export buildProvenanceReport
export collectSolutionEnforcements
```

## Dependency Slice

```
import { collectSolutionEnforcements } from './io'
import { RuleProvenanceInput, SolutionEnforcement, buildProvenanceReport } from './report'
import matter from 'gray-matter'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
