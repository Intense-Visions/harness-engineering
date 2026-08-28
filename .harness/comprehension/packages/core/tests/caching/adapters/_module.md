---
schemaVersion: 1
module: 'packages/core/tests/caching/adapters'
sourceHash: 'af605a372e7573a1b7d20826d41c166d227ea8b7317b8d66f326d1655cadb448'
compiledAt: '2026-08-28T01:22:10.751Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['anthropic.test.ts', 'gemini.test.ts', 'openai.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { StabilityTaggedBlock, ToolDefinition } from '../../../src/caching/adapter'
import { AnthropicCacheAdapter } from '../../../src/caching/adapters/anthropic'
import { GeminiCacheAdapter } from '../../../src/caching/adapters/gemini'
import { OpenAICacheAdapter } from '../../../src/caching/adapters/openai'
import { describe, expect, it } from 'vitest'
```
