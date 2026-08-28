---
schemaVersion: 1
module: 'packages/core/src/entropy/fixers'
sourceHash: '1e11750f85aff756f51e22f3ad7670723a4706af6bfc1b4fbd160293e851a5d4'
compiledAt: '2026-08-28T01:22:10.368Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['architecture-fixes.ts', 'cleanup-finding.ts', 'index.ts', 'safe-fixes.ts', 'suggestions.ts']
---

## Summary

The `entropy/fixers` module classifies entropy findings (dead code, architecture violations) by safety level, deduplicates cross-concern overlaps, respects protected regions, and generates preview/applied fixes with dry-run and backup support. It transforms raw reports into actionable, graduated remediation with safety metadata preserved throughout.

## Invariants

- Safety classifications are immutable downward only—downgrade via hotspot churn or protected regions, never upgrade
- Findings at the same file:line merge across concerns; dead-code fix priority in merged suggestion
- Protected regions override initial safety classification—findings inside always marked 'protected'
- Every fix must encode reversibility; non-reversible fixes require explicit safe:true
- Hotspot downgrade only affects 'safe' findings; unsafe findings remain unchanged
- Dead exports auto-fix only when reason === 'NO_IMPORTERS'; other reasons require manual review
- UNREFERENCED_ENTRY_POINT files never auto-delete—invisible to static analysis despite build reachability
- When both dead-code and architecture concerns exist on same line, dead-code fixAction surfaces in merged result

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
