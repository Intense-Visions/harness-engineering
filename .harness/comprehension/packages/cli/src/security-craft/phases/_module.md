---
schemaVersion: 1
module: 'packages/cli/src/security-craft/phases'
sourceHash: '0d0a760ba88b612d2b2ddddee663b67c0a3c752390ad80461f20cd98c4f2874b'
compiledAt: '2026-08-28T01:22:09.335Z'
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
import { SecurityRubric } from '../catalog/rubrics/index.js'
import { Confidence, Impact, SecurityFinding, SecuritySignal, Tier } from '../findings/schema.js'
```
