---
schemaVersion: 1
module: 'packages/intelligence/src/guardian'
sourceHash: '03913000236e90aa726a90cad37aa13563e665a0621388effebe74558e04ffc9'
compiledAt: '2026-08-28T01:22:11.843Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'reader.ts', 'schema.ts', 'summary.ts', 'types.ts']
---

## Summary

Guardian is a harness-owned diff-coverage analysis module that reads and projects `.harness/analyses/` records into advisory review signals. It implements a tolerant reader pattern: reads from a shared archive directory, silently skips any file that doesn't match the guardian discriminator (schema + version literals), validates survivors with Zod, and provides deterministic projections for review gates (outcome_eval, pre-merge-brief). The module defines three layers: types contract (GuardianAnalysis, verdict, severity, per-file coverage), schema validator with literal discriminators, tolerant reader that degrades gracefully on absence/malform/validation failure, and deterministic summary projections (flagging, one-liners, per-file details). Guardian verdicts and coverage deltas are advisory only—never derive ship authority or change behavior when absent.

## Invariants

- Never throws: missing directory, unreadable files, malformed JSON, validation failures all degrade to empty-result or skip-silently
- Discriminator-based selection: records matched by exact schema + version literals; non-guardian records (intelligence AnalysisRecord, foreign shapes) silently skipped
- No-op on absence: missing .harness/analyses/ or empty archive returns []; consumers must treat as identical to no guardian wiring
- Silent validation skip: unreadable, non-JSON, or invalid records omitted; reader never collects errors or signals failure
- Forward-compatible schema: unknown extra keys stripped not rejected, so future producers adding fields won't cause wholesale record drops
- Deterministic projections: summarizeGuardian, guardianFlags, guardianFileLines are pure functions so outcome_eval and pre-merge-brief surface identical signals
- Advisory only: guardian verdicts and severity have no gating authority, inform review briefs and rationales only

## Interface Contract

```ts
export GUARDIAN_ANALYSIS_SCHEMA
export GUARDIAN_ANALYSIS_VERSION
export GuardianAnalysis
export GuardianFileCoverage
export GuardianSeverity
export GuardianVerdict
export guardianAnalysisSchema
export guardianFileLines
export guardianFlags
export readGuardianAnalyses
export summarizeGuardian
```

## Dependency Slice

```
import { guardianAnalysisSchema } from './schema.js'
import { GUARDIAN_ANALYSIS_SCHEMA, GUARDIAN_ANALYSIS_VERSION, GuardianAnalysis, GuardianFileCoverage } from './types.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
```
