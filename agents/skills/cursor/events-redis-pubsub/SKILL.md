# Events: Redis Pub/Sub

> Use Redis pub/sub channels and keyspace notifications for lightweight real-time messaging.

## When to Use

- You need low-latency, real-time messaging within a trusted system (not across the internet)
- You want to fan-out cache invalidation signals across service instances
- You're building a simple real-time feature (live counters, notifications, presence) and don't need persistence
- You need keyspace notifications (react when a Redis key changes, expires, or is deleted)
- NOT when you need guaranteed delivery or message persistence — Redis pub/sub is fire-and-forget

## Instructions

**Basic pub/sub with ioredis:**

```typescript
import Redis from 'ioredis';

const publisher = new Redis({ host: 'localhost', port: 6379 });
const subscriber = new Redis({ host: 'localhost', port: 6379 });
// Note: subscriber connection CANNOT be used for other commands

// Subscribe to channels
await subscriber.subscribe('cache.invalidation', 'user.presence');

subscriber.on('message', (channel: string, message: string) => {
  console.log(`[${channel}] ${message}`);

  if (channel === 'cache.invalidation') {
    const { key } = JSON.parse(message);
    localCache.delete(key);
  }

  if (channel === 'user.presence') {
    const { userId, status } = JSON.parse(message);
    updatePresence(userId, status);
  }
});

// Publish from anywhere (different connection)
async function invalidateCache(key: string): Promise<void> {
  await publisher.publish('cache.invalidation', JSON.stringify({ key, timestamp: Date.now() }));
}

async function updateUserPresence(userId: string, status: 'online' | 'offline'): Promise<void> {
  await publisher.publish('user.presence', JSON.stringify({ userId, status }));
}
```

**Pattern subscriptions (wildcard channels):**

```typescript
// Subscribe to all channels matching a pattern
await subscriber.psubscribe('order.*');

subscriber.on('pmessage', (pattern: string, channel: string, message: string) => {
  console.log(`Pattern: ${pattern}, Channel: ${channel}, Message: ${message}`);
  // pattern = 'order.*', channel = 'order.created', message = '{"orderId":"..."}'

  const eventType = channel.split('.')[1]; // 'created', 'shipped', etc.
  handleOrderEvent(eventType, JSON.parse(message));
});

// Publish to specific channels — matched by pattern
await publisher.publish('order.created', JSON.stringify({ orderId: '123' }));
await publisher.publish('order.shipped', JSON.stringify({ orderId: '123', tracking: 'UPS123' }));
```

**Keyspace notifications (react to Redis key events):**

```typescript
// Enable keyspace notifications in Redis config (or via command)
// notify-keyspace-events "Ex" — expired events
// notify-keyspace-events "KEx" — keyspace + expired events

const adminClient = new Redis({ host: 'localhost', port: 6379 });
await adminClient.config('SET', 'notify-keyspace-events', 'Ex'); // enable expired events

const notifSub = new Redis({ host: 'localhost', port: 6379 });
await notifSub.psubscribe('__keyevent@0__:expired'); // channel for db 0 key expirations

notifSub.on('pmessage', (_pattern, _channel, key) => {
  console.log(`Key expired: ${key}`);
  // e.g., session expired → log out user
  if (key.startsWith('session:')) {
    const userId = key.replace('session:', '');
    handleSessionExpiry(userId);
  }
});

// Set a key with expiry — triggers the notification when it expires
await adminClient.set('session:user-123', 'active', 'EX', 3600);
```

**Typed channel wrapper:**

```typescript
type Channels = {
  'cache.invalidation': { key: string; timestamp: number };
  'user.presence': { userId: string; status: 'online' | 'offline' };
};

class TypedRedisChannel<C extends Record<string, unknown>> {
  constructor(
    private readonly pub: Redis,
    private readonly sub: Redis
  ) {}

  async publish<K extends keyof C & string>(channel: K, data: C[K]): Promise<void> {
    await this.pub.publish(channel, JSON.stringify(data));
  }

  subscribe<K extends keyof C & string>(channel: K, handler: (data: C[K]) => void): () => void {
    this.sub.subscribe(channel);
    const listener = (ch: string, msg: string) => {
      if (ch === channel) handler(JSON.parse(msg) as C[K]);
    };
    this.sub.on('message', listener);
    return () => {
      this.sub.unsubscribe(channel);
      this.sub.off('message', listener);
    };
  }
}

const channels = new TypedRedisChannel<Channels>(publisher, subscriber);
channels.subscribe('cache.invalidation', ({ key }) => localCache.delete(key));
await channels.publish('cache.invalidation', { key: 'user:123', timestamp: Date.now() });
```

## Details

**Redis pub/sub is at-most-once:** If a subscriber is down when a message is published, the message is lost. For critical notifications, use a message queue or Redis Streams instead.

**Redis Streams vs. pub/sub:**
| Feature | Pub/Sub | Streams |
|---|---|---|
| Persistence | No | Yes |
| Consumer groups | No | Yes |
| Message history | No | Yes (by ID) |
| Delivery | At-most-once | At-least-once |

Use Streams when you need durability. Use pub/sub for lightweight real-time signals.

**Anti-patterns:**

- Using pub/sub for work queues — use BullMQ or a queue library instead
- Sharing the subscriber connection for regular Redis commands — subscribed connections are dedicated
- Not handling subscriber reconnection — ioredis auto-reconnects but you must re-subscribe in the `connect` event

**Reconnection handling:**

```typescript
subscriber.on('reconnecting', () => {
  console.log('Reconnecting to Redis...');
});

subscriber.on('ready', async () => {
  // Re-subscribe after reconnect
  await subscriber.subscribe('cache.invalidation', 'user.presence');
});
```

## Source

redis.io/docs/latest/develop/interact/pubsub/

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
