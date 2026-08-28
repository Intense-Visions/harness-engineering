---
schemaVersion: 1
module: 'packages/cli/src/code-craft/phases'
sourceHash: '07f07b1830cbcb0bc46da0c43b90da4f61f5884673b053c96543bb8f33de4799'
compiledAt: '2026-08-28T01:22:08.760Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['critique.ts']
---

## Interface Contract

```ts
export CRITIQUE_SYSTEM_PROMPT
export buildPrompt
export critiqueOne
export parseFindingFromRaw
```

## Dependency Slice

```
import { extractFencedJsonPayload } from '../../shared/craft/fenced-json.js'
import { derivePriority } from '../../shared/craft/findings/derived.js'
import { LlmProvider } from '../../shared/craft/llm/provider.js'
import { CodeRubric } from '../catalog/rubrics/index.js'
import { unitSource } from '../extract/units.js'
import { CodeFinding, CodeUnit, Confidence, Impact, Tier } from '../findings/schema.js'
```
