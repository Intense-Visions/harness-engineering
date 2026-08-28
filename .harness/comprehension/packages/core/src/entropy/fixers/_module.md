---
schemaVersion: 1
module: 'packages/core/src/entropy/fixers'
sourceHash: '1e11750f85aff756f51e22f3ad7670723a4706af6bfc1b4fbd160293e851a5d4'
compiledAt: '2026-08-28T01:22:10.368Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['architecture-fixes.ts', 'cleanup-finding.ts', 'index.ts', 'safe-fixes.ts', 'suggestions.ts']
---

## Interface Contract

```ts
export CommentedCodeBlock
export ForbiddenImportViolation
export OrphanedDep
export applyFixes
export applyHotspotDowngrade
export classifyFinding
export createCommentedCodeFixes
export createFixes
export createForbiddenImportFixes
export createOrphanedDepFixes
export deduplicateCleanupFindings
export generateSuggestions
export previewFix
```

## Dependency Slice

```
import { ProtectedRegionMap, ProtectionScope } from '../../annotations'
import { createEntropyError } from '../../shared/errors'
import { Err, Ok, Result } from '../../shared/result'
import { CleanupFinding, DeadCodeReport, DriftReport, EntropyError, Fix, FixConfig, FixResult, FixType, HotspotContext, PatternReport, SafetyLevel, Suggestion, SuggestionReport } from '../types'
import * as fs from 'fs'
import { basename, dirname, join } from 'path'
import { promisify } from 'util'
```
