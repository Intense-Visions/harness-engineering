# OpenTelemetry Metrics Pattern

> Record application metrics with OpenTelemetry counters, histograms, and gauges for monitoring and alerting

## When to Use

- Tracking request rates, error rates, and latency distributions
- Monitoring business metrics (orders processed, payments completed)
- Setting up SLI/SLO monitoring dashboards
- Replacing Prometheus client with vendor-neutral OpenTelemetry metrics

## Instructions

1. Get a meter from the registered MeterProvider: `metrics.getMeter('service-name', '1.0.0')`.
2. Choose the right instrument: Counter for monotonically increasing values, Histogram for distributions, Gauge for point-in-time values.
3. Add attributes (labels) to metric recordings for dimensional analysis.
4. Keep attribute cardinality low — high cardinality (user IDs as labels) causes metric explosion.
5. Use semantic conventions for metric names: `http.server.request.duration`, `http.server.active_requests`.
6. Register metric instruments once at startup, then record values throughout the application.

```typescript
// telemetry/metrics.ts
import { metrics, ValueType } from '@opentelemetry/api';

const meter = metrics.getMeter('order-service', '1.0.0');

// Counter — monotonically increasing (total requests, errors)
export const orderCounter = meter.createCounter('orders.created', {
  description: 'Total number of orders created',
  unit: '1',
});

export const orderErrorCounter = meter.createCounter('orders.errors', {
  description: 'Total number of order creation errors',
  unit: '1',
});

// Histogram — distribution of values (latency, request size)
export const orderDurationHistogram = meter.createHistogram('orders.duration', {
  description: 'Order creation duration',
  unit: 'ms',
  valueType: ValueType.DOUBLE,
});

// UpDownCounter — can increase and decrease (active connections, queue depth)
export const activeOrdersGauge = meter.createUpDownCounter('orders.active', {
  description: 'Number of orders currently being processed',
  unit: '1',
});

// Observable gauge — value is read on collection (memory, CPU)
meter.createObservableGauge(
  'process.memory.heap',
  {
    description: 'Heap memory usage',
    unit: 'By',
  },
  (result) => {
    result.observe(process.memoryUsage().heapUsed);
  }
);
```

```typescript
// Usage in service code
export async function createOrder(userId: string, items: OrderItem[]): Promise<Order> {
  const startTime = performance.now();
  activeOrdersGauge.add(1, { 'order.type': 'standard' });

  try {
    const order = await db.orders.create({ userId, items });

    orderCounter.add(1, {
      'order.type': 'standard',
      'order.status': 'created',
      'payment.method': order.paymentMethod,
    });

    return order;
  } catch (error) {
    orderErrorCounter.add(1, {
      'error.type': error instanceof Error ? error.constructor.name : 'unknown',
    });
    throw error;
  } finally {
    activeOrdersGauge.add(-1, { 'order.type': 'standard' });
    orderDurationHistogram.record(performance.now() - startTime, {
      'order.type': 'standard',
    });
  }
}
```

## Details

**Instrument types:**

| Instrument               | Type                | Example                         |
| ------------------------ | ------------------- | ------------------------------- |
| Counter                  | Monotonic sum       | Total requests, bytes sent      |
| UpDownCounter            | Non-monotonic sum   | Active connections, queue depth |
| Histogram                | Distribution        | Request duration, response size |
| Observable Counter       | Async monotonic sum | CPU time                        |
| Observable UpDownCounter | Async non-monotonic | Thread count                    |
| Observable Gauge         | Async point-in-time | Temperature, memory usage       |

**Attribute cardinality:** Each unique combination of attributes creates a separate time series. With 10 status codes and 5 methods, you get 50 time series. Adding user ID (100K users) would create 5 million time series — do not do this.

**Recommended metric names:**

- `http.server.request.duration` — request latency histogram
- `http.server.active_requests` — concurrent requests gauge
- `http.client.request.duration` — outgoing request latency
- `db.client.operation.duration` — database query duration
- `messaging.process.duration` — message processing time

**Histogram bucket configuration:** Default buckets work for most cases. Customize for specific SLOs:

```typescript
const meterProvider = new MeterProvider({
  views: [
    new View({
      instrumentName: 'http.server.request.duration',
      aggregation: new ExplicitBucketHistogramAggregation([
        5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000,
      ]),
    }),
  ],
});
```

**RED method:** Rate (requests/sec), Errors (error rate), Duration (latency distribution). These three metrics cover most monitoring needs for any service.

## Source

https://opentelemetry.io/docs/concepts/signals/metrics/

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
