# Microservices: Outbox Pattern

> Guarantee at-least-once event delivery using a transactional outbox and polling publisher.

## When to Use

- You publish events to Kafka/RabbitMQ/SNS as part of database transactions and can't afford to lose events
- Your service has experienced dual-write inconsistencies (DB wrote but event wasn't published, or vice versa)
- You need guaranteed event delivery without distributed transactions (no 2PC)
- You're building event-sourced or CQRS systems where event publication is critical

## Instructions

**The dual-write problem:**

```
WITHOUT OUTBOX:
1. BEGIN TRANSACTION
2. INSERT INTO orders → success
3. COMMIT TRANSACTION → success
4. kafka.produce('order.created') → CRASH → event never sent
   ↑ DB and message broker are now inconsistent

WITH OUTBOX:
1. BEGIN TRANSACTION
2. INSERT INTO orders → success
3. INSERT INTO outbox (same transaction) → success
4. COMMIT TRANSACTION → both writes are atomic
5. Separate publisher process reads outbox → publishes to Kafka → marks as published
```

**Full implementation with Prisma and Kafka:**

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Writing to DB + outbox in ONE transaction
async function createOrder(input: CreateOrderInput): Promise<Order> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        userId: input.userId,
        status: 'PENDING',
        total: calculateTotal(input.items),
        items: { create: input.items },
      },
    });

    // Outbox record — same transaction, same commit
    await tx.outboxEvent.create({
      data: {
        aggregateId: order.id,
        aggregateType: 'Order',
        eventType: 'order.created',
        payload: {
          eventId: crypto.randomUUID(),
          orderId: order.id,
          userId: order.userId,
          total: order.total,
          items: input.items,
          occurredAt: new Date().toISOString(),
        },
      },
    });

    return order;
  });
}

// For every domain operation, add an outbox record in the same transaction
async function cancelOrder(orderId: string, reason: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    });

    await tx.outboxEvent.create({
      data: {
        aggregateId: orderId,
        aggregateType: 'Order',
        eventType: 'order.cancelled',
        payload: {
          eventId: crypto.randomUUID(),
          orderId,
          reason,
          occurredAt: new Date().toISOString(),
        },
      },
    });
  });
}
```

**Polling publisher (runs as a separate process or scheduled job):**

```typescript
class OutboxPublisher {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: PrismaClient,
    private readonly kafka: KafkaProducer,
    private readonly options = {
      pollIntervalMs: 1_000,
      batchSize: 50,
      maxAttempts: 5,
    }
  ) {}

  start(): void {
    this.poll();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private poll(): void {
    this.processBatch()
      .catch((err) => console.error('Outbox publisher error:', err))
      .finally(() => {
        this.timer = setTimeout(() => this.poll(), this.options.pollIntervalMs);
      });
  }

  private async processBatch(): Promise<void> {
    const events = await this.db.outboxEvent.findMany({
      where: {
        publishedAt: null,
        attempts: { lt: this.options.maxAttempts },
      },
      orderBy: { createdAt: 'asc' },
      take: this.options.batchSize,
    });

    for (const event of events) {
      try {
        await this.kafka.send({
          topic: event.eventType,
          messages: [
            {
              key: event.aggregateId,
              value: JSON.stringify(event.payload),
              headers: {
                'outbox-event-id': event.id,
                'aggregate-type': event.aggregateType,
              },
            },
          ],
          acks: -1, // wait for all replicas
        });

        await this.db.outboxEvent.update({
          where: { id: event.id },
          data: { publishedAt: new Date() },
        });
      } catch (err) {
        await this.db.outboxEvent.update({
          where: { id: event.id },
          data: {
            attempts: { increment: 1 },
            lastError: (err as Error).message,
          },
        });
        console.error(`Failed to publish event ${event.id}:`, err);
      }
    }
  }
}
```

**Outbox schema (Prisma):**

```prisma
model OutboxEvent {
  id            String    @id @default(uuid())
  aggregateId   String
  aggregateType String
  eventType     String
  payload       Json
  publishedAt   DateTime?
  attempts      Int       @default(0)
  lastError     String?
  createdAt     DateTime  @default(now())

  @@index([publishedAt, attempts]) // index for the polling query
}
```

**Pruning published events:**

```typescript
// Run as a scheduled job (e.g., daily cron)
async function pruneOutbox(retentionDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const { count } = await prisma.outboxEvent.deleteMany({
    where: {
      publishedAt: { lt: cutoff },
    },
  });
  console.log(`Pruned ${count} outbox events`);
  return count;
}
```

## Details

**CDC alternative:** Instead of polling, use Debezium (Change Data Capture) to stream the outbox table changes directly to Kafka via Kafka Connect. Near-zero latency, no polling overhead.

**Consumer idempotency required:** The outbox guarantees at-least-once delivery. Consumers must be idempotent (use the `outbox-event-id` header as the deduplication key). See `events-idempotency` skill.

**Multiple publishers:** If running multiple service instances, each polls the outbox. Use `SELECT ... FOR UPDATE SKIP LOCKED` to prevent duplicate publishing:

```sql
SELECT * FROM outbox_events
WHERE published_at IS NULL AND attempts < 5
ORDER BY created_at
LIMIT 50
FOR UPDATE SKIP LOCKED;
```

**Anti-patterns:**

- Publishing before committing — the transaction may roll back but the event is already sent
- Outbox table with no index on `published_at` — polling becomes a full table scan
- Unbounded retention — the outbox table grows forever; schedule pruning

## Source

microservices.io/patterns/data/transactional-outbox.html
