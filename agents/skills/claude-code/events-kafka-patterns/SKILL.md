# Events: Kafka Patterns

> Produce and consume Kafka messages with partitioning, consumer groups, and offset management.

## When to Use

- You need high-throughput, durable event streaming (millions of events/day)
- You need event replay — re-consume historical events to rebuild state or debug
- You have multiple independent consumer groups that each need all events
- You need ordered processing within a partition (e.g., all events for one user in order)
- You're building event sourcing, CDC pipelines, or stream processing

## Instructions

**KafkaJS producer with partitioning:**

```typescript
import { Kafka, Partitioners, CompressionTypes } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'order-service',
  brokers: ['kafka:9092'],
  retry: { initialRetryTime: 300, retries: 8 },
});

const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
  idempotent: true, // enable exactly-once for the producer
  transactionTimeout: 30_000,
});

await producer.connect();

// Send with a partition key — ensures ordering for the same key
await producer.send({
  topic: 'order.events',
  messages: [
    {
      key: `order:${orderId}`, // same key → same partition → ordered
      value: JSON.stringify({
        eventType: 'ORDER_CREATED',
        orderId,
        userId,
        amount,
        timestamp: new Date().toISOString(),
      }),
      headers: {
        'event-type': 'ORDER_CREATED',
        'source-service': 'order-service',
        'schema-version': '1',
      },
    },
  ],
  compression: CompressionTypes.GZIP,
  acks: -1, // wait for all ISR replicas to ack
});
```

**Consumer with consumer group and manual offset commit:**

```typescript
const consumer = kafka.consumer({
  groupId: 'fulfillment-service', // all instances share this group — each partition assigned to one
  sessionTimeout: 30_000,
  heartbeatInterval: 3_000,
});

await consumer.connect();
await consumer.subscribe({ topic: 'order.events', fromBeginning: false });

await consumer.run({
  eachBatchAutoResolve: false, // manual offset commit for fine-grained control
  eachBatch: async ({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary }) => {
    for (const message of batch.messages) {
      const event = JSON.parse(message.value!.toString());

      try {
        await processOrderEvent(event);
        resolveOffset(message.offset); // mark this message as processed
      } catch (err) {
        console.error(`Failed to process ${message.offset}:`, err);
        // Do NOT resolve offset — message will be reprocessed
        break; // stop processing this batch
      }

      await heartbeat(); // prevent session timeout during slow processing
    }

    await commitOffsetsIfNecessary(); // commit resolved offsets
  },
});
```

**Transactional producer (atomic produce + consume):**

```typescript
const transactionalProducer = kafka.producer({
  transactionalId: 'order-processor-1', // unique per producer instance
  idempotent: true,
  maxInFlightRequests: 1,
});

await transactionalProducer.connect();

// Atomic: consume from input topic, produce to output topic
const transaction = await transactionalProducer.transaction();
try {
  await transaction.send({
    topic: 'shipping.commands',
    messages: [{ key: `order:${orderId}`, value: JSON.stringify({ orderId, address }) }],
  });

  // Commit offsets as part of the transaction
  await transaction.sendOffsets({
    consumerGroupId: 'order-processor',
    topics: [{ topic: 'order.events', partitions: [{ partition: 0, offset: '42' }] }],
  });

  await transaction.commit();
} catch (err) {
  await transaction.abort();
  throw err;
}
```

**Topic and partition strategy:**

```typescript
// Partition key selection strategy
function getPartitionKey(event: OrderEvent): string {
  // User-scoped events: partition by userId for ordering
  if ('userId' in event) return `user:${event.userId}`;
  // Order events: partition by orderId
  if ('orderId' in event) return `order:${event.orderId}`;
  // Global events: null key → round-robin
  return '';
}

// Topic naming convention
const TOPICS = {
  ORDER_EVENTS: 'order.events', // all order lifecycle events
  FULFILLMENT_COMMANDS: 'fulfillment.commands', // commands to fulfillment
  NOTIFICATION_EVENTS: 'notification.events', // fan-out notifications
  DLQ: 'order.events.dlq', // failed processing
} as const;
```

## Details

**Consumer group mechanics:** All consumers in the same `groupId` share partitions — each partition assigned to one consumer. Add consumers to scale (up to `partitionCount` consumers can process in parallel). Different `groupId` values create independent consumers that each receive all messages.

**Offset management:**

- `fromBeginning: true` — start from the earliest retained offset (useful for new consumer groups)
- `fromBeginning: false` — start from the latest offset (only new messages)
- Manual offset commit gives exactly-once semantics when combined with idempotent processing

**Retention and compaction:**

- Default retention: time-based (7 days). Good for audit logs, replay.
- Log compaction: keeps only the latest message per key. Good for state materialization (like a distributed KV store).

**Anti-patterns:**

- Single partition for all messages — no parallelism, no ordering control
- Committing offsets before processing — risk of data loss on crash
- Consumer that blocks `eachMessage` without heartbeats — causes session timeout and partition reassignment
- Sharing `transactionalId` across multiple producer instances — causes transaction fencing errors

**Schema evolution:** Use Avro or Protobuf with a schema registry. Never break consumers by removing fields without versioning. See `events-event-schema` skill.

## Source

kafka.apache.org/documentation/
