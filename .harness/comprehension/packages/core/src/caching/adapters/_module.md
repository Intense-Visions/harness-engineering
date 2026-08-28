---
schemaVersion: 1
module: 'packages/core/src/caching/adapters'
sourceHash: '7665e1b9b6fe9e89f44e59ecb3170ec08ca277fc90cc2e7c74488df941af800e'
compiledAt: '2026-08-28T01:22:10.280Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['anthropic.ts', 'gemini.ts', 'openai.ts']
---

## Summary

This module provides three provider-specific cache adapters (Anthropic, Gemini, OpenAI) that normalize a unified caching model across LLM providers. Each adapter implements the `CacheAdapter` interface to translate stability tiers (static, session, ephemeral) into provider-native cache directives. Anthropic uses `cache_control` blocks with type/ttl, applying cache control to the last tool definition as a breakpoint marker. Gemini marks static blocks with a `cachedContentRef` placeholder for the orchestrator to resolve into real `cachedContents/{id}` resources, while session/ephemeral passthrough. OpenAI relies on automatic prefix-matching and only optimizes via content ordering (static→session→ephemeral) to maximize stable prefix length. All three implement uniform content ordering and provider-specific cache usage parsing.

## Invariants

- Tier ordering is global: all adapters use identical TIER_ORDER (static=0, session=1, ephemeral=2); content must be ordered consistently across providers.
- Anthropic caches via last-tool breakpoint: the last element of the tools array receives cache_control; earlier tools inherit the cache; reordering tools or omitting the mark breaks caching.
- Gemini cachedContents are orchestrator-resolved: the adapter emits 'cachedContents:pending' as a marker; orchestrator must swap it with real resource IDs from the Gemini API; pending markers must not ship.
- Empty tools array bypasses all cache directives: all three adapters check tools.length === 0 first and passthrough without modifications, regardless of stability tier.
- orderContent never mutates input: all adapters create a new array before sorting; input blocks are immutable.
- Cache usage parsing is provider-specific: Anthropic reads cache_creation_input_tokens + cache_read_input_tokens; Gemini reads only cachedContentTokenCount; OpenAI reads prompt_tokens_details.cached_tokens; mismatched field reads return 0, never throw.
- Provider identity is readonly: each adapter's provider property is immutable and uniquely identifies it (used for routing at runtime).

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
