---
schemaVersion: 1
module: 'packages/core/src/pricing'
sourceHash: 'b336bc63c6fa430474a65f6bfe25c2806e3e56b8b3e75b164812b5d281a18d98'
compiledAt: '2026-08-28T01:22:10.442Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['cache.ts', 'calculator.ts', 'index.ts', 'pricing.ts', 'types.ts']
---

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
