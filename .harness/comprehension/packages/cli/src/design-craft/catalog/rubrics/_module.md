---
schemaVersion: 1
module: 'packages/cli/src/design-craft/catalog/rubrics'
sourceHash: 'da393af9b0cf67e8a7ee7aa95588d86dac216288d6631d9a492c151f50616e94'
compiledAt: '2026-08-28T01:22:09.095Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'brand-coherence.ts',
    'color-confidence.ts',
    'composition-art-direction.ts',
    'concept-coherence.ts',
    'copy-voice.ts',
    'density-rhythm.ts',
    'hierarchy-clarity.ts',
    'index.ts',
    'interaction-craft.ts',
    'motion-quality.ts',
    'polish-details.ts',
    'restraint.ts',
    'surface-texture-material.ts',
    'typography-craft.ts',
  ]
---

## Summary

The `rubrics` module provides the seed catalog of design critique rubrics for the design-craft pipeline. It defines a type system for parameterized LLM-judgment prompts and exports 13 stable rubric definitions that evaluate components and pages across different design dimensions (hierarchy, typography, color, motion, density, restraint, polish, voice, interaction, brand coherence, and page-level composition). Each rubric is a `RubricDefinition` containing an LLM prompt template with `{target}` and `{source}` placeholders, positive/negative examples, and a `findingTemplate` that fixes the finding code. The seed is deliberately closed: the first 10 (C001–C010) cover component-level critique across every operationally-relevant tier × impact pair; the final 3 (C011–C013) open a page-scoped tier for marketing-page direction judgments.

## Invariants

- SEED_RUBRICS array order is canonical — The export order of the 13 rubrics must match CRAFT-C001..C013 codes; finding listings and markdown formatters depend on this stable sequence.
- RubricDefinition metadata is required — Every rubric must have id, version, status, authoredAt, contributors, and source fields per ADR 0020; these enable provenance tracking and growth signal.
- The v1 seed (C001–C010) is closed — These 10 rubrics deliberately span all meaningful tier × impact combinations and form a complete evaluation matrix; no new component-level rubrics should enter v1.
- Prompt templates use fixed placeholders — All rubric prompts use {target} (component identifier) and {source} (source code) placeholders; the critique phase replaces these at runtime, so changing placeholder names breaks the pipeline.
- appliesTo scope gates execution — Rubrics marked appliesTo: ['page'] (C011–C013) must not be invoked on components, and vice versa; this separation is architectural.
- Tier defaults in findingTemplate are rubric-stable — The tier specified in findingTemplate represents the LLM's expected baseline; impact may vary per target, but tier rarely overrides.

## Interface Contract

```ts
export CatalogSource
export CatalogStatus
export FindingTemplate
export RubricDefinition
export RubricScope
export SEED_RUBRICS
export brandCoherenceRubric
export colorConfidenceRubric
export compositionArtDirectionRubric
export conceptCoherenceRubric
export copyVoiceRubric
export densityRhythmRubric
export hierarchyClarityRubric
export interactionCraftRubric
export motionQualityRubric
export polishDetailsRubric
export restraintRubric
export surfaceTextureMaterialRubric
export typographyCraftRubric
```

## Dependency Slice

```
import { FindingPhase, Impact, Tier } from '../../findings/schema.js'
import { brandCoherenceRubric } from './brand-coherence.js'
import { colorConfidenceRubric } from './color-confidence.js'
import { compositionArtDirectionRubric } from './composition-art-direction.js'
import { conceptCoherenceRubric } from './concept-coherence.js'
import { copyVoiceRubric } from './copy-voice.js'
import { densityRhythmRubric } from './density-rhythm.js'
import { RubricDefinition, hierarchyClarityRubric } from './hierarchy-clarity.js'
import { interactionCraftRubric } from './interaction-craft.js'
import { motionQualityRubric } from './motion-quality.js'
import { polishDetailsRubric } from './polish-details.js'
import { restraintRubric } from './restraint.js'
import { surfaceTextureMaterialRubric } from './surface-texture-material.js'
import { typographyCraftRubric } from './typography-craft.js'
```
