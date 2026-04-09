# OpenTelemetry Tracing Pattern

> Instrument distributed traces with OpenTelemetry spans to visualize request flow across services

## When to Use

- Debugging slow requests across microservices
- Understanding which service in a chain is causing latency
- Correlating logs and errors to specific request traces
- Building visibility into async workflows (queues, background jobs)

## Instructions

1. Get a tracer from the registered TracerProvider: `trace.getTracer('service-name', '1.0.0')`.
2. Create spans for significant operations: HTTP handlers, database queries, external API calls, queue processing.
3. Use `tracer.startActiveSpan` to automatically propagate context to child spans.
4. Set span attributes for searchability: `span.setAttribute('user.id', userId)`.
5. Set span status on error: `span.setStatus({ code: SpanStatusCode.ERROR, message })`.
6. Always end spans in a `finally` block — unfinished spans leak memory.
7. Use semantic conventions for attribute names (`http.method`, `db.system`, `rpc.method`).

```typescript
// services/order-service.ts
import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';

const tracer = trace.getTracer('order-service', '1.0.0');

export async function createOrder(userId: string, items: OrderItem[]): Promise<Order> {
  return tracer.startActiveSpan(
    'createOrder',
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'user.id': userId,
        'order.item_count': items.length,
      },
    },
    async (span) => {
      try {
        // Child span — automatically linked to parent via active context
        const inventory = await checkInventory(items);

        const order = await tracer.startActiveSpan('db.insertOrder', async (dbSpan) => {
          try {
            dbSpan.setAttribute('db.system', 'postgresql');
            dbSpan.setAttribute('db.operation', 'INSERT');
            const result = await db.orders.create({ userId, items, inventory });
            return result;
          } finally {
            dbSpan.end();
          }
        });

        span.setAttribute('order.id', order.id);
        span.setStatus({ code: SpanStatusCode.OK });
        return order;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    }
  );
}
```

## Details

**Span hierarchy:** Traces are trees of spans. The root span represents the entire request. Child spans represent sub-operations. The span context (trace ID + span ID) propagates automatically when using `startActiveSpan`.

**Span kinds:**

- `SERVER` — handling an incoming request
- `CLIENT` — making an outgoing request
- `INTERNAL` — internal operation (default)
- `PRODUCER` — sending a message to a queue
- `CONSUMER` — receiving a message from a queue

**Semantic conventions** (use these attribute names for tool compatibility):

```typescript
span.setAttribute('http.method', 'POST');
span.setAttribute('http.url', '/api/orders');
span.setAttribute('http.status_code', 201);
span.setAttribute('db.system', 'postgresql');
span.setAttribute('db.statement', 'INSERT INTO orders ...');
span.setAttribute('messaging.system', 'rabbitmq');
span.setAttribute('messaging.destination', 'order-events');
```

**Span events:** Add timestamped events within a span for notable occurrences:

```typescript
span.addEvent('inventory.checked', {
  'inventory.available': true,
  'inventory.reserved_count': 5,
});
```

**Common mistakes:**

- Forgetting to end spans (memory leak, incomplete traces)
- Creating too many spans (every function call) — trace backends charge per span
- Not setting error status (errors appear as successful spans in dashboards)
- Using non-standard attribute names (breaks dashboard queries)

## Source

https://opentelemetry.io/docs/concepts/signals/traces/

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
