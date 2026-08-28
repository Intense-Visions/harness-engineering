---
schemaVersion: 1
module: 'packages/core/tests/pricing'
sourceHash: '1452e9983200f1e25ac4e164f69481ef37c71bec531419e909c8756e9019cbc2'
compiledAt: '2026-08-28T01:22:10.888Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['cache.test.ts', 'calculator.test.ts', 'pricing.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { CACHE_TTL_MS, LITELLM_PRICING_URL, STALENESS_WARNING_DAYS, loadPricingData } from '../../src/pricing/cache'
import { calculateCacheSavings, calculateCost } from '../../src/pricing/calculator'
import { getModelPrice, parseLiteLLMData } from '../../src/pricing/pricing'
import { LiteLLMPricingData, PricingDataset } from '../../src/pricing/types'
import { ModelPricing, UsageRecord } from '@harness-engineering/types'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
