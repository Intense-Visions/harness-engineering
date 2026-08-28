---
schemaVersion: 1
module: 'packages/cli/src/knowledge-craft/phases'
sourceHash: 'e1186421fda0a3c714f4ad354b39fc6c090a219c2a6d81717cb61b6b3fd01813'
compiledAt: '2026-08-28T01:22:09.236Z'
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
import { KnowledgeRubric } from '../catalog/rubrics/index.js'
import { Confidence, Impact, KnowledgeFinding, Tier } from '../findings/schema.js'
```
