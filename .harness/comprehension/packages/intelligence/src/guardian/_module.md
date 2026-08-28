---
schemaVersion: 1
module: 'packages/intelligence/src/guardian'
sourceHash: '03913000236e90aa726a90cad37aa13563e665a0621388effebe74558e04ffc9'
compiledAt: '2026-08-28T01:22:11.843Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'reader.ts', 'schema.ts', 'summary.ts', 'types.ts']
---

## Interface Contract

```ts
export GUARDIAN_ANALYSIS_SCHEMA
export GUARDIAN_ANALYSIS_VERSION
export GuardianAnalysis
export GuardianFileCoverage
export GuardianSeverity
export GuardianVerdict
export guardianAnalysisSchema
export guardianFileLines
export guardianFlags
export readGuardianAnalyses
export summarizeGuardian
```

## Dependency Slice

```
import { guardianAnalysisSchema } from './schema.js'
import { GUARDIAN_ANALYSIS_SCHEMA, GUARDIAN_ANALYSIS_VERSION, GuardianAnalysis, GuardianFileCoverage } from './types.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
```
