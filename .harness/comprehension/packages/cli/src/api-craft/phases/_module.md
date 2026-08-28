---
schemaVersion: 1
module: 'packages/cli/src/api-craft/phases'
sourceHash: '12255704ee5b0d7d604fae47b2c3d0257ddaaf9bdc2c58c557044b1038813668'
compiledAt: '2026-08-28T01:22:08.714Z'
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
import { ApiRubric, ApiSurfaceKind } from '../catalog/rubrics/index.js'
import { ApiFinding, Confidence, Impact, Tier } from '../findings/schema.js'
```
