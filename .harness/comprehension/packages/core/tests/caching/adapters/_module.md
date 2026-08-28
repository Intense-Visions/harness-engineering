---
schemaVersion: 1
module: 'packages/core/tests/caching/adapters'
sourceHash: 'af605a372e7573a1b7d20826d41c166d227ea8b7317b8d66f326d1655cadb448'
compiledAt: '2026-08-28T01:22:10.751Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['anthropic.test.ts', 'gemini.test.ts', 'openai.test.ts']
---

## Summary

This module contains test suites for three LLM provider-specific caching adapters (Anthropic, Gemini, OpenAI) that standardize prompt caching across providers' different API contracts. Each adapter implements a common interface for wrapping content by stability tier (static/session/ephemeral), reordering blocks, and parsing cache usage metrics from provider responses.

## Invariants

- Stability-first ordering: content must be sorted static → session → ephemeral consistently across all providers to maximize cache reuse
- Provider-specific wrapping rules: Anthropic decorates cache blocks with control directives; Gemini uses cachedContentRef markers for static blocks; OpenAI passes through unchanged
- Anthropic tool indexing: only the last tool definition receives cache_control; this matches the API contract
- Response parsing contract: all parseCacheUsage() implementations must return {cacheCreationTokens: number, cacheReadTokens: number} with graceful fallback to zeros
- Immutability of inputs: adapters must not mutate original tool arrays or block lists; wrapping and ordering return new structures
- Resilient to missing fields: handlers for null/undefined responses and missing usage/usageMetadata fields must return zeros, never throw

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
