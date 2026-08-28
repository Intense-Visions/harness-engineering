---
schemaVersion: 1
module: 'packages/core/src/pricing'
sourceHash: 'c30f32d4cceeeee8f149f597b09a9b886ed502261ed67732bc29bb5e9ea3cda3'
compiledAt: '2026-08-28T13:27:23.844Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['cache.ts', 'calculator.ts', 'index.ts', 'pricing.ts', 'select.ts', 'types.ts']
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
export cheapestModelByCost
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
