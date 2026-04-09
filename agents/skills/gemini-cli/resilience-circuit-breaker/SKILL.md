# Circuit Breaker Pattern

> Protect services from cascading failures by stopping requests to unhealthy dependencies until they recover

## When to Use

- Calling external APIs or downstream services that can fail or become slow
- Preventing a failing dependency from consuming all connection pool/thread resources
- Needing fast failure instead of waiting for timeouts when a service is down
- Building microservice architectures where one service failure should not cascade

## Instructions

1. Wrap remote calls in a circuit breaker. The breaker tracks success/failure counts.
2. **Closed** (normal): Requests pass through. Failures increment the error counter.
3. **Open** (tripped): After the failure threshold is exceeded, all requests fail immediately without calling the dependency. This lasts for the reset timeout.
4. **Half-Open** (probing): After the reset timeout, one request is allowed through. If it succeeds, the circuit closes. If it fails, it opens again.
5. Configure: failure threshold (e.g., 50% of requests), monitoring window, reset timeout, and minimum request volume.
6. Always provide a fallback for when the circuit is open (cached data, default response, graceful degradation).
7. Emit events (open, close, half-open) for monitoring and alerting.

```typescript
// services/circuit-breaker.ts — using opossum
import CircuitBreaker from 'opossum';

interface BreakerOptions {
  timeout: number; // Max time for a single request (ms)
  errorThresholdPercentage: number; // % of failures to trip
  resetTimeout: number; // Time before trying again (ms)
  volumeThreshold: number; // Minimum requests before evaluating threshold
}

const DEFAULT_OPTIONS: BreakerOptions = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 10,
};

export function createBreaker<T>(
  fn: (...args: any[]) => Promise<T>,
  options: Partial<BreakerOptions> = {}
): CircuitBreaker {
  const breaker = new CircuitBreaker(fn, { ...DEFAULT_OPTIONS, ...options });

  breaker.on('open', () => console.warn(`Circuit opened for ${fn.name}`));
  breaker.on('halfOpen', () => console.info(`Circuit half-open for ${fn.name}`));
  breaker.on('close', () => console.info(`Circuit closed for ${fn.name}`));

  return breaker;
}
```

```typescript
// services/user-service.ts
import { createBreaker } from './circuit-breaker';

async function fetchUserFromAPI(userId: string): Promise<User> {
  const res = await fetch(`https://api.example.com/users/${userId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const userBreaker = createBreaker(fetchUserFromAPI, {
  timeout: 3000,
  errorThresholdPercentage: 60,
  resetTimeout: 15000,
});

// Fallback when circuit is open
userBreaker.fallback((userId: string) => ({
  id: userId,
  name: 'Unknown User',
  cached: true,
}));

export async function getUser(userId: string): Promise<User> {
  return userBreaker.fire(userId);
}
```

## Details

**Manual implementation** (no library):

```typescript
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures = 0;
  private lastFailure = 0;

  constructor(
    private threshold: number = 5,
    private resetTimeout: number = 30000
  ) {}

  async execute<T>(fn: () => Promise<T>, fallback?: () => T): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        if (fallback) return fallback();
        throw new Error('Circuit is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      if (fallback) return fallback();
      throw err;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) this.state = 'open';
  }
}
```

**Libraries:** `opossum` (most popular Node.js circuit breaker), `cockatiel` (modern, composable resilience policies), `mollitia` (middleware-based).

**Tuning parameters:**

- Low threshold + short reset = aggressive protection, frequent false trips
- High threshold + long reset = tolerant of transient errors, slower recovery detection
- Start with 50% error threshold, 30s reset, 10 request minimum volume

**Monitoring:** Track circuit state changes, trip frequency, and open duration. A circuit that stays open indicates a persistent dependency failure. A circuit that oscillates indicates an unstable dependency.

## Source

https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
