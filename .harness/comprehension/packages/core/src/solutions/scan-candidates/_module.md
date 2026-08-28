---
schemaVersion: 1
module: 'packages/core/src/solutions/scan-candidates'
sourceHash: 'c32cce876024b2192e6ea5abd8f0e72cbdd4743e045a23ecbc00b17ff57abd8d'
compiledAt: '2026-08-28T01:22:10.622Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

`scan-candidates` identifies undocumented fixes and high-churn code areas to feed into `/harness:compound` solution authoring. It chains four tasks: (1) Git scan extracts "fix:" commits from the past N days with metadata; (2) Cross-reference filters commits against existing `docs/solutions/` entries using Jaccard token similarity (threshold 0.4), keeping only undocumented gaps; (3) Hotspot detection identifies high-churn files lacking solution docs; (4) Report assembly generates markdown output suggesting categories via keyword matching and invoking `/harness:compound` skills. Typical flow: scan last week's fixes → remove documented ones → find churning files without patterns → output candidates for user authoring.

## Invariants

- Keyword regex precedence in suggestCategory: security keywords (auth, crypt, csrf) checked before database (deadlock, transaction) because terms overlap and security is more critical
- Jaccard similarity threshold is 0.4: commits are 'documented' if tokenized subject shares ≥40% overlap with any solution title; below that is a gap
- Stopwords exclusion during tokenization (fix, the, handle, edge, case, etc.) prevents false-positive cross-references; without it, generic fix descriptions spuriously match solution titles
- Solutions directory hierarchy is mandatory: docs/solutions/{track}/{category}/{slug}.md; missing directory causes all commits to be flagged as undocumented (fail-open: miss nothing)
- Solution title source is first H1 markdown heading; if no H1 exists, filename is fallback; this is the sole canonical title per solution file matched against commit subjects
- Git scan filters to 'fix:' conventional commits only; other prefixes (feat, docs, refactor) are invisible to the module
- Conventional commit format assumption: 'fix(scope): subject' prefix is stripped by descriptor(); malformed commits leak the prefix into compound commands
- Lookback window ('7d', '30d') is git-relative via git log --since; boundary behavior and timezone handling follow git semantics, not local clock

## Interface Contract

```ts
export AssembleInput
export GitScanOptions
export IsoWeek
export ScanHotspot
export ScanHotspotOptions
export ScannedCommit
export assembleCandidateReport
export computeHotspots
export crossReferenceUndocumentedFixes
export formatIsoWeek
export gitScan
export isoWeek
export suggestCategory
```

## Dependency Slice

```
import { BUG_TRACK_CATEGORIES, KNOWLEDGE_TRACK_CATEGORIES } from '../schema'
import { assembleCandidateReport, suggestCategory } from './assemble'
import { crossReferenceUndocumentedFixes } from './cross-reference'
import { ScannedCommit, gitScan, normalizeSince } from './git-scan'
import { Hotspot, computeHotspots } from './hotspot'
import { IsoWeek, formatIsoWeek, isoWeek } from './iso-week'
import { execFile, execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path, { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
