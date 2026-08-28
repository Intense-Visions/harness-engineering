---
schemaVersion: 1
module: 'packages/core/src/caching/adapters'
sourceHash: '7665e1b9b6fe9e89f44e59ecb3170ec08ca277fc90cc2e7c74488df941af800e'
compiledAt: '2026-08-28T01:22:10.280Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['anthropic.ts', 'gemini.ts', 'openai.ts']
---

## Interface Contract

```ts
export AnthropicCacheAdapter
export GeminiCacheAdapter
export OpenAICacheAdapter
```

## Dependency Slice

```
import { CacheAdapter, ProviderSystemBlock, ProviderToolBlock, StabilityTaggedBlock, ToolDefinition } from '../adapter'
import { StabilityTier } from '@harness-engineering/types'
```
