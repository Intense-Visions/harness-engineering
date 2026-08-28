---
schemaVersion: 1
module: 'packages/cli/src/naming-craft/phases'
sourceHash: '0f8f0c559d177aa6381b665998a419e748d12b5cf6d731ae85f4d8c502b60b11'
compiledAt: '2026-08-28T01:22:09.298Z'
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
import { NamingRubric } from '../catalog/rubrics/index.js'
import { ExtractedIdentifier } from '../extract/identifiers.js'
import { derivePriority } from '../findings/derived.js'
import { Confidence, Impact, NamingFinding, ProjectConvention, Tier } from '../findings/schema.js'
import { LlmProvider } from '../llm/provider.js'
```
