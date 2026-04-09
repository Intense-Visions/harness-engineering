# Idempotency Pattern

> Ensure safe retries by making operations produce the same result regardless of how many times they execute

## When to Use

- API endpoints that create resources (POST) need to be safely retryable
- Payment processing where duplicate charges are unacceptable
- Message consumers that may receive the same message twice (at-least-once delivery)
- Any operation where network failures could cause the client to retry without knowing if the first request succeeded

## Instructions

1. Accept an `Idempotency-Key` header on non-idempotent endpoints (POST, PATCH). The client generates a unique key per logical operation.
2. Before processing, check if the key has been seen. If yes, return the stored response.
3. Process the request and store the response keyed by the idempotency key.
4. Set a TTL on stored responses (24-48 hours). After expiry, the key can be reused.
5. Handle concurrent requests with the same key — use a lock to prevent double processing.
6. For message queues, use a message deduplication store keyed by message ID.

```typescript
// middleware/idempotency.ts
interface StoredResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  createdAt: number;
}

export class IdempotencyStore {
  constructor(
    private redis: Redis,
    private ttlSeconds: number = 86400 // 24 hours
  ) {}

  async check(key: string): Promise<StoredResponse | null> {
    const data = await this.redis.get(`idem:${key}`);
    return data ? JSON.parse(data) : null;
  }

  async lock(key: string): Promise<boolean> {
    // Set NX — only succeeds if key does not exist
    const result = await this.redis.set(`idem:lock:${key}`, '1', 'EX', 60, 'NX');
    return result === 'OK';
  }

  async store(key: string, response: StoredResponse): Promise<void> {
    await this.redis.setex(`idem:${key}`, this.ttlSeconds, JSON.stringify(response));
    await this.redis.del(`idem:lock:${key}`);
  }

  async unlock(key: string): Promise<void> {
    await this.redis.del(`idem:lock:${key}`);
  }
}

// Express middleware
export function idempotencyMiddleware(store: IdempotencyStore) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.headers['idempotency-key'] as string;
    if (!key) return next(); // No key = no idempotency protection

    // Check for cached response
    const cached = await store.check(key);
    if (cached) {
      Object.entries(cached.headers).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(cached.statusCode).json(cached.body);
    }

    // Acquire lock to prevent concurrent processing
    const locked = await store.lock(key);
    if (!locked) {
      return res.status(409).json({ error: 'Request is being processed' });
    }

    // Intercept the response to store it
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      store.store(key, {
        statusCode: res.statusCode,
        body,
        headers: { 'content-type': 'application/json' },
        createdAt: Date.now(),
      });
      return originalJson(body);
    };

    next();
  };
}
```

```typescript
// Client-side usage
const idempotencyKey = crypto.randomUUID();

const response = await fetch('/api/payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey,
  },
  body: JSON.stringify({ amount: 1000, currency: 'usd' }),
});

// Safe to retry with the same key — will get the same response
```

## Details

**Naturally idempotent operations:** GET, PUT, DELETE are idempotent by HTTP semantics. `PUT /users/123 { name: "Alice" }` always produces the same result. POST is not naturally idempotent — creating a resource twice creates two resources.

**Database-level idempotency:** Use unique constraints and upserts:

```sql
-- Instead of INSERT (which fails on duplicate)
INSERT INTO orders (idempotency_key, user_id, amount)
VALUES ($1, $2, $3)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING *;
```

**Message deduplication:**

```typescript
async function processMessage(message: QueueMessage): Promise<void> {
  const messageId = message.id;
  const processed = await redis.set(`msg:${messageId}`, '1', 'EX', 3600, 'NX');
  if (!processed) {
    console.log(`Duplicate message ${messageId}, skipping`);
    return;
  }
  await handleMessage(message.body);
}
```

**Key generation strategies:**

- Client-generated UUID (most common for APIs)
- Hash of request body (deterministic but risks collision if body legitimately repeats)
- Composite key (userId + operation + timestamp rounded to minute)

**Edge cases:**

- Request succeeds but response is lost (client retries, gets cached success response — correct)
- Request fails (do not cache the error — let the client retry with the same key)
- Concurrent requests with the same key (lock prevents double processing)

## Source

https://stripe.com/docs/api/idempotent_requests

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
