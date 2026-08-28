---
schemaVersion: 1
module: 'packages/cli/src/design-craft/catalog/rubrics'
sourceHash: 'da393af9b0cf67e8a7ee7aa95588d86dac216288d6631d9a492c151f50616e94'
compiledAt: '2026-08-28T01:22:09.095Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
