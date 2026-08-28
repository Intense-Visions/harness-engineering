---
schemaVersion: 1
module: 'packages/core/src/golden'
sourceHash: '3892c08dc8ce0f3a4e63e9c10907c8fbd4788f3b35da292f3a6d4af9953dba79'
compiledAt: '2026-08-28T01:22:10.399Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'manager.ts', 'types.ts']
---

## Interface Contract

```ts
export DEFAULT_GOLDEN_MANIFEST_PATH
export DEFAULT_GOLDEN_REFERENCE_PATHS
export GoldenBuildManager
export GoldenConfig
export GoldenConfigSchema
export GoldenDiffResult
export GoldenDiffResultSchema
export GoldenFileChange
export GoldenFileChangeSchema
export GoldenFileEntry
export GoldenFileEntrySchema
export GoldenProvenance
export GoldenSnapshot
export GoldenSnapshotSchema
```

## Dependency Slice

```
import { DEFAULT_GOLDEN_MANIFEST_PATH, DEFAULT_GOLDEN_REFERENCE_PATHS, GoldenDiffResult, GoldenFileChange, GoldenFileEntry, GoldenSnapshot, GoldenSnapshotSchema } from './types'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
```
