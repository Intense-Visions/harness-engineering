# OpenTelemetry Logging Pattern

> Correlate structured logs with distributed traces using OpenTelemetry context for unified observability

## When to Use

- Connecting log entries to the trace that generated them
- Querying logs for a specific trace ID to understand request flow
- Migrating from plain text logs to structured, correlated logs
- Sending logs to the same backend as traces and metrics via OTLP

## Instructions

1. Use structured logging (JSON) with a library like Pino or Winston.
2. Inject trace context (trace ID, span ID) into every log entry automatically.
3. Use OpenTelemetry's log bridge API or instrument your existing logger to include context.
4. Log at appropriate levels: ERROR for failures, WARN for degradation, INFO for significant events, DEBUG for troubleshooting.
5. Include relevant attributes in log entries (request ID, user ID, operation name).
6. Send logs via OTLP exporter to correlate with traces in your observability backend.

```typescript
// logger/otel-logger.ts
import pino from 'pino';
import { trace, context } from '@opentelemetry/api';

function getTraceContext(): Record<string, string> {
  const span = trace.getActiveSpan();
  if (!span) return {};

  const spanContext = span.spanContext();
  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
    trace_flags: `0${spanContext.traceFlags.toString(16)}`,
  };
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    log(object) {
      // Automatically inject trace context into every log entry
      return { ...object, ...getTraceContext() };
    },
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
});

// Create child loggers for specific modules
export function createLogger(module: string) {
  return logger.child({ module });
}
```

```typescript
// Usage in service code
import { createLogger } from '../logger/otel-logger';

const log = createLogger('order-service');

export async function createOrder(userId: string, items: OrderItem[]): Promise<Order> {
  log.info({ userId, itemCount: items.length }, 'Creating order');

  try {
    const order = await db.orders.create({ userId, items });
    log.info({ orderId: order.id, userId }, 'Order created successfully');
    return order;
  } catch (error) {
    log.error({ err: error, userId }, 'Failed to create order');
    throw error;
  }
}

// Output (with trace context automatically injected):
// {"level":"info","time":1700000000,"module":"order-service",
//  "trace_id":"abc123","span_id":"def456","trace_flags":"01",
//  "userId":"u1","itemCount":3,"msg":"Creating order"}
```

## Details

**OpenTelemetry Logs SDK (direct):** For sending logs via OTLP without a logging library bridge:

```typescript
import { logs, SeverityNumber } from '@opentelemetry/api-logs';

const logger = logs.getLogger('order-service');

logger.emit({
  severityNumber: SeverityNumber.INFO,
  severityText: 'INFO',
  body: 'Order created',
  attributes: { 'order.id': orderId, 'user.id': userId },
});
```

**Pino + OpenTelemetry instrumentation:**

```typescript
// Auto-instrumentation adds trace context to Pino logs
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';

const pinoInstrumentation = new PinoInstrumentation({
  logHook: (span, record) => {
    record['service.name'] = 'order-service';
  },
});
```

**Winston integration:**

```typescript
import winston from 'winston';
import { trace } from '@opentelemetry/api';

const otelFormat = winston.format((info) => {
  const span = trace.getActiveSpan();
  if (span) {
    const ctx = span.spanContext();
    info.trace_id = ctx.traceId;
    info.span_id = ctx.spanId;
  }
  return info;
});

const logger = winston.createLogger({
  format: winston.format.combine(otelFormat(), winston.format.json()),
  transports: [new winston.transports.Console()],
});
```

**Log levels and when to use them:**

- **ERROR:** Something failed and needs attention. Include error details and context.
- **WARN:** Something unexpected happened but the operation continued (fallback used, retry needed).
- **INFO:** Significant business events (order created, user logged in, payment processed).
- **DEBUG:** Detailed troubleshooting information (query parameters, cache hits, decision branches).

**Correlation in observability backends:** With trace ID in logs, you can: search Grafana Loki by trace ID, click from a Jaeger trace to its logs, filter Datadog logs by trace, and build Kibana dashboards that link logs to traces.

## Source

https://opentelemetry.io/docs/concepts/signals/logs/

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
