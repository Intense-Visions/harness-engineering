# Microservices: Circuit Breaker

> Prevent cascading failures with circuit breaker, half-open state, and fallback logic.

## When to Use

- A service calls a downstream dependency that can become slow or unavailable
- Slow downstream responses are causing upstream timeouts and resource exhaustion
- You want to fail fast when a dependency is known to be down
- You need graceful degradation (return stale data, default response) when a service fails

## Instructions

**Circuit breaker states:**

```
CLOSED → normal operation, requests pass through
  ↓ (error rate exceeds threshold)
OPEN → requests fail immediately (fail fast)
  ↓ (after reset timeout)
HALF-OPEN → let one request through as a probe
  ↓ (probe succeeds)   ↓ (probe fails)
CLOSED                  OPEN
```

**opossum (Node.js circuit breaker library):**

```typescript
import CircuitBreaker from 'opossum';

// Wrap the fragile operation
async function fetchUserFromService(userId: string): Promise<User> {
  const response = await fetch(`${process.env.USER_SERVICE_URL}/users/${userId}`, {
    signal: AbortSignal.timeout(3_000), // timeout
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

const breaker = new CircuitBreaker(fetchUserFromService, {
  timeout: 3_000, // call timeout
  errorThresholdPercentage: 50, // open after 50% errors in rolling window
  resetTimeout: 30_000, // try half-open after 30s
  rollingCountTimeout: 10_000, // rolling window for error rate
  rollingCountBuckets: 10, // 10 × 1s buckets
  volumeThreshold: 5, // min requests before circuit can open
});

// Fallback — what to return when circuit is open
breaker.fallback((userId: string) => ({
  id: userId,
  name: 'Unknown User',
  cached: true,
}));

// Events for monitoring
breaker.on('open', () => {
  console.error('Circuit OPENED — user service is unavailable');
  metrics.increment('circuit_breaker.user_service.open');
});
breaker.on('halfOpen', () => {
  console.log('Circuit HALF-OPEN — probing user service');
});
breaker.on('close', () => {
  console.log('Circuit CLOSED — user service recovered');
  metrics.increment('circuit_breaker.user_service.closed');
});
breaker.on('fallback', (result) => {
  console.warn('Fallback triggered:', result);
  metrics.increment('circuit_breaker.user_service.fallback');
});

// Usage — same interface as the raw function
const user = await breaker.fire(userId);
```

**Manual circuit breaker (without library):**

```typescript
enum CircuitState {
  CLOSED,
  OPEN,
  HALF_OPEN,
}

class CircuitBreaker<T, Args extends unknown[]> {
  private state = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly operation: (...args: Args) => Promise<T>,
    private readonly options: {
      failureThreshold: number;
      resetTimeoutMs: number;
      fallback?: (...args: Args) => T;
    }
  ) {}

  async execute(...args: Args): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
      } else {
        if (this.options.fallback) return this.options.fallback(...args);
        throw new Error('Circuit is OPEN');
      }
    }

    try {
      const result = await this.operation(...args);
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      if (this.options.fallback) return this.options.fallback(...args);
      throw err;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      console.error(`Circuit opened after ${this.failureCount} failures`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}
```

**Combining with retry:**

```typescript
// Retry: handle transient failures (network glitch)
// Circuit breaker: handle systemic failures (service is down)
// Order matters: retry first, then circuit breaker trips if failures persist

const withRetry = async <T>(fn: () => Promise<T>, attempts = 3): Promise<T> => {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 200 * i)); // 200ms, 400ms
    }
  }
  throw new Error('Unreachable');
};

// Circuit breaker wraps the retry-enabled call
const robustFetchUser = new CircuitBreaker(
  (userId: string) => withRetry(() => fetchUserFromService(userId), 2),
  { failureThreshold: 5, resetTimeoutMs: 30_000 }
);
```

## Details

**Fallback strategies:**

- Return cached data (stale but functional)
- Return a default/empty response
- Return an error to the caller (fail fast, don't degrade user experience silently)
- Route to a backup service

**Threshold tuning:**

- `errorThresholdPercentage`: 50% is a good default. Lower for critical dependencies, higher for noisy but non-critical ones.
- `resetTimeout`: 30s is a good starting point. If recovery takes longer (e.g., DB restart), increase it.
- `volumeThreshold`: Prevents opening on first few calls during startup.

**Anti-patterns:**

- Circuit breaker without a fallback — you get fast failures but still return errors; the user experience is the same
- Too-aggressive thresholds — opening on 3 failures causes flapping
- Not monitoring circuit state — you won't know when a service is struggling until users complain

**Bulkhead + circuit breaker:** Use both. Bulkhead limits concurrency (prevents a slow service from consuming all threads). Circuit breaker detects failure and stops sending requests. They complement each other.

## Source

microservices.io/patterns/reliability/circuit-breaker.html
