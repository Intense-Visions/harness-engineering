# Events: Message Queue

> Use message queues for reliable async delivery with competing consumers and dead letter queues.

## When to Use

- You need reliable, at-least-once delivery — messages must not be lost even if the consumer crashes
- You have work that should be processed by exactly one consumer (competing consumers pattern)
- You need decoupling between producer and consumer throughput
- You want dead letter queues (DLQ) for failed message handling
- Background job processing, email sending, report generation, order fulfillment

## Instructions

**BullMQ (Redis-backed queue — recommended for Node.js):**

```typescript
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis({ host: 'localhost', port: 6379 });

// Define job data types
interface SendEmailJobData {
  to: string;
  subject: string;
  body: string;
  templateId?: string;
}

// Producer — enqueue jobs
const emailQueue = new Queue<SendEmailJobData>('email', { connection });

async function scheduleWelcomeEmail(userId: string, email: string): Promise<void> {
  await emailQueue.add(
    'welcome',
    { to: email, subject: 'Welcome!', body: 'Thanks for joining.', templateId: 'welcome-v2' },
    {
      delay: 5_000, // wait 5s before processing
      attempts: 3, // retry up to 3 times
      backoff: { type: 'exponential', delay: 2_000 }, // 2s, 4s, 8s
      removeOnComplete: { count: 100 }, // keep last 100 completed jobs
      removeOnFail: { count: 50 }, // keep last 50 failed jobs
    }
  );
}

// Consumer — process jobs
const emailWorker = new Worker<SendEmailJobData>(
  'email',
  async (job: Job<SendEmailJobData>) => {
    console.log(`Processing job ${job.id}: send email to ${job.data.to}`);
    await sendEmail(job.data.to, job.data.subject, job.data.body);
    // Returning from the processor marks the job complete
  },
  {
    connection,
    concurrency: 5, // process 5 jobs in parallel
  }
);

emailWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed after all retries:`, err.message);
  // At this point, job moves to the failed set (acts as DLQ)
});
```

**RabbitMQ with amqplib:**

```typescript
import amqp from 'amqplib';

const QUEUE = 'order.processing';
const DLQ = 'order.processing.dlq';

async function setupQueue(): Promise<void> {
  const conn = await amqp.connect('amqp://localhost');
  const channel = await conn.createChannel();

  // Dead letter queue
  await channel.assertQueue(DLQ, { durable: true });

  // Main queue with DLQ routing
  await channel.assertQueue(QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': DLQ,
      'x-message-ttl': 3_600_000, // messages expire after 1h
    },
  });

  channel.prefetch(1); // process one message at a time per consumer
  return channel;
}

// Producer
async function publishOrder(orderId: string, amount: number): Promise<void> {
  const channel = await setupQueue();
  const message = JSON.stringify({ orderId, amount, timestamp: new Date() });
  channel.sendToQueue(QUEUE, Buffer.from(message), { persistent: true });
}

// Consumer
async function startConsumer(): Promise<void> {
  const channel = await setupQueue();
  await channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const data = JSON.parse(msg.content.toString());
      await processOrder(data.orderId, data.amount);
      channel.ack(msg); // acknowledge on success
    } catch (err) {
      console.error('Processing failed:', err);
      // nack with requeue=false — sends to DLQ after retries exhausted
      channel.nack(msg, false, false);
    }
  });
}
```

**Competing consumers pattern:**

```typescript
// Run multiple workers — each message processed by exactly ONE worker
// Scale by adding more worker instances

// Worker 1 (process 1)
const worker1 = new Worker('orders', processOrder, { connection, concurrency: 3 });

// Worker 2 (process 2 or separate machine)
const worker2 = new Worker('orders', processOrder, { connection, concurrency: 3 });

// BullMQ guarantees only one worker processes each job
```

## Details

**Delivery guarantees:**

- **At-most-once:** Fire and forget. Publisher sends, never tracks. Simple but messages can be lost.
- **At-least-once:** Publisher gets confirmation; consumer acks after processing. May process twice — handlers must be idempotent.
- **Exactly-once:** At-least-once + deduplication. Hard to achieve; usually simulated with idempotency keys.

**Dead letter queue strategy:**

1. Job fails after all retries
2. Moved to DLQ automatically
3. Monitoring alerts on DLQ depth
4. Operators inspect, fix the bug, and replay from DLQ

**Anti-patterns:**

- Consumers that ack before processing (risk losing work on crash)
- Long-running consumers without heartbeats (broker requeues "stalled" jobs)
- Unbounded queue depth (apply backpressure via rate limiting producers)
- Processing heavy jobs in HTTP request handlers (enqueue them instead)

**Monitoring queues:**

```typescript
// BullMQ — check queue health
const counts = await emailQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
console.log(counts);
// Expose as /metrics endpoint for Prometheus
```

## Source

microservices.io/patterns/communication-style/messaging.html

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
