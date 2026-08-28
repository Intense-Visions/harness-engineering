---
schemaVersion: 1
module: 'packages/cli/src/copy-craft/phases'
sourceHash: 'aa7f2603c344695509513fe3dd858f9ec4e1fd293a044e5b0f47d81799105a8a'
compiledAt: '2026-08-28T01:22:08.973Z'
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
import { Confidence, Impact, Tier } from '../../shared/craft/findings/axes.js'
import { derivePriority } from '../../shared/craft/findings/derived.js'
import { LlmProvider } from '../../shared/craft/llm/provider.js'
import { CopyRubric } from '../catalog/rubrics/index.js'
import { CopyFinding, ExtractedCopyItem } from '../findings/schema.js'
```
