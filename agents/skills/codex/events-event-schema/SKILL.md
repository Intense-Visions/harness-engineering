# Events: Event Schema

> Define and evolve event schemas using a schema registry with Avro, Protobuf, or JSON Schema.

## When to Use

- Multiple services exchange events and must agree on the data structure
- You need to evolve event schemas without breaking existing consumers
- You're using Kafka and need schema validation at the broker level
- You want compile-time type safety for event payloads across services
- You're building a long-lived event-sourced system where events are stored permanently

## Instructions

**JSON Schema + Zod (TypeScript-native, no registry needed for small teams):**

```typescript
import { z } from 'zod';

// Define schemas with Zod — generates TypeScript types automatically
const OrderCreatedEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.literal('ORDER_CREATED'),
  schemaVersion: z.literal(1),
  aggregateId: z.string(),
  aggregateType: z.literal('Order'),
  occurredAt: z.string().datetime(),
  payload: z.object({
    orderId: z.string().uuid(),
    userId: z.string().uuid(),
    items: z.array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().positive(),
      })
    ),
    totalAmount: z.number().positive(),
    currency: z.string().length(3), // ISO 4217
  }),
});

type OrderCreatedEvent = z.infer<typeof OrderCreatedEventSchema>;

// Envelope schema for all events
const EventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string(),
  schemaVersion: z.number().int().positive(),
  aggregateId: z.string(),
  occurredAt: z.string().datetime(),
  correlationId: z.string().uuid().optional(),
  causationId: z.string().uuid().optional(),
});

// Validate incoming events
function parseOrderEvent(raw: unknown): OrderCreatedEvent {
  return OrderCreatedEventSchema.parse(raw); // throws ZodError if invalid
}

// Create events with correct structure
function createOrderEvent(order: Order, correlationId?: string): OrderCreatedEvent {
  return {
    eventId: crypto.randomUUID(),
    eventType: 'ORDER_CREATED',
    schemaVersion: 1,
    aggregateId: order.id,
    aggregateType: 'Order',
    occurredAt: new Date().toISOString(),
    payload: {
      orderId: order.id,
      userId: order.userId,
      items: order.items,
      totalAmount: order.total,
      currency: 'USD',
    },
  };
}
```

**Schema versioning strategy:**

```typescript
// Version 1
const UserCreatedV1 = z.object({
  schemaVersion: z.literal(1),
  userId: z.string(),
  email: z.string().email(),
});

// Version 2 — backward compatible (added optional field)
const UserCreatedV2 = z.object({
  schemaVersion: z.literal(2),
  userId: z.string(),
  email: z.string().email(),
  name: z.string().optional(), // new optional field — safe addition
});

// Discriminated union for versioned parsing
const UserCreatedEvent = z.discriminatedUnion('schemaVersion', [UserCreatedV1, UserCreatedV2]);

function parseUserCreated(raw: unknown) {
  const event = UserCreatedEvent.parse(raw);
  // Normalize to latest version
  if (event.schemaVersion === 1) {
    return { ...event, schemaVersion: 2 as const, name: undefined };
  }
  return event;
}
```

**Event registry for type-safe dispatch:**

```typescript
// Central event registry
type EventRegistry = {
  'order.created': OrderCreatedEvent;
  'order.shipped': OrderShippedEvent;
  'user.created': UserCreatedEvent;
  'payment.failed': PaymentFailedEvent;
};

type EventType = keyof EventRegistry;

// Schema map for validation
const eventSchemas: { [K in EventType]: z.ZodType<EventRegistry[K]> } = {
  'order.created': OrderCreatedEventSchema,
  'order.shipped': OrderShippedEventSchema,
  'user.created': UserCreatedEventSchema,
  'payment.failed': PaymentFailedEventSchema,
};

function validateEvent<T extends EventType>(type: T, raw: unknown): EventRegistry[T] {
  return eventSchemas[type].parse(raw) as EventRegistry[T];
}
```

## Details

**Schema compatibility rules (Avro / Confluent conventions apply to JSON Schema too):**
| Change | Backward Compatible | Forward Compatible |
|---|---|---|
| Add optional field | Yes | Yes |
| Add required field | No | Yes |
| Remove optional field | Yes | No |
| Remove required field | No | No |
| Rename field | No | No (use aliases) |
| Change field type | No | No |

**Safe evolution pattern:** Never remove or rename fields. Add fields as optional. Bump `schemaVersion`. Keep old schemas in the registry for producers still on v1.

**Confluent Schema Registry (for Kafka):** Stores Avro/Protobuf/JSON schemas. Producers register schemas; consumers validate against them. Enforces compatibility rules at publish time — prevents breaking changes from reaching consumers.

**Anti-patterns:**

- Using `any` or untyped JSON as event payloads — schema drift becomes undetectable
- Breaking schema changes without a version bump — consumers parse incorrectly in silence
- Storing schema versions only in docs, not in the event envelope — impossible to know how to parse at runtime

**Event ID for idempotency:** Always include `eventId` (UUID). Consumers use it to deduplicate redelivered events.

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
