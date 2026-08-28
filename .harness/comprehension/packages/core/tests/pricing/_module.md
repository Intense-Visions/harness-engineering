---
schemaVersion: 1
module: 'packages/core/tests/pricing'
sourceHash: 'da908fcb206e8000d7f439a97ffdb7d834f754c73c3eb85539f839424cbc12a4'
compiledAt: '2026-08-28T13:24:26.345Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['cache.test.ts', 'calculator.test.ts', 'pricing.test.ts', 'select.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { CACHE_TTL_MS, LITELLM_PRICING_URL, STALENESS_WARNING_DAYS, loadPricingData } from '../../src/pricing/cache'
import { calculateCacheSavings, calculateCost } from '../../src/pricing/calculator'
import { getModelPrice, parseLiteLLMData } from '../../src/pricing/pricing'
import { cheapestModelByCost } from '../../src/pricing/select'
import { LiteLLMPricingData, PricingDataset } from '../../src/pricing/types'
import { ModelPricing, UsageRecord } from '@harness-engineering/types'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
