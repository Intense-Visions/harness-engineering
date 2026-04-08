# Events: Idempotency

> Handle duplicate message delivery safely using idempotency keys and deduplication stores.

## When to Use

- Your message consumer may receive the same message more than once (at-least-once delivery)
- You're processing payments, creating records, or sending notifications that must happen exactly once
- You have retry logic that could replay a request or event
- Clients or queues can retry failed operations and you must deduplicate

## Instructions

**Idempotency key pattern for API endpoints:**

```typescript
import { Redis } from 'ioredis';

const redis = new Redis({ host: 'localhost', port: 6379 });

interface IdempotentResult<T> {
  data: T;
  fromCache: boolean;
}

async function withIdempotency<T>(
  idempotencyKey: string,
  ttlSeconds: number,
  operation: () => Promise<T>
): Promise<IdempotentResult<T>> {
  const cacheKey = `idempotency:${idempotencyKey}`;

  // Check if result already exists
  const cached = await redis.get(cacheKey);
  if (cached) {
    return { data: JSON.parse(cached) as T, fromCache: true };
  }

  // Lock to prevent concurrent duplicate processing
  const lockKey = `lock:${idempotencyKey}`;
  const locked = await redis.set(lockKey, '1', 'EX', 30, 'NX');
  if (!locked) {
    // Another instance is processing — wait and retry
    await new Promise((r) => setTimeout(r, 500));
    return withIdempotency(idempotencyKey, ttlSeconds, operation);
  }

  try {
    const result = await operation();
    await redis.set(cacheKey, JSON.stringify(result), 'EX', ttlSeconds);
    return { data: result, fromCache: false };
  } finally {
    await redis.del(lockKey);
  }
}

// HTTP handler with idempotency key header
async function createPaymentHandler(req: Request, res: Response): Promise<void> {
  const idempotencyKey = req.headers['idempotency-key'] as string;
  if (!idempotencyKey) {
    res.status(400).json({ error: 'Idempotency-Key header required' });
    return;
  }

  const { data, fromCache } = await withIdempotency(
    idempotencyKey,
    86_400, // 24 hours
    () => processPayment(req.body)
  );

  res
    .status(fromCache ? 200 : 201)
    .set('Idempotency-Replayed', fromCache ? 'true' : 'false')
    .json(data);
}
```

**Database-level deduplication (for message consumers):**

```typescript
// Store processed event IDs in a dedupe table
async function processEventIdempotent(
  eventId: string,
  process: () => Promise<void>
): Promise<void> {
  // Attempt to insert the event ID — unique constraint prevents duplicates
  const inserted = await db.query<{ inserted: boolean }>(
    `INSERT INTO processed_events (event_id, processed_at)
     VALUES ($1, NOW())
     ON CONFLICT (event_id) DO NOTHING
     RETURNING true as inserted`,
    [eventId]
  );

  if (!inserted.rows[0]?.inserted) {
    console.log(`Event ${eventId} already processed — skipping`);
    return; // idempotent — safe to skip
  }

  await process();
}

// SQL schema
/*
CREATE TABLE processed_events (
  event_id    TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cleanup old deduplication records (run periodically)
DELETE FROM processed_events WHERE processed_at < NOW() - INTERVAL '30 days';
*/
```

**Kafka consumer with deduplication:**

```typescript
consumer.run({
  eachMessage: async ({ message, topic, partition }) => {
    const eventId =
      message.headers?.['event-id']?.toString() ?? `${topic}:${partition}:${message.offset}`;

    await processEventIdempotent(eventId, async () => {
      const event = JSON.parse(message.value!.toString());
      await handleEvent(event);
    });
  },
});
```

**Idempotent HTTP operation design:**

```typescript
// Design operations to be safe to retry:
// GOOD: upsert instead of insert
await db.user.upsert({
  where: { email: data.email },
  update: {}, // no-op if exists
  create: { email: data.email, name: data.name },
});

// GOOD: check-then-act with unique constraint
try {
  await db.subscription.create({ data: { userId, planId } });
} catch (err) {
  if (isUniqueConstraintViolation(err)) {
    return db.subscription.findUnique({ where: { userId_planId: { userId, planId } } });
  }
  throw err;
}

// BAD: plain insert that fails on duplicate
await db.subscription.create({ data: { userId, planId } }); // throws on retry
```

## Details

**Idempotency window:** The deduplication record must live long enough to catch late retries. 24 hours is common for API keys. 30 days is common for event consumers. Match to your retry window.

**Exactly-once vs. at-least-once + idempotency:** True exactly-once delivery is extremely hard in distributed systems. The practical solution: at-least-once delivery + idempotent consumers = effectively exactly-once behavior.

**Anti-patterns:**

- Generating the idempotency key server-side — clients must provide stable keys; server-generated keys are different on each request
- Short deduplication TTL — if the retry window exceeds the TTL, duplicates slip through
- Non-deterministic operations inside idempotent handlers — random IDs, timestamps, side effects that shouldn't repeat

**Stripe's approach:** Idempotency keys are sent in request headers. Stripe stores the response for 24h and returns the same response for duplicate keys. They also lock to prevent concurrent identical requests.

## Source

microservices.io/patterns/communication-style/idempotent-consumer.html
