# Retry Pattern

> Handle transient failures with configurable retry strategies, exponential backoff, and jitter

## When to Use

- Network requests failing due to transient errors (timeouts, 503s, connection resets)
- Database connections dropping briefly during failovers
- Rate-limited APIs that succeed on subsequent attempts
- Any operation that can fail temporarily but succeeds on retry

## Instructions

1. Retry only transient failures. Non-transient errors (400 Bad Request, 404 Not Found, validation errors) should not be retried.
2. Use exponential backoff: `delay = baseDelay * 2^attempt`. This prevents thundering herd.
3. Add jitter (randomness) to backoff: `delay = baseDelay * 2^attempt * (0.5 + random())`. This spreads retry storms.
4. Set a maximum retry count (typically 3-5) and a maximum total delay (e.g., 30 seconds).
5. Make the operation idempotent before adding retries. Retrying a non-idempotent operation (like creating a resource) can cause duplicates.
6. Log each retry attempt with the error reason for debugging.
7. Combine with circuit breaker — retries handle transient blips; circuit breaker handles sustained failures.

```typescript
// utils/retry.ts
interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  shouldRetry: () => true,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === opts.maxAttempts - 1) break;
      if (!opts.shouldRetry!(error, attempt)) break;

      // Exponential backoff with full jitter
      const exponentialDelay = opts.baseDelay * Math.pow(2, attempt);
      const jitter = Math.random();
      const delay = Math.min(exponentialDelay * jitter, opts.maxDelay);

      opts.onRetry?.(error, attempt + 1, delay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
```

```typescript
// Usage
import { withRetry } from './utils/retry';

const user = await withRetry(
  () =>
    fetch('/api/users/123').then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
  {
    maxAttempts: 3,
    baseDelay: 1000,
    shouldRetry: (error) => {
      if (error instanceof Error && error.message.includes('HTTP 4')) return false;
      return true; // Retry 5xx and network errors
    },
    onRetry: (error, attempt, delay) => {
      console.warn(`Retry ${attempt} after ${delay}ms: ${error}`);
    },
  }
);
```

## Details

**Backoff strategies:**

- **Fixed delay:** Same delay every time. Simple but causes retry storms.
- **Linear backoff:** `delay = baseDelay * attempt`. Gentle ramp-up.
- **Exponential backoff:** `delay = baseDelay * 2^attempt`. Standard for APIs.
- **Exponential with jitter:** Adds randomness to exponential. Best practice — prevents correlated retries.

**Jitter types:**

- **Full jitter:** `random(0, baseDelay * 2^attempt)` — most spread, lowest contention
- **Equal jitter:** `baseDelay * 2^attempt / 2 + random(0, baseDelay * 2^attempt / 2)` — guaranteed minimum wait
- **Decorrelated jitter:** `min(maxDelay, random(baseDelay, prevDelay * 3))` — Amazon recommendation

**Retry-After header:** Some APIs return `Retry-After` with 429 or 503 responses. Always respect this header over your calculated backoff.

**What NOT to retry:**

- 400 Bad Request (client error — retrying will not fix it)
- 401/403 Unauthorized/Forbidden (auth issue — retry with same credentials will fail)
- 409 Conflict (state issue — needs resolution, not retry)
- 422 Unprocessable Entity (validation — fix the payload)

**Libraries:** `p-retry`, `async-retry`, `cockatiel` (composable policies), `axios-retry`.

## Source

https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
