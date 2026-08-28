---
schemaVersion: 1
module: 'packages/cli/src/docs-craft/phases'
sourceHash: 'c2d79b8bac552498eba3c165d7b78c0d7c84ef2eec534e6759ff6b99f84ed545'
compiledAt: '2026-08-28T01:22:09.168Z'
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
import { DocKind, DocsRubric } from '../catalog/rubrics/index.js'
import { Confidence, DocsFinding, Impact, Tier } from '../findings/schema.js'
```
