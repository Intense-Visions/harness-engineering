---
schemaVersion: 1
module: 'packages/cli/src/copy-craft/catalog/rubrics'
sourceHash: '85f665c587cb9b5e18b83f6f632d6f5f43f0fc27dd96ee8aa8afaf74e1bec8bc'
compiledAt: '2026-08-28T01:22:08.993Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'calm-not-panicky.ts',
    'describes-change-not-work.ts',
    'grep-survives.ts',
    'index.ts',
    'signal-not-noise.ts',
    'specific-not-generic.ts',
    'stranger-in-6-months.ts',
    'types.ts',
    'what-why-how-to-fix.ts',
    'why-not-what.ts',
  ]
---

## Summary

The `rubrics` module curates a v1 seed catalog of eight prose-quality standards (copy rubrics) for writing in code. Each rubric defines a quality principle (e.g., "Tells WHAT, WHY, and HOW-TO-FIX"), its rationale and source, and which text surfaces it applies to (error, log, comment, commit, PR description, etc.). The module exports the `CopyRubric` type, a read-only `SEED_RUBRICS` array, and a `rubricApplies` helper to check if a rubric applies to a given surface. This is a living catalog (ADR 0020), designed to grow as quality standards are discovered; the seed set is static and unchanging.

## Invariants

- Each rubric must have a distinct id (pattern COPY-R###). Duplicates break lookup and filtering.
- Each rubric's appliesToSurfaces array must contain only values from the CopySurface enum. Invalid surfaces silently fail matching.
- SEED_RUBRICS is exported as ReadonlyArray<CopyRubric> to prevent runtime mutation; consumers must treat it as the canonical baseline.
- All seed rubrics carry fixed addedAt: '2026-05-25' and addedBy: 'seed' to distinguish them from user-contributed rubrics added later.
- Seed rubrics start with invocations: 0 and empty suppressedAt[]; these track adoption and suppression in production.
- rubricApplies() assumes both arguments are non-null and performs a simple array membership check; callers must validate upstream.

## Interface Contract

```ts
export CopyRubric
export SEED_RUBRICS
export rubricApplies
```

## Dependency Slice

```
import { CopySurface } from '../../findings/schema.js'
import { calmNotPanickyRubric } from './calm-not-panicky.js'
import { describesChangeNotWorkRubric } from './describes-change-not-work.js'
import { grepSurvivesRubric } from './grep-survives.js'
import { signalNotNoiseRubric } from './signal-not-noise.js'
import { specificNotGenericRubric } from './specific-not-generic.js'
import { strangerInSixMonthsRubric } from './stranger-in-6-months.js'
import { CopyRubric } from './types.js'
import { whatWhyHowToFixRubric } from './what-why-how-to-fix.js'
import { whyNotWhatRubric } from './why-not-what.js'
```
