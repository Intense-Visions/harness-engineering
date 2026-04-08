# Fallback Pattern

> Provide degraded but functional responses when primary operations fail, ensuring users always get a result

## When to Use

- External service is down and you need to return something useful
- Stale cached data is better than an error message
- Different quality tiers exist (real-time data, cached data, static defaults)
- Feature flags need to gracefully disable features without errors

## Instructions

1. Define a fallback chain: primary source, then secondary, then static default. Each level degrades gracefully.
2. Fallbacks should be fast and local — no external calls in the last-resort fallback.
3. Mark fallback responses so consumers know the data may be stale or incomplete.
4. Log when fallbacks are triggered — they indicate upstream problems.
5. Test fallbacks explicitly — they are rarely exercised in normal operation and rot silently.
6. Combine with circuit breaker: when the circuit opens, the fallback activates immediately.

```typescript
// services/product-service.ts
interface Product {
  id: string;
  name: string;
  price: number;
  _fallback?: boolean;
  _fallbackReason?: string;
}

interface FallbackResult<T> {
  data: T;
  source: 'primary' | 'cache' | 'default';
}

export async function getProduct(id: string): Promise<FallbackResult<Product>> {
  // Level 1: Primary source — live API
  try {
    const res = await fetch(`https://api.example.com/products/${id}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const product = await res.json();
    // Refresh cache on success
    await cache.set(`product:${id}`, product, { ttl: 3600 });
    return { data: product, source: 'primary' };
  } catch (primaryError) {
    console.warn(`Primary failed for product ${id}:`, primaryError);
  }

  // Level 2: Cache — stale but real data
  try {
    const cached = await cache.get<Product>(`product:${id}`);
    if (cached) {
      return { data: { ...cached, _fallback: true, _fallbackReason: 'cache' }, source: 'cache' };
    }
  } catch (cacheError) {
    console.warn(`Cache failed for product ${id}:`, cacheError);
  }

  // Level 3: Static default — always available
  return {
    data: {
      id,
      name: 'Product Unavailable',
      price: 0,
      _fallback: true,
      _fallbackReason: 'default',
    },
    source: 'default',
  };
}
```

```typescript
// Generic fallback utility
export async function withFallback<T>(
  primary: () => Promise<T>,
  ...fallbacks: Array<() => Promise<T> | T>
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    for (const fallback of fallbacks) {
      try {
        return await fallback();
      } catch {
        continue;
      }
    }
    throw error; // All fallbacks failed, rethrow original
  }
}

// Usage
const recommendations = await withFallback(
  () => recommendationService.getPersonalized(userId),
  () => recommendationService.getPopular(),
  () => STATIC_RECOMMENDATIONS
);
```

## Details

**Fallback strategies:**

- **Cache fallback:** Return the last known good value from a cache. Best for data that changes slowly.
- **Static default:** Return hardcoded safe values. Best for configuration and feature flags.
- **Simplified computation:** Return an approximation instead of the exact result. Best for complex calculations.
- **Alternative service:** Call a backup provider. Best for critical external dependencies.
- **Queue for later:** Accept the request and process it asynchronously when the dependency recovers.

**Marking fallback responses:** Always indicate when a response is degraded. The UI can show a banner, the API can set headers, or the response object can include metadata:

```typescript
// HTTP header approach
res.setHeader('X-Fallback', 'cache');
res.setHeader('X-Cache-Age', '3600');

// Response envelope approach
{ data: product, meta: { source: 'cache', staleSeconds: 3600 } }
```

**Testing fallbacks:** Inject failures in tests. Use dependency injection to swap services with failing implementations:

```typescript
it('returns cached data when API is down', async () => {
  mockFetch.mockRejectedValue(new Error('Network error'));
  await cache.set('product:1', mockProduct);

  const result = await getProduct('1');
  expect(result.source).toBe('cache');
  expect(result.data._fallback).toBe(true);
});
```

## Source

https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker#fallback
