# OpenTelemetry Context Propagation

> Propagate trace context across service boundaries using W3C TraceContext headers and baggage

## When to Use

- Linking traces across microservices into a single distributed trace
- Passing metadata (tenant ID, feature flags) across service boundaries without modifying APIs
- Integrating services using different languages/frameworks into one trace view
- Debugging why context is lost between services (broken traces)

## Instructions

1. Register propagators in the SDK setup. W3C TraceContext is the default and recommended standard.
2. HTTP auto-instrumentation handles propagation automatically for most frameworks. Verify it works before adding manual propagation.
3. For non-HTTP transports (queues, gRPC metadata, custom protocols), inject context into carrier objects manually.
4. Use Baggage to pass key-value pairs across service boundaries (tenant ID, request priority).
5. Ensure all services in the chain use the same propagation format (W3C, B3, or both via composite propagator).

```typescript
// SDK setup — configure propagators
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { W3CBaggagePropagator } from '@opentelemetry/core';
import { CompositePropagator } from '@opentelemetry/core';

const sdk = new NodeSDK({
  textMapPropagator: new CompositePropagator({
    propagators: [
      new W3CTraceContextPropagator(), // traceparent + tracestate headers
      new W3CBaggagePropagator(), // baggage header
    ],
  }),
  // ... rest of config
});
```

```typescript
// Manual propagation for message queues
import { context, propagation, trace } from '@opentelemetry/api';

// Producer — inject context into message headers
function publishMessage(queue: string, payload: object): void {
  const headers: Record<string, string> = {};
  propagation.inject(context.active(), headers);

  messageQueue.publish(queue, {
    body: payload,
    headers, // Contains traceparent, tracestate, baggage
  });
}

// Consumer — extract context from message headers
async function consumeMessage(message: QueueMessage): Promise<void> {
  const parentContext = propagation.extract(context.active(), message.headers);

  const tracer = trace.getTracer('consumer');
  await context.with(parentContext, async () => {
    await tracer.startActiveSpan(
      'process.message',
      {
        kind: SpanKind.CONSUMER,
        attributes: { 'messaging.system': 'rabbitmq', 'messaging.destination': message.queue },
      },
      async (span) => {
        try {
          await processMessage(message.body);
        } finally {
          span.end();
        }
      }
    );
  });
}
```

```typescript
// Baggage — pass metadata across services
import { propagation, context, BaggageEntry } from '@opentelemetry/api';

// Set baggage in the upstream service
function setTenantContext(tenantId: string) {
  const baggage = propagation.createBaggage({
    'tenant.id': { value: tenantId },
    'request.priority': { value: 'high' },
  });
  return propagation.setBaggage(context.active(), baggage);
}

// Read baggage in the downstream service
function getTenantId(): string | undefined {
  const baggage = propagation.getBaggage(context.active());
  return baggage?.getEntry('tenant.id')?.value;
}
```

## Details

**W3C TraceContext headers:**

- `traceparent: 00-<traceId>-<spanId>-<flags>` — the core propagation header
- `tracestate: vendor1=value1,vendor2=value2` — vendor-specific trace information
- `baggage: tenant.id=abc,priority=high` — application-level key-value pairs

**Auto-propagation:** The HTTP instrumentation automatically injects `traceparent` on outgoing requests and extracts it on incoming requests. You typically do NOT need manual propagation for HTTP.

**When you need manual propagation:**

- Message queues (RabbitMQ, Kafka, SQS)
- gRPC metadata
- WebSocket messages
- Custom RPC protocols
- Cron jobs that should link to the triggering request

**B3 compatibility:** If some services use Zipkin B3 headers, add the B3 propagator:

```typescript
import { B3Propagator } from '@opentelemetry/propagator-b3';

new CompositePropagator({
  propagators: [
    new W3CTraceContextPropagator(),
    new B3Propagator(), // Also understands X-B3-TraceId headers
  ],
});
```

**Debugging broken traces:** If traces are disconnected across services:

1. Check that both services use the same propagation format
2. Verify the HTTP client is instrumented (auto-instrumentation must be loaded)
3. Check for reverse proxies stripping `traceparent` headers
4. For async operations, verify context is passed through `context.with()`

## Source

https://opentelemetry.io/docs/concepts/context-propagation/

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
