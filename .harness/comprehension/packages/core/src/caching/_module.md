---
schemaVersion: 1
module: 'packages/core/src/caching'
sourceHash: 'eb7367817ec73c49cd84939a189c6137828571fe4fc11b2d39f79e0c22daba9a'
compiledAt: '2026-08-28T01:22:10.270Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['adapter.ts', 'index.ts', 'stability.ts']
---

## Summary

The `packages/core/src/caching` module provides a provider-agnostic prompt caching abstraction that translates stability tiers into provider-native cache directives. It bridges Harness's internal stability classification (from the graph system) with Anthropic's explicit `cache_control`, OpenAI's prefix-matching, and Gemini's `cachedContents` references. The core abstraction is `CacheAdapter`: implementations wrap system prompts and tools with provider-specific metadata, order message blocks for optimal cache hits, and extract cache token usage from responses. A `resolveStability()` lookup maps graph node types (both PascalCase display names and lowercase enum values) to `StabilityTier` classifications, enabling content to carry its cache lifetime alongside its payload.

## Invariants

- Stability lookup is dual-keyed: both PascalCase (SkillDefinition) and lowercase (skill) versions must resolve to the same tier; special cases like packed_summary are explicitly mapped to prevent false misses from naive toLowerCase() normalization.
- Unrecognized types fail open to ephemeral: any contentType not in the lookup returns 'ephemeral' (shortest TTL), never throws—ensures old/new code coexist without breaking on unknown node types.
- Provider adapters are interchangeable: callers inject a CacheAdapter and never touch provider-specific shapes (cache_control, cachedContentRef) directly; the interface contract decouples stability decisions from implementation details.
- Content ordering is semantic: CacheAdapter.orderContent() preserves role/stability structure; OpenAI depends on this for prefix-matching heuristics, while Anthropic/Gemini use it for prioritizing which blocks to tag.
- Stability is immutable at wrap time: once wrapSystemBlock() or wrapTools() returns, the cache directive is frozen; changes to stability tier require re-wrapping.

## Interface Contract

```ts
export AnthropicCacheAdapter
export CacheAdapter
export GeminiCacheAdapter
export OpenAICacheAdapter
export ProviderSystemBlock
export ProviderToolBlock
export StabilityTaggedBlock
export ToolDefinition
export resolveStability
```

## Dependency Slice

```
import { NODE_STABILITY } from '@harness-engineering/graph'
import { StabilityTier } from '@harness-engineering/types'
```
