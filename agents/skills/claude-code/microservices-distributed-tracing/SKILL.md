# Microservices: Distributed Tracing

> Propagate trace context and emit spans across services using OpenTelemetry.

## When to Use

- A request spans multiple services and you need to understand where latency comes from
- You have intermittent failures or slowdowns that are hard to reproduce
- You need to answer "which service caused this request to fail?" without grepping N log files
- You're optimizing performance and need a waterfall view of all calls within a single request

## Instructions

**OpenTelemetry setup (Node.js — must be first import):**

```typescript
// instrumentation.ts — must be imported BEFORE everything else
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'order-service',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION ?? '0.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318/v1/traces',
  }),
  instrumentations: [
    new HttpInstrumentation(), // auto-instruments fetch/http
    new ExpressInstrumentation(), // auto-instruments Express routes
    new PgInstrumentation(), // auto-instruments pg queries
    new RedisInstrumentation(), // auto-instruments Redis calls
  ],
});

sdk.start();

process.on('SIGTERM', async () => {
  await sdk.shutdown();
});
```

**Manual spans for custom operations:**

```typescript
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';

const tracer = trace.getTracer('order-service');

async function processOrder(orderId: string): Promise<OrderResult> {
  // Create a span for a custom operation not auto-instrumented
  return tracer.startActiveSpan('processOrder', async (span) => {
    span.setAttributes({
      'order.id': orderId,
      'order.service': 'order-service',
    });

    try {
      // Child spans are automatically created for DB/HTTP calls inside here
      const order = await db.order.findUnique({ where: { id: orderId } });
      if (!order) throw new Error(`Order ${orderId} not found`);

      span.setAttribute('order.status', order.status);
      span.setAttribute('order.total', order.total);

      const result = await fulfillOrder(order);

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
}

// Outgoing HTTP call with trace context propagation
async function callPaymentService(orderId: string, amount: number): Promise<PaymentResult> {
  return tracer.startActiveSpan(
    'payment.charge',
    { kind: SpanKind.CLIENT, attributes: { 'order.id': orderId } },
    async (span) => {
      try {
        // fetch() is auto-instrumented — W3C trace context headers injected automatically
        const response = await fetch(`${PAYMENT_SERVICE_URL}/charges`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, amount }),
        });

        span.setAttribute('http.status_code', response.status);

        if (!response.ok) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw new Error(`Payment failed: HTTP ${response.status}`);
        }

        const result = await response.json();
        span.setAttribute('payment.charge_id', result.chargeId);
        return result;
      } finally {
        span.end();
      }
    }
  );
}
```

**Correlation ID for log correlation:**

```typescript
import { trace, context } from '@opentelemetry/api';

// Middleware: expose trace ID in response headers for client-side correlation
app.use((req, res, next) => {
  const span = trace.getActiveSpan();
  if (span) {
    const { traceId, spanId } = span.spanContext();
    res.setHeader('X-Trace-Id', traceId);
    res.setHeader('X-Span-Id', spanId);

    // Add to every log entry automatically
    logger.setContext({ traceId, spanId });
  }
  next();
});

// In structured logs — include traceId so logs and traces can be linked in Jaeger/Grafana
logger.info('Order created', {
  orderId,
  traceId: trace.getActiveSpan()?.spanContext().traceId,
});
```

**OpenTelemetry Collector (YAML config):**

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
      grpc:
        endpoint: 0.0.0.0:4317

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024
  memory_limiter:
    limit_mib: 512

exporters:
  jaeger:
    endpoint: jaeger:14250
  otlp/tempo:
    endpoint: tempo:4317

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [jaeger, otlp/tempo]
```

## Details

**Trace context propagation:** OpenTelemetry uses the W3C TraceContext standard (`traceparent` and `tracestate` headers). Auto-instrumentation injects these headers on outgoing HTTP calls and extracts them from incoming requests. Cross-service traces are linked by the same `traceId`.

**Sampling:** Tracing every request is expensive. Use sampling:

```typescript
import { TraceIdRatioBased } from '@opentelemetry/sdk-trace-base';
// Sample 10% of requests in production
const sampler = new TraceIdRatioBased(0.1);
// Always sample errors — head-based vs. tail-based sampling
```

**Anti-patterns:**

- Adding trace context manually when auto-instrumentation handles it — creates duplicate spans
- Not setting span status on error — spans appear successful in dashboards
- Sampling too aggressively — rare errors may not be captured

**Backends:**

- Jaeger (open source, self-hosted)
- Tempo + Grafana (open source, integrates with Prometheus)
- Datadog, Honeycomb, Dynatrace (commercial, powerful)

## Source

microservices.io/patterns/observability/distributed-tracing.html
