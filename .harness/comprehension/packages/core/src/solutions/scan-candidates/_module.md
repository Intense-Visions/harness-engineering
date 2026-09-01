---
schemaVersion: 1
module: 'packages/core/src/solutions/scan-candidates'
sourceHash: 'f60b11375b50a4e91946332a312e771a5ae63720ad4547119861742bdc346e9d'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'assemble.test.ts',
    'assemble.ts',
    'cross-reference.test.ts',
    'cross-reference.ts',
    'git-scan.test.ts',
    'git-scan.ts',
    'hotspot.test.ts',
    'hotspot.ts',
    'index.ts',
    'iso-week.test.ts',
    'iso-week.ts',
  ]
---

## Interface Contract

```ts
export AssembleInput
export GitScanOptions
export IsoWeek
export ScanHotspot
export ScanHotspotOptions
export ScanScoredHotspot
export ScanStableHotspotOptions
export ScannedCommit
export assembleCandidateReport
export computeHotspots
export computeStableHotspots
export crossReferenceUndocumentedFixes
export formatIsoWeek
export gitScan
export isoWeek
export suggestCategory
```

## Dependency Slice

```
import { RankTier, ScoredItem, StabilityReport, StableRanking, checkRankStability } from '../../ranking'
import { BUG_TRACK_CATEGORIES, KNOWLEDGE_TRACK_CATEGORIES } from '../schema'
import { assembleCandidateReport, suggestCategory } from './assemble'
import { crossReferenceUndocumentedFixes } from './cross-reference'
import { ScannedCommit, gitScan, normalizeSince } from './git-scan'
import { Hotspot, computeHotspots, computeStableHotspots } from './hotspot'
import { IsoWeek, formatIsoWeek, isoWeek } from './iso-week'
import { execFile, execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path, { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
