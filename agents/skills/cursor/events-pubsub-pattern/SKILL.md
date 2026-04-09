# Events: Pub/Sub Pattern

> Implement publisher-subscriber communication with topic-based routing and fan-out delivery.

## When to Use

- You need to broadcast events to multiple independent subscribers
- Publishers and subscribers should be decoupled — publishers don't know who's listening
- You want fan-out delivery (one event → many handlers)
- You're implementing domain events, integration events, or notification fan-out
- NOT when you need guaranteed exactly-once delivery (use a message queue instead)

## Instructions

**In-process typed pub/sub:**

```typescript
type Listener<T> = (payload: T) => void | Promise<void>;

class PubSub {
  private topics = new Map<string, Set<Listener<unknown>>>();

  subscribe<T>(topic: string, listener: Listener<T>): () => void {
    if (!this.topics.has(topic)) this.topics.set(topic, new Set());
    this.topics.get(topic)!.add(listener as Listener<unknown>);
    return () => this.topics.get(topic)?.delete(listener as Listener<unknown>);
  }

  async publish<T>(topic: string, payload: T): Promise<void> {
    const listeners = this.topics.get(topic) ?? new Set();
    await Promise.all([...listeners].map((l) => l(payload)));
  }
}

// Define topics with types
interface AppTopics {
  'user.created': { userId: string; email: string; createdAt: Date };
  'order.placed': { orderId: string; userId: string; total: number };
  'payment.processed': { orderId: string; status: 'success' | 'failed' };
}

// Type-safe wrapper
class TypedPubSub<Topics extends Record<string, unknown>> {
  private bus = new PubSub();

  subscribe<K extends keyof Topics & string>(topic: K, listener: Listener<Topics[K]>): () => void {
    return this.bus.subscribe(topic, listener);
  }

  async publish<K extends keyof Topics & string>(topic: K, payload: Topics[K]): Promise<void> {
    await this.bus.publish(topic, payload);
  }
}

const pubsub = new TypedPubSub<AppTopics>();

// Subscribers register independently
pubsub.subscribe('user.created', async ({ userId, email }) => {
  await sendWelcomeEmail(email);
});

pubsub.subscribe('user.created', async ({ userId }) => {
  await createDefaultProfile(userId);
});

pubsub.subscribe('order.placed', async ({ orderId, total }) => {
  await reserveInventory(orderId);
  await chargeTax(total);
});

// Publisher doesn't know about subscribers
await pubsub.publish('user.created', {
  userId: 'u-123',
  email: 'alice@example.com',
  createdAt: new Date(),
});
```

**Topic wildcards and pattern matching:**

```typescript
class WildcardPubSub {
  private subscriptions: { pattern: RegExp; listener: Listener<unknown> }[] = [];

  subscribe<T>(pattern: string, listener: Listener<T>): () => void {
    // Convert glob to regex: 'order.*' → /^order\..+$/
    const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.+') + '$');
    const entry = { pattern: regex, listener: listener as Listener<unknown> };
    this.subscriptions.push(entry);
    return () => {
      this.subscriptions = this.subscriptions.filter((s) => s !== entry);
    };
  }

  async publish<T>(topic: string, payload: T): Promise<void> {
    const matching = this.subscriptions.filter((s) => s.pattern.test(topic));
    await Promise.all(matching.map((s) => s.listener(payload)));
  }
}

const bus = new WildcardPubSub();
bus.subscribe('order.*', (payload) => console.log('Any order event:', payload));
bus.subscribe('*.created', (payload) => console.log('Any created event:', payload));
await bus.publish('order.created', { orderId: '123' }); // matches both
```

## Details

**Pub/Sub vs. Message Queue:**
| | Pub/Sub | Message Queue |
|---|---|---|
| Delivery | At-most-once (fire & forget) | At-least-once (persisted) |
| Consumers | Many (fan-out) | Competing (one wins) |
| History | No replay | Replay/DLQ |
| Use case | Real-time notifications | Reliable task processing |

Use pub/sub for notifications and fan-out. Use a queue when you need guaranteed processing.

**At-most-once delivery:** If a subscriber crashes or throws, the event is lost. For critical events (payments, order state changes), use a message queue or transactional outbox instead.

**Anti-patterns:**

- Publishing synchronously inside a transaction — if the transaction rolls back, the event has already been sent
- Subscribers that throw exceptions without handling them — one bad subscriber can block all others; wrap each listener in try/catch
- Circular pub/sub chains — event A triggers event B which triggers event A

**Error isolation:**

```typescript
async publish<T>(topic: string, payload: T): Promise<void> {
  const listeners = this.topics.get(topic) ?? new Set();
  const results = await Promise.allSettled([...listeners].map(l => l(payload)));
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    console.error(`${failures.length} subscriber(s) failed for topic: ${topic}`);
  }
}
```

## Source

microservices.io/patterns/data/event-sourcing.html

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
