# Timeout Pattern

> Prevent resource exhaustion and hung requests with timeouts, AbortController, and deadline propagation

## When to Use

- HTTP requests that could hang indefinitely due to network issues
- Database queries that could run longer than acceptable
- Any async operation that should not block forever
- Enforcing SLA response times across service boundaries

## Instructions

1. Set timeouts on every external call. Never rely on the default (which is often infinity).
2. Use `AbortController` with `AbortSignal.timeout()` for fetch requests.
3. Set connection timeouts AND request timeouts separately — connection timeout is for establishing the connection; request timeout is for receiving the response.
4. Propagate deadlines across service boundaries — if service A has 5s remaining, service B should get less than 5s.
5. Clean up resources (connections, streams, file handles) when a timeout fires.
6. Return a meaningful error on timeout so callers can retry or fall back.

```typescript
// utils/timeout.ts
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await fn(controller.signal);
    return result;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new TimeoutError(errorMessage, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}
```

```typescript
// Usage with fetch
import { withTimeout } from './utils/timeout';

const user = await withTimeout(
  (signal) => fetch('/api/users/123', { signal }).then((r) => r.json()),
  5000,
  'User fetch timed out'
);

// Node.js built-in (Node 18+)
const response = await fetch('/api/data', {
  signal: AbortSignal.timeout(5000),
});
```

```typescript
// Deadline propagation across services
async function handleRequest(req: Request) {
  const deadline = Date.now() + 10000; // 10s total budget

  const user = await withTimeout(
    (signal) => userService.getUser(req.userId, signal),
    3000 // 3s budget for user service
  );

  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new TimeoutError('Request deadline exceeded', 10000);

  const orders = await withTimeout(
    (signal) => orderService.getOrders(user.id, signal),
    Math.min(remaining, 5000) // Remaining budget, capped at 5s
  );

  return { user, orders };
}
```

## Details

**AbortController in Node.js:** Supported natively since Node 16. `AbortSignal.timeout(ms)` is available since Node 18 — it creates a signal that automatically aborts after the specified time.

**Timeout layering:** Set timeouts at multiple levels:

- **HTTP client level:** `fetch` signal, Axios timeout config
- **Service call level:** `withTimeout` wrapper
- **Route handler level:** Express/Fastify request timeout
- **Load balancer level:** Nginx/ALB timeout

**Common timeout values:**

- Internal microservice calls: 1-5 seconds
- External API calls: 5-15 seconds
- Database queries: 5-30 seconds
- File uploads/downloads: 60-300 seconds
- Background jobs: application-specific

**Database timeouts:**

```typescript
// PostgreSQL via node-postgres
const pool = new Pool({
  connectionTimeoutMillis: 5000, // Wait for connection
  query_timeout: 10000, // Query execution limit
  statement_timeout: 10000, // Server-side timeout
});
```

**Anti-patterns:**

- No timeout at all (requests hang forever during outages)
- Timeout too short (causes false failures under normal load)
- Not cleaning up after timeout (leaks connections)
- Not propagating the abort signal to child operations

## Source

https://nodejs.org/api/globals.html#class-abortcontroller

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
