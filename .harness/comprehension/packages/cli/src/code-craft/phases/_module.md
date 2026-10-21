---
schemaVersion: 1
module: 'packages/cli/src/code-craft/phases'
sourceHash: 'faf2c50f3af586cec5d588de65262256d44adcc36187e31b9d021d1133b81dcf'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['critique.ts', 'sibling-evidence.ts']
---

## Interface Contract

```ts
export CRITIQUE_SYSTEM_PROMPT
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
import { CloneClass, CloneMember } from '@harness-engineering/core'
```
