---
schemaVersion: 1
module: 'packages/core/src/pricing'
sourceHash: 'b336bc63c6fa430474a65f6bfe25c2806e3e56b8b3e75b164812b5d281a18d98'
compiledAt: '2026-08-28T01:22:10.442Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['cache.ts', 'calculator.ts', 'index.ts', 'pricing.ts', 'types.ts']
---

## Summary

The `packages/core/src/pricing` module manages LLM pricing data with a resilient multi-tier fallback strategy. It fetches model pricing from LiteLLM's public repo, caches locally for 24 hours, and degrades gracefully to a bundled fallback when offline. The module converts token usage (input, output, cache reads, cache writes) into integer microdollar costs. Main entry point `loadPricingData(projectRoot)` hydrates a `PricingDataset` (model name → pricing map). Cost calculation uses `calculateCost()` and `calculateCacheSavings()` on usage records. Key behaviors: tiered cache strategy (fresh disk cache → network fetch → expired cache → bundled fallback), staleness detection (warns if fallback used >7 days), chat-only filtering, and microdollar precision arithmetic.

## Invariants

- CACHE_TTL_MS = 24 hours — cache age check is hardcoded; changing it shifts all cache invalidation timing
- TOKENS_PER_MILLION = 1_000_000 — per-token costs normalized to per-million basis in both pricing.ts and calculator.ts; must stay in sync
- MICRODOLLARS_PER_DOLLAR = 1_000_000 — cost totals multiplied by this; rounding must happen after conversion to avoid precision loss
- Only chat-mode models included — parseLiteLLMData filters mode !== 'chat'; removing this silently changes dataset
- Null-checked cache pricing fields — calculateCost guards both record.cacheReadTokens and pricing.cacheReadPer1M separately; if one exists without the other, calculation skips silently
- Staleness marker cleared on any fresh load — clearStalenessMarker called after cache or network success; breaking this link means 7-day warning never resets
- Network fetch validates response shape — rejects non-objects/nulls/arrays to prevent caching HTML error pages
- Bundled fallback.json always present — loadFallbackDataset is synchronous and assumes valid JSON; missing or corrupt fallback breaks entire module
- Model name lookup is exact-match only — getModelPrice does .get(model) with no normalization; callers must pass exact key from LiteLLM
- Cache file path is .harness/cache/pricing.json — hard-coded in getCachePath(); changing it breaks cache persistence across runs

## Interface Contract

```ts
export CACHE_TTL_MS
export FallbackPricingFile
export LITELLM_PRICING_URL
export LiteLLMModelEntry
export LiteLLMPricingData
export PricingCacheFile
export PricingDataset
export STALENESS_WARNING_DAYS
export calculateCacheSavings
export calculateCost
export getModelPrice
export loadPricingData
export parseLiteLLMData
```

## Dependency Slice

```
import fallbackData from './fallback.json'
import { getModelPrice, parseLiteLLMData } from './pricing'
import { FallbackPricingFile, LiteLLMPricingData, PricingCacheFile, PricingDataset } from './types'
import { ModelPricing, UsageRecord } from '@harness-engineering/types'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
```
