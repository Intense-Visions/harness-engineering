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
