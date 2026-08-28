---
schemaVersion: 1
module: 'packages/core/tests/entropy/fixers'
sourceHash: '2ad8fb89b9783cebc10f42dee9af3c87d7ebc769ace48791c26867ca1240b230'
compiledAt: '2026-08-28T01:22:10.843Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

This test suite validates the core entropy-fixing subsystem that detects and suggests fixes for code quality issues (dead code, architectural violations, commented-out code). It exercises the pipeline from findings detection → safety classification → fix application.

## Invariants

- Fixes only emit when actionable: Forbidden-import fixes are created only if an alternative import path is configured; violations without alternatives produce zero fixes (not placeholder fixes).
- Safety classification is context-dependent: A finding's safety tier (safe/probably-safe/unsafe) depends on public API exposure, presence of structured alternatives, and file churn (safe findings in high-churn files downgrade to probably-safe via hotspot detection).
- Hotspot downgrade is one-way: Only 'safe' findings can be downgraded to 'probably-safe' based on churn; already-unsafe findings remain unsafe regardless of hotspot status.
- Protection scope must match concern type: Protected regions override safety only when their scope matches the finding's concern (entropy scope for dead-code, architecture scope for violations); mismatched scope = no protection applied.
- Deduplication merges cross-concern findings: When the same line violates multiple concerns (e.g., an import is both unused AND forbidden), they merge into a single deduplicated finding that records both concerns; merged safety level is the most conservative of the two.
- Safe-fixes framework is reversible by design: All generated fixes are marked reversible:true and include both oldContent and newContent, enabling safe dry-run preview and undo semantics.

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
