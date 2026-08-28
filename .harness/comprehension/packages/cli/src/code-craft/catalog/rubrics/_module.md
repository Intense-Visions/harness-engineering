---
schemaVersion: 1
module: 'packages/cli/src/code-craft/catalog/rubrics'
sourceHash: '1c952658958e3e8b0d487e28c60d76e744b85e965cd4ea730a7bc142b5cdfd9a'
compiledAt: '2026-08-28T01:22:08.770Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'abstraction-earns-keep.ts',
    'control-flow-honest.ts',
    'index.ts',
    'one-story-one-altitude.ts',
    'reveals-intent.ts',
    'senior-nods-not-winces.ts',
    'signature-keeps-promise.ts',
    'simplest-it-could-be.ts',
    'types.ts',
  ]
---

## Summary

The rubrics module is a living catalog (ADR-0020) of 7 seed code quality criteria (R001–R007) that ask ceiling-level questions: does the code reveal intent, is control flow honest, does it tell one story at one altitude, does each abstraction earn its keep, is it as simple as it could be, does the signature keep its promise, and would a senior nod or wince? Each rubric is domain-agnostic, versioned, immutable, gated by `appliesToKinds` (function/method/class), and sourced to classical software engineering references. This is the structural twin of security-craft and docs-craft's rubric catalogs and explicitly boundaries away identifier-level naming (naming-craft's job) in favor of shape, intent, and structure.

## Invariants

- Each rubric must declare appliesToKinds to filter irrelevant unit types (mirrors security-craft appliesToSignals pattern)
- Naming-craft owns identifier quality; code-craft owns shape/intent/structure — CODE-R006 explicitly fires only on signature shape misrepresenting behavior, not name quality
- CODE-R007 (senior-nods-not-winces) is holistic judgment only — reviewers must not duplicate findings already made by R001–R006
- The catalog is living (ADR-0020) — SEED_RUBRICS initializes 7 entries, but contribution metadata and versioning support future evolution
- Each rubric is immutable with version number and signal metadata (invocations, suppressedAt[]) for usage tracking without mutation
- Rubrics are domain-agnostic and sourced to classical software engineering references (Ousterhout, Fowler, Beck, Kernighan & Pike) — no language-specific logic

## Interface Contract

```ts
export CodeRubric
export SEED_RUBRICS
export UnitKind
export rubricApplies
```

## Dependency Slice

```
import { UnitKind } from '../../findings/schema.js'
import { abstractionEarnsKeepRubric } from './abstraction-earns-keep.js'
import { controlFlowHonestRubric } from './control-flow-honest.js'
import { oneStoryOneAltitudeRubric } from './one-story-one-altitude.js'
import { revealsIntentRubric } from './reveals-intent.js'
import { seniorNodsNotWincesRubric } from './senior-nods-not-winces.js'
import { signatureKeepsPromiseRubric } from './signature-keeps-promise.js'
import { simplestItCouldBeRubric } from './simplest-it-could-be.js'
import { CodeRubric } from './types.js'
```
