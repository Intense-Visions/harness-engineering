---
schemaVersion: 1
module: 'packages/cli/src/design-craft/catalog/patterns'
sourceHash: '8bccbedd6420a5d1c2a5832a98bc82e980fc7ad4c8b5c4c700f1a53f9a40b36f'
compiledAt: '2026-08-28T01:22:09.015Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'editorial-two-column-split.ts',
    'fluid-type-scale.ts',
    'focus-ring-craft.ts',
    'index.ts',
    'page-transition-crossfade.ts',
    'progressive-corner-rounding.ts',
    'skeleton-content-matched.ts',
    'spring-physics.ts',
    'stagger-timing.ts',
  ]
---

## Summary

This module defines a living catalog of design patterns for the design-craft skill — reusable, evidence-backed recommendations for common UI composition, typography, motion, and interaction problems. Each pattern is a structured record (PatternDefinition) pairing a symptom detected by a rubric with a concrete remedy (code examples + reasoning). Patterns are prescriptive: a rubric flags a problem; the pattern names the exact move to fix it. The catalog ships incrementally per ADR 0020 (living catalog H pattern) with 8 patterns covering motion (spring physics, stagger timing), typography (fluid type scale), layout (editorial two-column, progressive corner rounding), skeleton UX, interaction (focus ring), and transitions. Each pattern ties to a finding code (CRAFT-Pxxx) so the design-craft skill can emit actionable guidance at analysis time. Exported patterns are consumed via SEED_PATTERNS; applicability rules (css-property/jsx-pattern matchers) help narrow which patterns a codebase section is eligible for.

## Invariants

- ADR 0020 provenance fields (id, version, status, authoredAt, contributors, source) are mandatory on every PatternDefinition for audit trail and change tracking
- Pattern IDs must be globally unique and immutable — renaming breaks downstream references and historical logging
- Every finding code (CRAFT-Pxxx) in a pattern's findingTemplate must exist and be emittable by a rubric; unreferenced codes are dead, and patterns with no matching finding cannot be suggested
- Applicability rules (applicableTo descriptors) must correspond to actual AST/syntax patterns the design analyzer traverses; inert rules that match nothing are noise
- Tier × Impact combinations are bounded (foundational/polish × large/medium/small); inventing new combinations breaks downstream triage and severity routing

## Interface Contract

```ts
export PatternApplicability
export PatternDefinition
export SEED_PATTERNS
export editorialTwoColumnSplitPattern
export fluidTypeScalePattern
export focusRingCraftPattern
export pageTransitionCrossfadePattern
export progressiveCornerRoundingPattern
export skeletonContentMatchedPattern
export springPhysicsPattern
export staggerTimingPattern
```

## Dependency Slice

```
import { FindingPhase, Impact, Tier } from '../../findings/schema.js'
import { CatalogSource, CatalogStatus, FindingTemplate } from '../rubrics/hierarchy-clarity.js'
import { editorialTwoColumnSplitPattern } from './editorial-two-column-split.js'
import { fluidTypeScalePattern } from './fluid-type-scale.js'
import { focusRingCraftPattern } from './focus-ring-craft.js'
import { pageTransitionCrossfadePattern } from './page-transition-crossfade.js'
import { progressiveCornerRoundingPattern } from './progressive-corner-rounding.js'
import { skeletonContentMatchedPattern } from './skeleton-content-matched.js'
import { PatternDefinition, springPhysicsPattern } from './spring-physics.js'
import { staggerTimingPattern } from './stagger-timing.js'
```
