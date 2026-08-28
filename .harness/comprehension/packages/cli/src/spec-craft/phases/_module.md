---
schemaVersion: 1
module: 'packages/cli/src/spec-craft/phases'
sourceHash: 'c03df90a9a51decc3fcbe6fc6fabcc1a139792255de3abdaa088aa353512f92e'
compiledAt: '2026-08-28T01:22:09.417Z'
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
import { SpecRubric } from '../catalog/rubrics/index.js'
import { ParsedSection } from '../extract/sections.js'
import { SpecFinding } from '../findings/schema.js'
```
