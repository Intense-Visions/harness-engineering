---
schemaVersion: 1
module: 'packages/intelligence/tests/guardian'
sourceHash: 'c618bf76c711ab92b62fde4d9ca27628f73fdff86d9bf5a6798a439c68b816b4'
compiledAt: '2026-08-28T01:22:11.906Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['reader.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { GUARDIAN_ANALYSIS_SCHEMA, GUARDIAN_ANALYSIS_VERSION, GuardianAnalysis, guardianFileLines, guardianFlags, readGuardianAnalyses, summarizeGuardian } from '../../src/guardian/index.js'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
```
