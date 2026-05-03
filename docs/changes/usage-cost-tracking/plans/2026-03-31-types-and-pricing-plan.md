# Plan: Types & Pricing (Usage Cost Tracking Phase 1)

**Date:** 2026-03-31
**Spec:** docs/changes/usage-cost-tracking/proposal.md
**Estimated tasks:** 7
**Estimated time:** 25 minutes

## Goal

Define the `UsageRecord` type and implement a pricing module that fetches model pricing from LiteLLM with disk caching, static fallback, and a cost calculator — all with unit tests.

## Observable Truths (Acceptance Criteria)

1. `packages/types/src/usage.ts` exists and exports `TokenUsage` (re-exported from orchestrator), `UsageRecord`, and `ModelPricing` interfaces.
2. When `getModelPrice("claude-sonnet-4-20250514")` is called with a cached/fetched pricing dataset, the system shall return a `ModelPricing` object with `inputPer1M`, `outputPer1M`, `cacheReadPer1M`, and `cacheWritePer1M` fields.
3. When `getModelPrice("nonexistent-model-xyz")` is called, the system shall return `null` and log a warning.
4. When the network is available, `loadPricingData()` shall fetch from the LiteLLM GitHub URL and write to `.harness/cache/pricing.json` with a timestamp.
5. When `.harness/cache/pricing.json` exists and is less than 24 hours old, `loadPricingData()` shall return the cached data without making a network request.
6. When the network fetch fails and a disk cache exists (regardless of age), the system shall return the disk cache.
7. When the network fetch fails and no disk cache exists, the system shall return the bundled `fallback.json` data.
8. When fallback data has been used for more than 7 days (based on a staleness marker file), the system shall emit a staleness warning via `console.warn`.
9. When `calculateCost(record)` is called with a record that has a known model, the system shall return cost in integer microdollars.
10. When `calculateCost(record)` is called with a record whose model is unknown or absent, the system shall return `null`.
11. `npx vitest run packages/core/tests/pricing/` passes with all tests green.
12. `harness validate` passes.

## File Map

```
CREATE packages/types/src/usage.ts
MODIFY packages/types/src/index.ts (add usage exports)
CREATE packages/core/src/pricing/index.ts
CREATE packages/core/src/pricing/types.ts
CREATE packages/core/src/pricing/pricing.ts
CREATE packages/core/src/pricing/cache.ts
CREATE packages/core/src/pricing/calculator.ts
CREATE packages/core/src/pricing/fallback.json
MODIFY packages/core/src/index.ts (add pricing exports)
CREATE packages/core/tests/pricing/pricing.test.ts
CREATE packages/core/tests/pricing/cache.test.ts
CREATE packages/core/tests/pricing/calculator.test.ts
```

## Tasks

### Task 1: Define UsageRecord and ModelPricing types

**Depends on:** none
**Files:** `packages/types/src/usage.ts`, `packages/types/src/index.ts`

1. Create `packages/types/src/usage.ts`:

   ```typescript
   import type { TokenUsage } from './orchestrator';

   // Re-export TokenUsage for convenience
   export type { TokenUsage } from './orchestrator';

   /**
    * Extended entry for cost tracking storage and display.
    * Composes TokenUsage — does not extend it.
    */
   export interface UsageRecord {
     /** Harness session identifier */
     sessionId: string;
     /** ISO 8601 timestamp of the usage event */
     timestamp: string;
     /** Token counts for this event */
     tokens: TokenUsage;
     /** Tokens used to create prompt cache entries */
     cacheCreationTokens?: number;
     /** Tokens read from prompt cache */
     cacheReadTokens?: number;
     /** Model identifier (e.g., "claude-sonnet-4-20250514") */
     model?: string;
     /** Cost in integer microdollars (USD * 1,000,000), calculated at read time */
     costMicroUSD?: number;
   }

   /**
    * Per-model pricing rates, all in USD per 1 million tokens.
    */
   export interface ModelPricing {
     /** Input token cost per 1M tokens */
     inputPer1M: number;
     /** Output token cost per 1M tokens */
     outputPer1M: number;
     /** Cache read cost per 1M tokens (not all models support caching) */
     cacheReadPer1M?: number;
     /** Cache write/creation cost per 1M tokens */
     cacheWritePer1M?: number;
   }
   ```

2. Add exports to `packages/types/src/index.ts` — append before the orchestrator export block:

   ```typescript
   // --- Usage & Cost Tracking Types ---
   export type { UsageRecord, ModelPricing } from './usage';
   export { type TokenUsage } from './usage';
   ```

   Note: `TokenUsage` is already exported from the orchestrator block. The usage.ts re-export is for consumers who want to import from the usage module directly. The index.ts addition exports `UsageRecord` and `ModelPricing` only — `TokenUsage` is already available.

   Actual edit to `packages/types/src/index.ts` — add before `// --- Session State Types ---`:

   ```typescript
   // --- Usage & Cost Tracking Types ---
   export type { UsageRecord, ModelPricing } from './usage';
   ```

3. Run: `cd packages/types && npx tsc --noEmit`
4. Run: `harness validate`
5. Commit: `feat(types): add UsageRecord and ModelPricing types for cost tracking`

---

### Task 2: Create fallback.json with static pricing data

**Depends on:** none
**Files:** `packages/core/src/pricing/fallback.json`

1. Create `packages/core/src/pricing/fallback.json`:

   ```json
   {
     "_generatedAt": "2026-03-31",
     "_source": "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
     "models": {
       "claude-opus-4-20250514": {
         "inputPer1M": 15.0,
         "outputPer1M": 75.0,
         "cacheReadPer1M": 1.5,
         "cacheWritePer1M": 18.75
       },
       "claude-sonnet-4-20250514": {
         "inputPer1M": 3.0,
         "outputPer1M": 15.0,
         "cacheReadPer1M": 0.3,
         "cacheWritePer1M": 3.75
       },
       "claude-3-5-haiku-20241022": {
         "inputPer1M": 0.8,
         "outputPer1M": 4.0,
         "cacheReadPer1M": 0.08,
         "cacheWritePer1M": 1.0
       },
       "gpt-4o": {
         "inputPer1M": 2.5,
         "outputPer1M": 10.0,
         "cacheReadPer1M": 1.25
       },
       "gpt-4o-mini": {
         "inputPer1M": 0.15,
         "outputPer1M": 0.6,
         "cacheReadPer1M": 0.075
       },
       "gemini-2.0-flash": {
         "inputPer1M": 0.1,
         "outputPer1M": 0.4,
         "cacheReadPer1M": 0.025
       },
       "gemini-2.5-pro": {
         "inputPer1M": 1.25,
         "outputPer1M": 10.0,
         "cacheReadPer1M": 0.3125
       }
     }
   }
   ```

2. Run: `harness validate`
3. Commit: `feat(pricing): add bundled fallback.json with static model pricing`

---

### Task 3: Implement pricing types and getModelPrice with tests (TDD)

**Depends on:** Task 1, Task 2
**Files:** `packages/core/src/pricing/types.ts`, `packages/core/src/pricing/pricing.ts`, `packages/core/tests/pricing/pricing.test.ts`

1. Create `packages/core/src/pricing/types.ts`:

   ```typescript
   import type { ModelPricing } from '@harness-engineering/types';

   /** Shape of the LiteLLM pricing JSON (per-model entry). */
   export interface LiteLLMModelEntry {
     input_cost_per_token?: number;
     output_cost_per_token?: number;
     cache_read_input_token_cost?: number;
     cache_creation_input_token_cost?: number;
     mode?: string;
     [key: string]: unknown;
   }

   /** Shape of the full LiteLLM pricing JSON file. */
   export interface LiteLLMPricingData {
     [modelName: string]: LiteLLMModelEntry;
   }

   /** Parsed pricing dataset keyed by model name. */
   export type PricingDataset = Map<string, ModelPricing>;

   /** Shape of the disk cache file. */
   export interface PricingCacheFile {
     fetchedAt: string;
     data: LiteLLMPricingData;
   }

   /** Shape of the fallback.json file. */
   export interface FallbackPricingFile {
     _generatedAt: string;
     _source: string;
     models: Record<string, ModelPricing>;
   }
   ```

2. Create test file `packages/core/tests/pricing/pricing.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { parseLiteLLMData, getModelPrice } from '../../src/pricing/pricing';
   import type { LiteLLMPricingData, PricingDataset } from '../../src/pricing/types';

   describe('parseLiteLLMData', () => {
     it('should parse Claude model pricing from LiteLLM format', () => {
       const raw: LiteLLMPricingData = {
         'claude-sonnet-4-20250514': {
           input_cost_per_token: 3e-6,
           output_cost_per_token: 1.5e-5,
           cache_read_input_token_cost: 3e-7,
           cache_creation_input_token_cost: 3.75e-6,
           mode: 'chat',
         },
       };
       const dataset = parseLiteLLMData(raw);
       const pricing = dataset.get('claude-sonnet-4-20250514');
       expect(pricing).toBeDefined();
       expect(pricing!.inputPer1M).toBeCloseTo(3.0, 4);
       expect(pricing!.outputPer1M).toBeCloseTo(15.0, 4);
       expect(pricing!.cacheReadPer1M).toBeCloseTo(0.3, 4);
       expect(pricing!.cacheWritePer1M).toBeCloseTo(3.75, 4);
     });

     it('should skip non-chat models (image_generation, embedding, etc.)', () => {
       const raw: LiteLLMPricingData = {
         'dall-e-3': {
           mode: 'image_generation',
         },
         'text-embedding-3-small': {
           input_cost_per_token: 2e-8,
           mode: 'embedding',
         },
       };
       const dataset = parseLiteLLMData(raw);
       expect(dataset.size).toBe(0);
     });

     it('should skip sample_spec entry', () => {
       const raw: LiteLLMPricingData = {
         sample_spec: {
           input_cost_per_token: 0,
           output_cost_per_token: 0,
           mode: 'chat',
         },
       };
       const dataset = parseLiteLLMData(raw);
       expect(dataset.size).toBe(0);
     });

     it('should handle models without cache pricing', () => {
       const raw: LiteLLMPricingData = {
         'gpt-4o': {
           input_cost_per_token: 2.5e-6,
           output_cost_per_token: 1e-5,
           cache_read_input_token_cost: 1.25e-6,
           mode: 'chat',
         },
       };
       const dataset = parseLiteLLMData(raw);
       const pricing = dataset.get('gpt-4o');
       expect(pricing).toBeDefined();
       expect(pricing!.cacheReadPer1M).toBeCloseTo(1.25, 4);
       expect(pricing!.cacheWritePer1M).toBeUndefined();
     });

     it('should skip models with no input or output cost', () => {
       const raw: LiteLLMPricingData = {
         'broken-model': {
           mode: 'chat',
         },
       };
       const dataset = parseLiteLLMData(raw);
       expect(dataset.size).toBe(0);
     });
   });

   describe('getModelPrice', () => {
     it('should return pricing for a known model', () => {
       const dataset: PricingDataset = new Map([
         [
           'claude-sonnet-4-20250514',
           { inputPer1M: 3.0, outputPer1M: 15.0, cacheReadPer1M: 0.3, cacheWritePer1M: 3.75 },
         ],
       ]);
       const result = getModelPrice('claude-sonnet-4-20250514', dataset);
       expect(result).toEqual({
         inputPer1M: 3.0,
         outputPer1M: 15.0,
         cacheReadPer1M: 0.3,
         cacheWritePer1M: 3.75,
       });
     });

     it('should return null and log warning for unknown model', () => {
       const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
       const dataset: PricingDataset = new Map();
       const result = getModelPrice('nonexistent-model', dataset);
       expect(result).toBeNull();
       expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent-model'));
       warnSpy.mockRestore();
     });

     it('should return null for undefined model string', () => {
       const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
       const dataset: PricingDataset = new Map();
       const result = getModelPrice(undefined as unknown as string, dataset);
       expect(result).toBeNull();
       warnSpy.mockRestore();
     });
   });
   ```

3. Run test: `cd packages/core && npx vitest run tests/pricing/pricing.test.ts`
4. Observe failure: modules not found.

5. Create `packages/core/src/pricing/pricing.ts`:

   ```typescript
   import type { ModelPricing } from '@harness-engineering/types';
   import type { LiteLLMPricingData, PricingDataset } from './types';

   const TOKENS_PER_MILLION = 1_000_000;

   /**
    * Parses LiteLLM's raw pricing JSON into a PricingDataset map.
    * Only includes chat-mode models with valid input/output costs.
    */
   export function parseLiteLLMData(raw: LiteLLMPricingData): PricingDataset {
     const dataset: PricingDataset = new Map();

     for (const [modelName, entry] of Object.entries(raw)) {
       // Skip the sample_spec documentation entry
       if (modelName === 'sample_spec') continue;

       // Only include chat models
       if (entry.mode && entry.mode !== 'chat') continue;

       const inputCost = entry.input_cost_per_token;
       const outputCost = entry.output_cost_per_token;

       // Skip models without pricing data
       if (inputCost == null || outputCost == null) continue;

       const pricing: ModelPricing = {
         inputPer1M: inputCost * TOKENS_PER_MILLION,
         outputPer1M: outputCost * TOKENS_PER_MILLION,
       };

       if (entry.cache_read_input_token_cost != null) {
         pricing.cacheReadPer1M = entry.cache_read_input_token_cost * TOKENS_PER_MILLION;
       }
       if (entry.cache_creation_input_token_cost != null) {
         pricing.cacheWritePer1M = entry.cache_creation_input_token_cost * TOKENS_PER_MILLION;
       }

       dataset.set(modelName, pricing);
     }

     return dataset;
   }

   /**
    * Looks up pricing for a given model name.
    * Returns null and logs a warning if the model is not found.
    */
   export function getModelPrice(model: string, dataset: PricingDataset): ModelPricing | null {
     if (!model) {
       console.warn('[harness pricing] No model specified — cannot look up pricing.');
       return null;
     }

     const pricing = dataset.get(model);
     if (!pricing) {
       console.warn(
         `[harness pricing] No pricing data for model "${model}". Consider updating pricing data.`
       );
       return null;
     }

     return pricing;
   }
   ```

6. Run test: `cd packages/core && npx vitest run tests/pricing/pricing.test.ts`
7. Observe: all tests pass.
8. Run: `harness validate`
9. Commit: `feat(pricing): implement LiteLLM parser and getModelPrice lookup`

---

### Task 4: Implement disk cache with TTL and fallback (TDD)

**Depends on:** Task 2, Task 3
**Files:** `packages/core/src/pricing/cache.ts`, `packages/core/tests/pricing/cache.test.ts`

1. Create test file `packages/core/tests/pricing/cache.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs/promises';
   import * as path from 'node:path';
   import {
     loadPricingData,
     LITELLM_PRICING_URL,
     CACHE_TTL_MS,
     STALENESS_WARNING_DAYS,
   } from '../../src/pricing/cache';
   import type { PricingDataset } from '../../src/pricing/types';

   // Mock fs and fetch
   vi.mock('node:fs/promises');
   const mockFetch = vi.fn();
   vi.stubGlobal('fetch', mockFetch);

   const MOCK_LITELLM_RESPONSE = {
     'claude-sonnet-4-20250514': {
       input_cost_per_token: 3e-6,
       output_cost_per_token: 1.5e-5,
       cache_read_input_token_cost: 3e-7,
       cache_creation_input_token_cost: 3.75e-6,
       mode: 'chat',
     },
   };

   describe('loadPricingData', () => {
     beforeEach(() => {
       vi.resetAllMocks();
       vi.useFakeTimers();
       vi.setSystemTime(new Date('2026-03-31T12:00:00Z'));
     });

     afterEach(() => {
       vi.useRealTimers();
     });

     it('should fetch from network when no cache exists', async () => {
       // No cache file
       vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
       vi.mocked(fs.mkdir).mockResolvedValue(undefined);
       vi.mocked(fs.writeFile).mockResolvedValue(undefined);

       mockFetch.mockResolvedValue({
         ok: true,
         json: () => Promise.resolve(MOCK_LITELLM_RESPONSE),
       });

       const dataset = await loadPricingData('/tmp/test-project');
       expect(mockFetch).toHaveBeenCalledWith(LITELLM_PRICING_URL);
       expect(dataset.has('claude-sonnet-4-20250514')).toBe(true);
     });

     it('should use disk cache when TTL has not expired', async () => {
       const cacheData = {
         fetchedAt: new Date('2026-03-31T11:00:00Z').toISOString(), // 1 hour ago
         data: MOCK_LITELLM_RESPONSE,
       };
       vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cacheData));

       const dataset = await loadPricingData('/tmp/test-project');
       expect(mockFetch).not.toHaveBeenCalled();
       expect(dataset.has('claude-sonnet-4-20250514')).toBe(true);
     });

     it('should re-fetch when cache TTL has expired', async () => {
       const cacheData = {
         fetchedAt: new Date('2026-03-30T00:00:00Z').toISOString(), // >24h ago
         data: MOCK_LITELLM_RESPONSE,
       };
       // First read returns expired cache
       vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cacheData));
       vi.mocked(fs.mkdir).mockResolvedValue(undefined);
       vi.mocked(fs.writeFile).mockResolvedValue(undefined);

       mockFetch.mockResolvedValue({
         ok: true,
         json: () => Promise.resolve(MOCK_LITELLM_RESPONSE),
       });

       const dataset = await loadPricingData('/tmp/test-project');
       expect(mockFetch).toHaveBeenCalled();
       expect(dataset.has('claude-sonnet-4-20250514')).toBe(true);
     });

     it('should use expired disk cache when network fails', async () => {
       const cacheData = {
         fetchedAt: new Date('2026-03-20T00:00:00Z').toISOString(), // old
         data: MOCK_LITELLM_RESPONSE,
       };
       vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cacheData));

       mockFetch.mockRejectedValue(new Error('Network error'));

       const dataset = await loadPricingData('/tmp/test-project');
       expect(dataset.has('claude-sonnet-4-20250514')).toBe(true);
     });

     it('should use fallback.json when network fails and no disk cache', async () => {
       // No cache file on first read, no cache on retry after fetch failure
       vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
       vi.mocked(fs.mkdir).mockResolvedValue(undefined);
       vi.mocked(fs.writeFile).mockResolvedValue(undefined);
       mockFetch.mockRejectedValue(new Error('Network error'));

       const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
       const dataset = await loadPricingData('/tmp/test-project');

       // Should still have models from fallback
       expect(dataset.size).toBeGreaterThan(0);
       warnSpy.mockRestore();
     });

     it('should emit staleness warning when fallback used >7 days', async () => {
       vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
       vi.mocked(fs.mkdir).mockResolvedValue(undefined);
       vi.mocked(fs.writeFile).mockResolvedValue(undefined);
       mockFetch.mockRejectedValue(new Error('Network error'));

       // Simulate staleness marker being >7 days old
       const staleDate = new Date('2026-03-20T00:00:00Z').toISOString();
       vi.mocked(fs.readFile).mockImplementation((filePath: any) => {
         const p = typeof filePath === 'string' ? filePath : filePath.toString();
         if (p.endsWith('staleness-marker.json')) {
           return Promise.resolve(JSON.stringify({ firstFallbackUse: staleDate }));
         }
         return Promise.reject(new Error('ENOENT'));
       });

       const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
       await loadPricingData('/tmp/test-project');

       expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('stale'));
       warnSpy.mockRestore();
     });
   });
   ```

2. Run test: `cd packages/core && npx vitest run tests/pricing/cache.test.ts`
3. Observe failure: module not found.

4. Create `packages/core/src/pricing/cache.ts`:

   ```typescript
   import * as fs from 'node:fs/promises';
   import * as path from 'node:path';
   import type { ModelPricing } from '@harness-engineering/types';
   import type { PricingCacheFile, PricingDataset, FallbackPricingFile } from './types';
   import { parseLiteLLMData } from './pricing';
   import fallbackData from './fallback.json';

   /** Pinned LiteLLM pricing URL. */
   export const LITELLM_PRICING_URL =
     'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

   /** Cache time-to-live: 24 hours in milliseconds. */
   export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

   /** Number of days after which fallback usage triggers a staleness warning. */
   export const STALENESS_WARNING_DAYS = 7;

   function getCachePath(projectRoot: string): string {
     return path.join(projectRoot, '.harness', 'cache', 'pricing.json');
   }

   function getStalenessMarkerPath(projectRoot: string): string {
     return path.join(projectRoot, '.harness', 'cache', 'staleness-marker.json');
   }

   async function readDiskCache(projectRoot: string): Promise<PricingCacheFile | null> {
     try {
       const raw = await fs.readFile(getCachePath(projectRoot), 'utf-8');
       return JSON.parse(raw) as PricingCacheFile;
     } catch {
       return null;
     }
   }

   async function writeDiskCache(projectRoot: string, data: PricingCacheFile): Promise<void> {
     const cachePath = getCachePath(projectRoot);
     await fs.mkdir(path.dirname(cachePath), { recursive: true });
     await fs.writeFile(cachePath, JSON.stringify(data, null, 2));
   }

   async function fetchFromNetwork(): Promise<PricingCacheFile | null> {
     try {
       const response = await fetch(LITELLM_PRICING_URL);
       if (!response.ok) return null;
       const data = await response.json();
       return {
         fetchedAt: new Date().toISOString(),
         data,
       };
     } catch {
       return null;
     }
   }

   function loadFallbackDataset(): PricingDataset {
     const fb = fallbackData as FallbackPricingFile;
     const dataset: PricingDataset = new Map();
     for (const [model, pricing] of Object.entries(fb.models)) {
       dataset.set(model, pricing);
     }
     return dataset;
   }

   async function checkAndWarnStaleness(projectRoot: string): Promise<void> {
     const markerPath = getStalenessMarkerPath(projectRoot);
     try {
       const raw = await fs.readFile(markerPath, 'utf-8');
       const marker = JSON.parse(raw) as { firstFallbackUse: string };
       const firstUse = new Date(marker.firstFallbackUse).getTime();
       const now = Date.now();
       const daysSinceFirstUse = (now - firstUse) / (24 * 60 * 60 * 1000);

       if (daysSinceFirstUse > STALENESS_WARNING_DAYS) {
         console.warn(
           `[harness pricing] Pricing data is stale — using bundled fallback for ${Math.floor(daysSinceFirstUse)} days. ` +
             'Connect to the internet to refresh pricing data.'
         );
       }
     } catch {
       // No marker yet — create one
       try {
         await fs.mkdir(path.dirname(markerPath), { recursive: true });
         await fs.writeFile(
           markerPath,
           JSON.stringify({ firstFallbackUse: new Date().toISOString() })
         );
       } catch {
         // Best-effort marker write
       }
     }
   }

   async function clearStalenessMarker(projectRoot: string): Promise<void> {
     try {
       await fs.unlink(getStalenessMarkerPath(projectRoot));
     } catch {
       // No marker to clear
     }
   }

   /**
    * Loads pricing data with the following priority:
    * 1. Fresh disk cache (<24h old) — no network request
    * 2. Network fetch from LiteLLM — writes to disk cache
    * 3. Expired disk cache (any age) — when network fails
    * 4. Bundled fallback.json — when no cache and no network
    */
   export async function loadPricingData(projectRoot: string): Promise<PricingDataset> {
     // Check disk cache first
     const cache = await readDiskCache(projectRoot);

     if (cache) {
       const cacheAge = Date.now() - new Date(cache.fetchedAt).getTime();
       if (cacheAge < CACHE_TTL_MS) {
         // Fresh cache — use it
         await clearStalenessMarker(projectRoot);
         return parseLiteLLMData(cache.data);
       }
     }

     // Cache expired or missing — try network
     const fetched = await fetchFromNetwork();
     if (fetched) {
       await writeDiskCache(projectRoot, fetched);
       await clearStalenessMarker(projectRoot);
       return parseLiteLLMData(fetched.data);
     }

     // Network failed — try expired cache
     if (cache) {
       return parseLiteLLMData(cache.data);
     }

     // No cache, no network — use fallback
     await checkAndWarnStaleness(projectRoot);
     return loadFallbackDataset();
   }
   ```

5. Run test: `cd packages/core && npx vitest run tests/pricing/cache.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(pricing): implement disk cache with 24h TTL and fallback`

---

### Task 5: Implement calculateCost with tests (TDD)

**Depends on:** Task 1, Task 3
**Files:** `packages/core/src/pricing/calculator.ts`, `packages/core/tests/pricing/calculator.test.ts`

1. Create test file `packages/core/tests/pricing/calculator.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { calculateCost } from '../../src/pricing/calculator';
   import type { UsageRecord, ModelPricing } from '@harness-engineering/types';
   import type { PricingDataset } from '../../src/pricing/types';

   function makeRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
     return {
       sessionId: 'test-session',
       timestamp: '2026-03-31T12:00:00Z',
       tokens: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
       ...overrides,
     };
   }

   const sonnetPricing: ModelPricing = {
     inputPer1M: 3.0,
     outputPer1M: 15.0,
     cacheReadPer1M: 0.3,
     cacheWritePer1M: 3.75,
   };

   describe('calculateCost', () => {
     const dataset: PricingDataset = new Map([['claude-sonnet-4-20250514', sonnetPricing]]);

     it('should calculate cost in microdollars for a known model', () => {
       const record = makeRecord({
         model: 'claude-sonnet-4-20250514',
         tokens: { inputTokens: 1_000_000, outputTokens: 100_000, totalTokens: 1_100_000 },
       });
       const cost = calculateCost(record, dataset);
       // input: 1M * $3/1M = $3 = 3,000,000 microdollars
       // output: 100K * $15/1M = $1.5 = 1,500,000 microdollars
       // total: 4,500,000 microdollars
       expect(cost).toBe(4_500_000);
     });

     it('should include cache token costs when present', () => {
       const record = makeRecord({
         model: 'claude-sonnet-4-20250514',
         tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
         cacheReadTokens: 1_000_000,
         cacheCreationTokens: 1_000_000,
       });
       const cost = calculateCost(record, dataset);
       // cacheRead: 1M * $0.3/1M = $0.3 = 300,000 microdollars
       // cacheWrite: 1M * $3.75/1M = $3.75 = 3,750,000 microdollars
       // total: 4,050,000 microdollars
       expect(cost).toBe(4_050_000);
     });

     it('should return null when model is not specified', () => {
       const record = makeRecord(); // no model field
       const cost = calculateCost(record, dataset);
       expect(cost).toBeNull();
     });

     it('should return null when model is unknown', () => {
       const record = makeRecord({ model: 'unknown-model' });
       const cost = calculateCost(record, dataset);
       expect(cost).toBeNull();
     });

     it('should return integer microdollars (no floating point)', () => {
       const record = makeRecord({
         model: 'claude-sonnet-4-20250514',
         tokens: { inputTokens: 333, outputTokens: 777, totalTokens: 1110 },
       });
       const cost = calculateCost(record, dataset);
       expect(Number.isInteger(cost)).toBe(true);
     });

     it('should handle zero tokens', () => {
       const record = makeRecord({
         model: 'claude-sonnet-4-20250514',
         tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
       });
       const cost = calculateCost(record, dataset);
       expect(cost).toBe(0);
     });

     it('should skip cache costs when model has no cache pricing', () => {
       const noCacheDataset: PricingDataset = new Map([
         ['basic-model', { inputPer1M: 1.0, outputPer1M: 2.0 }],
       ]);
       const record = makeRecord({
         model: 'basic-model',
         tokens: { inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000 },
         cacheReadTokens: 500_000,
       });
       const cost = calculateCost(record, noCacheDataset);
       // Only input cost: 1M * $1/1M = $1 = 1,000,000 microdollars
       // cacheRead ignored because model has no cacheReadPer1M
       expect(cost).toBe(1_000_000);
     });
   });
   ```

2. Run test: `cd packages/core && npx vitest run tests/pricing/calculator.test.ts`
3. Observe failure: module not found.

4. Create `packages/core/src/pricing/calculator.ts`:

   ```typescript
   import type { UsageRecord } from '@harness-engineering/types';
   import type { PricingDataset } from './types';
   import { getModelPrice } from './pricing';

   const MICRODOLLARS_PER_DOLLAR = 1_000_000;
   const TOKENS_PER_MILLION = 1_000_000;

   /**
    * Calculates the cost of a usage record in integer microdollars.
    * Returns null if the model is unknown or not specified.
    */
   export function calculateCost(record: UsageRecord, dataset: PricingDataset): number | null {
     if (!record.model) return null;

     const pricing = getModelPrice(record.model, dataset);
     if (!pricing) return null;

     let costUSD = 0;

     // Input token cost
     costUSD += (record.tokens.inputTokens / TOKENS_PER_MILLION) * pricing.inputPer1M;

     // Output token cost
     costUSD += (record.tokens.outputTokens / TOKENS_PER_MILLION) * pricing.outputPer1M;

     // Cache read cost
     if (record.cacheReadTokens && pricing.cacheReadPer1M) {
       costUSD += (record.cacheReadTokens / TOKENS_PER_MILLION) * pricing.cacheReadPer1M;
     }

     // Cache creation/write cost
     if (record.cacheCreationTokens && pricing.cacheWritePer1M) {
       costUSD += (record.cacheCreationTokens / TOKENS_PER_MILLION) * pricing.cacheWritePer1M;
     }

     // Convert to integer microdollars
     return Math.round(costUSD * MICRODOLLARS_PER_DOLLAR);
   }
   ```

5. Run test: `cd packages/core && npx vitest run tests/pricing/calculator.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(pricing): implement cost calculator with microdollar precision`

---

### Task 6: Wire up pricing module exports

**Depends on:** Task 3, Task 4, Task 5
**Files:** `packages/core/src/pricing/index.ts`, `packages/core/src/index.ts`

1. Create `packages/core/src/pricing/index.ts`:

   ```typescript
   export { getModelPrice, parseLiteLLMData } from './pricing';
   export {
     loadPricingData,
     LITELLM_PRICING_URL,
     CACHE_TTL_MS,
     STALENESS_WARNING_DAYS,
   } from './cache';
   export { calculateCost } from './calculator';
   export type {
     PricingDataset,
     PricingCacheFile,
     LiteLLMModelEntry,
     LiteLLMPricingData,
     FallbackPricingFile,
   } from './types';
   ```

2. Add to `packages/core/src/index.ts` — append before the closing content:

   ```typescript
   /**
    * Pricing module for model cost lookup and calculation.
    */
   export * from './pricing';
   ```

3. Run: `cd packages/core && npx tsc --noEmit`
4. Run: `cd packages/types && npx tsc --noEmit`
5. Run: `cd packages/core && npx vitest run tests/pricing/`
6. Run: `harness validate`
7. Commit: `feat(pricing): wire pricing module exports through core index`

---

### Task 7: Full build and cross-package verification

**Depends on:** Task 6
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run: `cd packages/types && npm run build`
2. Run: `cd packages/core && npm run build`
3. Run: `cd packages/core && npx vitest run tests/pricing/`
4. Verify all 3 test files pass:
   - `tests/pricing/pricing.test.ts` — 6 tests
   - `tests/pricing/cache.test.ts` — 6 tests
   - `tests/pricing/calculator.test.ts` — 7 tests
5. Run: `harness validate`
6. Commit: no commit (verification only)

---

## Traceability Matrix

| Observable Truth                        | Delivered by |
| --------------------------------------- | ------------ |
| 1. Types exist                          | Task 1       |
| 2. getModelPrice returns pricing        | Task 3       |
| 3. Unknown model returns null + warning | Task 3       |
| 4. Network fetch + disk write           | Task 4       |
| 5. Fresh cache skips network            | Task 4       |
| 6. Network fail uses expired cache      | Task 4       |
| 7. No cache + no network uses fallback  | Task 4       |
| 8. Staleness warning after 7 days       | Task 4       |
| 9. calculateCost returns microdollars   | Task 5       |
| 10. Unknown model cost returns null     | Task 5       |
| 11. All tests pass                      | Task 7       |
| 12. harness validate passes             | Task 7       |
