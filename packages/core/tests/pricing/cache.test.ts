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
