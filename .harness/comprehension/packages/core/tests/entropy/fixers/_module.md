---
schemaVersion: 1
module: 'packages/core/tests/entropy/fixers'
sourceHash: 'aa95c26cfbe0a561ad4f6553f1eb795ef2e3e49f5ce5501249b33b9e28de581a'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'architecture-fixes.test.ts',
    'cleanup-finding.test.ts',
    'commented-code-fixes.test.ts',
    'dead-export-fixes.test.ts',
    'orphaned-dep-fixes.test.ts',
    'safe-fixes.test.ts',
    'suggestions.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createRegionMap } from '../../../src/annotations'
import { createForbiddenImportFixes } from '../../../src/entropy/fixers/architecture-fixes'
import { applyHotspotDowngrade, classifyFinding, deduplicateCleanupFindings, markProtectedFindings } from '../../../src/entropy/fixers/cleanup-finding'
import { applyFixes, createCommentedCodeFixes, createFixes, createOrphanedDepFixes, previewFix } from '../../../src/entropy/fixers/safe-fixes'
import { generateSuggestions } from '../../../src/entropy/fixers/suggestions'
import { CleanupFinding, DeadCodeReport, DriftReport, Fix, HotspotContext, PatternReport } from '../../../src/entropy/types'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
