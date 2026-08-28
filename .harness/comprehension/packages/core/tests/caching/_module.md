---
schemaVersion: 1
module: 'packages/core/tests/caching'
sourceHash: '08fbac8af1277d40c9c884db1a73fec1ca687ed88d6804f9a8cd549c51abd97d'
compiledAt: '2026-08-28T01:22:10.731Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['adapter-ordering.test.ts', 'adapter.test.ts', 'stability.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { CacheAdapter, ProviderSystemBlock, ProviderToolBlock, StabilityTaggedBlock } from '../../src/caching/adapter'
import { AnthropicCacheAdapter } from '../../src/caching/adapters/anthropic'
import { GeminiCacheAdapter } from '../../src/caching/adapters/gemini'
import { OpenAICacheAdapter } from '../../src/caching/adapters/openai'
import { resolveStability } from '../../src/caching/stability'
import { describe, expect, it } from 'vitest'
```
