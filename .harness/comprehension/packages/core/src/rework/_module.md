---
schemaVersion: 1
module: 'packages/core/src/rework'
sourceHash: '765d9308c6861641cae1616460a9e68d395fbb8e4d6ef23bc5be316546711ca2'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'rework.test.ts', 'rework.ts', 'types.ts']
---

## Interface Contract

```ts
export ComputeReworkOptions
export ReworkClassification
export ReworkReport
export SurfaceRework
export classifyRework
export computeRework
export plannedIssuesFromExternalIds
```

## Dependency Slice

```
import { parseExternalId } from '../roadmap/external-id'
import { parseReferencedIssues } from '../roadmap/referenced-issues'
import { RawCommit, normalizeSince, readRawCommits } from '../solutions/scan-candidates'
import { classifyRework, computeRework, plannedIssuesFromExternalIds } from './rework'
import { ComputeReworkOptions, ReworkClassification, ReworkReport, SurfaceRework } from './types'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
