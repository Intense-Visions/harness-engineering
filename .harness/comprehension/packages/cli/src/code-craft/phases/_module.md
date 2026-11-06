---
schemaVersion: 1
module: 'packages/cli/src/code-craft/phases'
sourceHash: '86387fed4a2e002dc6903683f1b6c469e907fb61db130858581c1f24332b73b1'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['critique.ts', 'sibling-evidence.ts']
---

## Interface Contract

```ts
export CRITIQUE_SYSTEM_PROMPT
export SIBLING_AWARE_RUBRIC_IDS
export buildPrompt
export critiqueOne
export parseFindingFromRaw
export renderSiblingEvidence
```

## Dependency Slice

```
import { extractFencedJsonPayload } from '../../shared/craft/fenced-json.js'
import { derivePriority } from '../../shared/craft/findings/derived.js'
import { LlmProvider } from '../../shared/craft/llm/provider.js'
import { CodeRubric } from '../catalog/rubrics/index.js'
import { unitSource } from '../extract/units.js'
import { CodeFinding, CodeUnit, Confidence, Impact, Tier } from '../findings/schema.js'
import { renderSiblingEvidence } from './sibling-evidence.js'
import { CloneClass, CloneMember } from '@harness-engineering/core'
```
