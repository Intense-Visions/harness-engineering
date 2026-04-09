# Dead Letter Queue Pattern

> Handle permanently failing messages with dead letter queues for safe inspection, alerting, and reprocessing

## When to Use

- Message processing fails repeatedly after retries are exhausted
- Need to prevent poison messages from blocking the main queue
- Requiring manual inspection of failed messages to diagnose issues
- Building event-driven systems with guaranteed message handling

## Instructions

1. Configure a dead letter queue (DLQ) alongside every main processing queue.
2. After N retry attempts (typically 3-5), move the message to the DLQ instead of retrying forever.
3. Preserve the original message payload, headers, error details, and attempt count in the DLQ entry.
4. Set up alerts on DLQ message count — messages in the DLQ indicate a processing problem.
5. Build a reprocessing mechanism to replay DLQ messages back to the main queue after fixing the issue.
6. Add a DLQ dashboard for operators to inspect, diagnose, and manually resolve failed messages.

```typescript
// queues/dead-letter.ts
interface DeadLetterEntry<T> {
  id: string;
  originalQueue: string;
  payload: T;
  error: string;
  attempts: number;
  firstFailedAt: string;
  lastFailedAt: string;
  metadata: Record<string, unknown>;
}

export class DeadLetterQueue<T> {
  private entries: Map<string, DeadLetterEntry<T>> = new Map();

  constructor(
    private readonly name: string,
    private readonly onDeadLetter?: (entry: DeadLetterEntry<T>) => void
  ) {}

  add(entry: Omit<DeadLetterEntry<T>, 'id' | 'lastFailedAt'>): void {
    const id = crypto.randomUUID();
    const deadLetter: DeadLetterEntry<T> = {
      ...entry,
      id,
      lastFailedAt: new Date().toISOString(),
    };
    this.entries.set(id, deadLetter);
    this.onDeadLetter?.(deadLetter);
    console.error(`[DLQ:${this.name}] Message dead-lettered: ${entry.error}`, {
      id,
      attempts: entry.attempts,
    });
  }

  list(): DeadLetterEntry<T>[] {
    return Array.from(this.entries.values());
  }

  get(id: string): DeadLetterEntry<T> | undefined {
    return this.entries.get(id);
  }

  remove(id: string): boolean {
    return this.entries.delete(id);
  }

  reprocess(id: string): T | undefined {
    const entry = this.entries.get(id);
    if (entry) {
      this.entries.delete(id);
      return entry.payload;
    }
    return undefined;
  }

  get count(): number {
    return this.entries.size;
  }
}
```

```typescript
// workers/order-processor.ts
import { DeadLetterQueue } from '../queues/dead-letter';

interface OrderMessage {
  orderId: string;
  items: Array<{ productId: string; qty: number }>;
}

const dlq = new DeadLetterQueue<OrderMessage>('orders', (entry) => {
  // Alert on dead letter
  alerting.send({
    severity: 'warning',
    message: `Order processing failed: ${entry.error}`,
    context: { orderId: entry.payload.orderId, attempts: entry.attempts },
  });
});

const MAX_RETRIES = 3;

async function processMessage(message: OrderMessage, attempt = 1): Promise<void> {
  try {
    await orderService.process(message);
  } catch (error) {
    if (attempt >= MAX_RETRIES) {
      dlq.add({
        originalQueue: 'orders',
        payload: message,
        error: error instanceof Error ? error.message : String(error),
        attempts: attempt,
        firstFailedAt: new Date().toISOString(),
        metadata: { lastAttemptError: String(error) },
      });
      return; // Do not rethrow — message is safely in DLQ
    }

    // Retry with backoff
    await delay(1000 * Math.pow(2, attempt));
    return processMessage(message, attempt + 1);
  }
}
```

## Details

**Cloud provider DLQs:**

- **AWS SQS:** Configure `RedrivePolicy` with `maxReceiveCount` and `deadLetterTargetArn`
- **Azure Service Bus:** Built-in DLQ subqueue on every queue/subscription
- **Google Pub/Sub:** Configure `deadLetterPolicy` on the subscription
- **RabbitMQ:** Declare `x-dead-letter-exchange` on the queue

**BullMQ (Node.js) dead letter pattern:**

```typescript
const queue = new Queue('orders');
const worker = new Worker('orders', processOrder, {
  settings: {
    backoffStrategies: { custom: (attemptsMade) => Math.pow(2, attemptsMade) * 1000 },
  },
});

worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= job.opts.attempts!) {
    // Move to DLQ
    await dlqQueue.add('dead-letter', {
      originalJob: job.data,
      error: err.message,
      attempts: job.attemptsMade,
    });
  }
});
```

**Reprocessing strategy:** When the underlying issue is fixed:

1. Inspect DLQ messages to confirm the fix addresses the failure
2. Replay messages one at a time to verify
3. Batch replay remaining messages
4. Monitor for new DLQ entries

**DLQ metrics to track:** Message count (should trend toward zero), age of oldest message, inflow rate (new messages/hour), category of errors.

## Source

https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html

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
