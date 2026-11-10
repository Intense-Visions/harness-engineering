---
schemaVersion: 1
module: 'packages/core/src/entropy/fixers'
sourceHash: '453849390bffd3e4df024f1b253a8fc37d3c01a051bf7ffc7f1a37fa9f17b2d1'
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
import { basename, dirname, join, resolve } from 'path'
import { promisify } from 'util'
```
