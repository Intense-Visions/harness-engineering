# Events: Outbox Pattern

> Reliably publish domain events using the transactional outbox and CDC polling approach.

## When to Use

- You need to guarantee that domain events are published whenever a database transaction commits
- You can't afford to lose events (payment processed, order created, user registered)
- You want to avoid the dual-write problem: "write to DB and publish to queue atomically"
- You're building event-sourced systems or microservices with eventual consistency

## Instructions

**The problem the outbox solves:**

```
BAD:
1. Write to DB ✓
2. Publish to Kafka ✗  ← crash here → event lost, DB and queue out of sync

GOOD (outbox):
1. Write to DB + write to outbox table (one transaction) ✓
2. Separate poller reads outbox, publishes to Kafka ✓
3. Mark outbox records as published ✓
```

**Outbox table schema (SQL):**

```sql
CREATE TABLE outbox (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL,
  aggregate_id TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  publish_attempts INT NOT NULL DEFAULT 0,
  error       TEXT
);

CREATE INDEX outbox_unpublished ON outbox (created_at)
  WHERE published_at IS NULL;
```

**Write to DB + outbox in one transaction (Prisma example):**

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createOrder(data: CreateOrderInput): Promise<Order> {
  return prisma.$transaction(async (tx) => {
    // Primary write
    const order = await tx.order.create({
      data: {
        userId: data.userId,
        items: data.items,
        status: 'PENDING',
        total: calculateTotal(data.items),
      },
    });

    // Outbox write — same transaction
    await tx.outbox.create({
      data: {
        eventType: 'order.created',
        aggregateId: order.id,
        payload: {
          orderId: order.id,
          userId: order.userId,
          total: order.total,
          items: order.items,
          occurredAt: new Date().toISOString(),
        },
      },
    });

    return order;
  });
  // If transaction commits: both writes succeed atomically
  // If transaction rolls back: neither write happens
}
```

**Polling publisher (separate process):**

```typescript
class OutboxPublisher {
  private running = false;

  constructor(
    private readonly db: PrismaClient,
    private readonly producer: KafkaProducer,
    private readonly pollIntervalMs = 1_000,
    private readonly batchSize = 100
  ) {}

  start(): void {
    this.running = true;
    this.poll();
  }

  stop(): void {
    this.running = false;
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        await this.publishBatch();
      } catch (err) {
        console.error('Outbox poll error:', err);
      }
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
    }
  }

  private async publishBatch(): Promise<void> {
    // Fetch unpublished events — oldest first, batch
    const events = await this.db.outbox.findMany({
      where: { publishedAt: null, publishAttempts: { lt: 5 } },
      orderBy: { createdAt: 'asc' },
      take: this.batchSize,
    });

    if (events.length === 0) return;

    for (const event of events) {
      try {
        // Publish to Kafka with event ID as key for deduplication
        await this.producer.send({
          topic: event.eventType,
          messages: [
            {
              key: event.aggregateId,
              value: JSON.stringify(event.payload),
              headers: { 'outbox-id': event.id },
            },
          ],
        });

        // Mark as published
        await this.db.outbox.update({
          where: { id: event.id },
          data: { publishedAt: new Date() },
        });
      } catch (err) {
        await this.db.outbox.update({
          where: { id: event.id },
          data: {
            publishAttempts: { increment: 1 },
            error: (err as Error).message,
          },
        });
      }
    }
  }
}
```

**CDC alternative (Debezium):** Instead of polling, use Change Data Capture to stream the outbox table changes directly to Kafka. No polling process needed — lower latency, zero overhead on DB.

```yaml
# Debezium connector config (Kafka Connect)
connector.class: io.debezium.connector.postgresql.PostgresConnector
database.hostname: postgres
database.dbname: myapp
table.include.list: public.outbox
transforms: outbox
transforms.outbox.type: io.debezium.transforms.outbox.EventRouter
```

## Details

**Polling interval vs. latency trade-off:** Polling every 100ms gives ~100ms event latency. Polling every 5s gives 5s latency. CDC gives near-zero latency but adds infrastructure complexity.

**Exactly-once delivery:** The outbox gives at-least-once. To achieve exactly-once, consumers must deduplicate using the outbox record ID (stored in message headers). See `events-idempotency` skill.

**Anti-patterns:**

- Publishing inside the application after the transaction (dual-write) — defeats the purpose
- Outbox table that grows unboundedly — prune published events after a retention period
- Missing index on `WHERE published_at IS NULL` — polling becomes a full table scan under load

**Retention cleanup:**

```sql
DELETE FROM outbox
WHERE published_at IS NOT NULL
  AND published_at < NOW() - INTERVAL '7 days';
```

## Source

microservices.io/patterns/data/transactional-outbox.html
