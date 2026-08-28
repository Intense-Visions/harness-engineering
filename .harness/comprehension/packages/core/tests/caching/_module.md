---
schemaVersion: 1
module: 'packages/core/tests/caching'
sourceHash: '08fbac8af1277d40c9c884db1a73fec1ca687ed88d6804f9a8cd549c51abd97d'
compiledAt: '2026-08-28T01:22:10.731Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['adapter-ordering.test.ts', 'adapter.test.ts', 'stability.test.ts']
---

## Summary

The `caching` test module validates three core responsibilities: **adapter interoperability**, **type contracts**, and **cache stability classification**.

**Adapter Ordering & Nullability** (`adapter-ordering.test.ts`): All three provider adapters (Anthropic, OpenAI, Gemini) must order content blocks identically by stability tier (static → session → ephemeral), and parsing cache usage must safely return `{0, 0}` for undefined/empty objects. Tests enforce byte-identical ordering across providers to prevent cross-provider cache invalidation bugs.

**Type Surface** (`adapter.test.ts`): The module defines four public types. `StabilityTaggedBlock` is the internal wire format (stability tier + content + role). `ProviderSystemBlock` and `ProviderToolBlock` are the provider-specific shapes sent to API calls — system blocks support three optional forms (text-only, with `cache_control` directive, or with `cachedContentRef`), and tool blocks wrap definitions with per-tool `cache_control`. `CacheAdapter` is the polymorphic interface all providers implement.

**Stability Classification** (`stability.test.ts`): The `resolveStability()` function maps content node types (both PascalCase and lowercase variants) to cache tiers. Most graph nodes (File, Function, Class) map to `'session'` (stable within a session), tool/skill definitions to `'static'` (never invalidated), and unknowns default to `'ephemeral'` (per-request).

## Invariants

- Adapter ordering is canonical and byte-identical: all adapters must sort blocks by static → session → ephemeral; content within each tier must remain stable across invocations
- Null safety is mandatory: parseCacheUsage(undefined) and parseCacheUsage({}) both return {cacheCreationTokens: 0, cacheReadTokens: 0}; no exceptions or missing fields
- Stability classification is idempotent: both PascalCase (SkillDefinition) and lowercase (skill) input resolve to the same tier; unmapped types always resolve to ephemeral
- Three stability tiers exist: 'static' (never invalidated), 'session' (valid for session duration), 'ephemeral' (per-request, default)
- Provider shapes are polymorphic but structurally fixed: system blocks always have {type, text} core; tool blocks always wrap a tool array; optional fields (cache_control, cachedContentRef) are side-channel metadata

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
