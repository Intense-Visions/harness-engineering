---
schemaVersion: 1
module: 'packages/cli/src/cli-ergonomics-craft/phases'
sourceHash: 'e28620db79e88d7f7758a77c955735500b39c3f2d8c575e528db7984aef318f8'
compiledAt: '2026-08-28T01:22:08.752Z'
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
import { CliRubric, CommandKind } from '../catalog/rubrics/index.js'
import { CliErgonomicsFinding, Confidence, Impact, Tier } from '../findings/schema.js'
```
