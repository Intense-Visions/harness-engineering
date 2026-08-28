---
schemaVersion: 1
module: 'packages/cli/src/test-craft/phases'
sourceHash: 'd39b9cf7a94e2714211f119a16b97cafd45b7f7f0518fcd1504e2e6709ddbd19'
compiledAt: '2026-08-28T01:22:09.461Z'
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
import { TestRubric } from '../catalog/rubrics/index.js'
import { SourcePairResult } from '../extract/source-pair.js'
import { ExtractedTest, TestFinding } from '../findings/schema.js'
```
