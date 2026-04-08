# Microservices: Bulkhead Pattern

> Isolate failures with bulkheads using thread pools and semaphores to protect shared resources.

## When to Use

- A slow downstream dependency could exhaust your connection pool or thread pool, starving all other operations
- You want to guarantee that a slow feature (report generation, external API call) can't block fast features (user login, health checks)
- You have multiple downstream dependencies and want to limit how much of your capacity each one can consume
- Combined with circuit breaker for comprehensive fault tolerance

## Instructions

**Semaphore-based bulkhead (limit concurrent calls to a dependency):**

```typescript
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    // Wait for a permit
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next(); // give permit to next waiter
    } else {
      this.permits++;
    }
  }
}

// Bulkhead: limit concurrent calls to slow external service
class ExternalReportingBulkhead {
  private semaphore: Semaphore;
  private pendingCount = 0;
  private readonly maxConcurrent: number;
  private readonly maxQueued: number;

  constructor(maxConcurrent = 5, maxQueued = 20) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueued = maxQueued;
    this.semaphore = new Semaphore(maxConcurrent);
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Reject if queue is full (fast fail instead of unlimited growth)
    if (this.pendingCount >= this.maxQueued) {
      throw new BulkheadFullError(`Reporting service bulkhead full: ${this.pendingCount} pending`);
    }

    this.pendingCount++;
    await this.semaphore.acquire();
    this.pendingCount--;

    try {
      return await operation();
    } finally {
      this.semaphore.release();
    }
  }

  stats(): { maxConcurrent: number; pending: number } {
    return { maxConcurrent: this.maxConcurrent, pending: this.pendingCount };
  }
}

// Separate bulkheads per downstream — failures are isolated
const reportingBulkhead = new ExternalReportingBulkhead(5, 20); // slow, 5 concurrent max
const paymentBulkhead = new ExternalReportingBulkhead(20, 100); // critical, more capacity
const catalogBulkhead = new ExternalReportingBulkhead(50, 200); // fast, high throughput

// Usage
async function generateReport(params: ReportParams): Promise<Report> {
  try {
    return await reportingBulkhead.execute(() => reportingService.generate(params));
  } catch (err) {
    if (err instanceof BulkheadFullError) {
      // Return a queued/scheduled response — don't cascade
      throw new ServiceUnavailableError('Report generation is busy. Try again shortly.');
    }
    throw err;
  }
}
```

**Connection pool bulkhead (database isolation):**

```typescript
// Don't share a single connection pool for everything
// Give each workload type its own pool

import { Pool } from 'pg';

// Fast OLTP queries — small pool, strict timeout
const oltpPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // max 20 connections
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 3_000,
  statement_timeout: 5_000, // 5s query timeout
});

// Slow analytics / reporting queries — separate pool
const analyticsPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5, // fewer connections — analytics is less time-sensitive
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 120_000, // 2 minute query timeout
});

// Heavy background jobs — their own pool
const backgroundPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  statement_timeout: 600_000, // 10 minutes for batch operations
});

// If analytics pool is exhausted, OLTP is unaffected
```

**Bulkhead with timeout:**

```typescript
class TimedBulkhead {
  private semaphore: Semaphore;

  constructor(private readonly maxConcurrent: number) {
    this.semaphore = new Semaphore(maxConcurrent);
  }

  async execute<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    const acquireWithTimeout = async (): Promise<void> => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new BulkheadTimeoutError('Queue timeout')), timeoutMs)
      );
      await Promise.race([this.semaphore.acquire(), timeout]);
    };

    await acquireWithTimeout();
    try {
      return await operation();
    } finally {
      this.semaphore.release();
    }
  }
}
```

## Details

**Bulkhead vs. Rate Limiter:** Rate limiter caps requests over time (100 req/s). Bulkhead caps concurrent active requests (10 at once). Both protect resources but from different angles. Use both for comprehensive protection.

**Bulkhead vs. Circuit Breaker:** Circuit breaker opens when failures exceed a threshold — stops sending requests. Bulkhead limits concurrent requests — prevents resource exhaustion. They complement each other: bulkhead prevents overload, circuit breaker detects failure.

**Sizing bulkheads:**

```
maxConcurrent = expected_throughput × average_response_time (Little's Law)
Example: 20 req/s × 200ms = 4 concurrent → set maxConcurrent = 8 (2× buffer)

maxQueued = how many requests can wait without hurting user experience
Example: if users tolerate 2s wait and you add 1 new request/50ms → maxQueued = 40
```

**Anti-patterns:**

- One global semaphore for all downstream calls — defeats the isolation purpose
- Unlimited queue (`maxQueued = Infinity`) — memory grows unboundedly under sustained load
- No monitoring on bulkhead utilization — you won't know when a bulkhead is consistently full

**Metrics to track:**

```typescript
bulkheadBulkhead.on('rejected', () =>
  metrics.increment('bulkhead.rejected', { service: 'reporting' })
);
setInterval(() => {
  metrics.gauge('bulkhead.pending', bulkhead.stats().pending, { service: 'reporting' });
}, 5_000);
```

## Source

microservices.io/patterns/reliability/bulkhead.html
