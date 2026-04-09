# Bulkhead Pattern

> Isolate failures by partitioning resources so one failing component cannot exhaust capacity for others

## When to Use

- A slow dependency is consuming all available connections, starving other services
- Need to guarantee capacity for critical operations even when non-critical ones are overloaded
- Limiting concurrent requests to a specific external service
- Preventing a single API consumer from monopolizing shared resources

## Instructions

1. Partition resources by concern. Each partition (bulkhead) has its own concurrency limit.
2. Implement as a semaphore that limits concurrent executions. When the limit is reached, new requests are queued or rejected.
3. Set separate bulkheads for each external dependency — the payment API and the notification API should not share a concurrency pool.
4. Configure a queue size for burst handling. Reject requests that exceed the queue to prevent unbounded memory growth.
5. Combine with timeouts — a bulkhead without timeouts can still deadlock if slots are never released.
6. Monitor bulkhead utilization and rejection rate to tune limits.

```typescript
// utils/bulkhead.ts
export class Bulkhead {
  private active = 0;
  private queue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueue: number = 100
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return Promise.resolve();
    }

    if (this.queue.length >= this.maxQueue) {
      return Promise.reject(
        new BulkheadRejectError(`Bulkhead full: ${this.active} active, ${this.queue.length} queued`)
      );
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next.resolve();
    } else {
      this.active--;
    }
  }

  get stats() {
    return { active: this.active, queued: this.queue.length };
  }
}

export class BulkheadRejectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BulkheadRejectError';
  }
}
```

```typescript
// services/payment-service.ts
const paymentBulkhead = new Bulkhead(10, 50); // Max 10 concurrent, 50 queued
const notificationBulkhead = new Bulkhead(20, 100);

export async function processPayment(orderId: string): Promise<PaymentResult> {
  return paymentBulkhead.execute(() =>
    fetch(`https://payment-api.example.com/charge/${orderId}`, { method: 'POST' }).then((r) =>
      r.json()
    )
  );
}

export async function sendNotification(userId: string, message: string): Promise<void> {
  return notificationBulkhead.execute(() =>
    fetch('https://notification-api.example.com/send', {
      method: 'POST',
      body: JSON.stringify({ userId, message }),
    }).then(() => undefined)
  );
}
```

## Details

**Types of bulkheads:**

- **Semaphore-based:** Limits concurrent executions (shown above). Best for async I/O in Node.js.
- **Thread pool-based:** Separate thread pools per dependency. Common in Java (Hystrix). Less relevant in Node.js due to its single-threaded model, but applicable with worker threads.
- **Connection pool-based:** Separate connection pools per database or service.

**Sizing bulkheads:** Start with `expected_concurrent_requests * 1.5`. Monitor rejection rates. If rejections are too high, increase the limit. If the downstream service is overwhelmed, decrease it.

**Combining patterns:** Bulkhead + circuit breaker + timeout is the resilience trifecta:

- **Timeout:** Prevents individual requests from hanging
- **Bulkhead:** Limits total resource consumption
- **Circuit breaker:** Stops all requests when failure rate is too high

```typescript
async function resilientCall<T>(fn: () => Promise<T>): Promise<T> {
  return circuitBreaker.execute(() => bulkhead.execute(() => withTimeout(fn, 5000)));
}
```

**Libraries:** `cockatiel` provides composable bulkhead policy. `p-limit` is a simpler concurrency limiter. `bottleneck` adds rate limiting and clustering support.

## Source

https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead

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
