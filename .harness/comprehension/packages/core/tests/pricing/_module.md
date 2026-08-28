---
schemaVersion: 1
module: 'packages/core/tests/pricing'
sourceHash: '1452e9983200f1e25ac4e164f69481ef37c71bec531419e909c8756e9019cbc2'
compiledAt: '2026-08-28T01:22:10.888Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['cache.test.ts', 'calculator.test.ts', 'pricing.test.ts']
---

## Summary

`packages/core/tests/pricing` is a three-part test suite validating model pricing lookup, parsing, and cost calculation. The cache layer implements a multi-tier fallback (network → disk cache → expired cache → fallback.json) with 24-hour TTL and 7-day staleness warnings. The parser converts LiteLLM's per-token format to internal per-1M rates, filtering to chat-only models. The calculator computes costs and cache savings in microdollars (integers), gracefully returning null for unknown models or missing pricing data rather than throwing.

## Invariants

- Cache TTL is 24 hours—expired caches trigger re-fetch; older caches still serve on network failure
- Staleness warning fires at 7+ days of fallback.json use; no auto-recovery
- Cost calculations are microdollars, always integers—never float; critical for billing accuracy
- Unknown or missing models return null, not error—graceful partial-knowledge consumption
- Only chat-mode models are indexed—embedding/image_generation/sample_spec filtered at parse time
- Pricing is optional per field (inputPer1M/outputPer1M required; cache fields optional)—partial models still usable
- Cache savings computed only when cache pricing is present—models without cache fields return null for savings

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
