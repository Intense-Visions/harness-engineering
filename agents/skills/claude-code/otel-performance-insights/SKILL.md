# OpenTelemetry Performance Insights

> Identify performance bottlenecks using trace analysis, histogram metrics, and span timing patterns

## When to Use

- Debugging slow API responses — which operation in the chain is the bottleneck
- Setting and monitoring SLOs for latency (p50, p95, p99)
- Profiling database query performance across the application
- Comparing performance before and after a change (deployment comparison)

## Instructions

1. Use histogram metrics for latency tracking. Record duration of HTTP requests, database queries, and business operations.
2. Add span attributes that enable dimensional analysis: endpoint, method, status, operation type.
3. Instrument N+1 query detection by counting database spans per parent span.
4. Track queue wait time separately from processing time.
5. Set up SLO-based alerts on p99 latency, not just average.
6. Use span links to connect batch processing back to triggering requests.

```typescript
// Performance-instrumented service
import { trace, metrics } from '@opentelemetry/api';

const tracer = trace.getTracer('order-service');
const meter = metrics.getMeter('order-service');

const requestDuration = meter.createHistogram('http.server.request.duration', {
  description: 'HTTP request duration',
  unit: 'ms',
});

const dbQueryDuration = meter.createHistogram('db.query.duration', {
  description: 'Database query duration',
  unit: 'ms',
});

const dbQueryCounter = meter.createCounter('db.query.count', {
  description: 'Number of database queries per request',
  unit: '1',
});

// Middleware that tracks request performance
export async function performanceMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = performance.now();
  const parentSpan = trace.getActiveSpan();

  // Track DB query count for N+1 detection
  let queryCount = 0;
  const originalQuery = db.query;
  db.query = async (...args: any[]) => {
    queryCount++;
    const qStart = performance.now();
    try {
      return await originalQuery.apply(db, args);
    } finally {
      dbQueryDuration.record(performance.now() - qStart, {
        'db.operation': args[0]?.split(' ')[0] || 'unknown',
      });
    }
  };

  res.on('finish', () => {
    const duration = performance.now() - start;
    const route = req.route?.path || req.path;

    requestDuration.record(duration, {
      'http.method': req.method,
      'http.route': route,
      'http.status_code': res.statusCode,
    });

    dbQueryCounter.add(queryCount, { 'http.route': route });

    // Flag potential N+1 queries
    if (queryCount > 10 && parentSpan) {
      parentSpan.addEvent('performance.warning', {
        'warning.type': 'n_plus_one',
        'db.query_count': queryCount,
        'http.route': route,
      });
    }

    db.query = originalQuery;
  });

  next();
}
```

```typescript
// SLO monitoring with histograms
const sloLatencyTarget = 500; // 500ms target

// In dashboard queries (PromQL example):
// Error budget: 1 - (histogram_quantile(0.99, rate(http_server_request_duration_bucket[5m])) / 500)
// SLO compliance: sum(rate(http_server_request_duration_bucket{le="500"}[5m])) / sum(rate(http_server_request_duration_count[5m]))
```

```typescript
// Waterfall analysis helper — log span timing breakdown
function analyzeTrace(spans: ReadableSpan[]): void {
  const root = spans.find((s) => !s.parentSpanId);
  if (!root) return;

  const totalMs = root.duration[0] * 1000 + root.duration[1] / 1e6;
  const breakdown = spans
    .filter((s) => s !== root)
    .map((s) => ({
      name: s.name,
      duration: s.duration[0] * 1000 + s.duration[1] / 1e6,
      percentage: (((s.duration[0] * 1000 + s.duration[1] / 1e6) / totalMs) * 100).toFixed(1),
    }))
    .sort((a, b) => b.duration - a.duration);

  console.table(breakdown);
  // Shows which spans consume the most time in the request
}
```

## Details

**Key performance metrics to track:**

| Metric                         | Type          | Purpose               |
| ------------------------------ | ------------- | --------------------- |
| `http.server.request.duration` | Histogram     | Overall API latency   |
| `db.query.duration`            | Histogram     | Database performance  |
| `http.client.request.duration` | Histogram     | Outgoing call latency |
| `db.query.count`               | Counter       | N+1 query detection   |
| `http.server.active_requests`  | UpDownCounter | Concurrency tracking  |

**Percentile analysis:** Average latency hides outliers. Always track p50 (median), p95 (most users), and p99 (worst case):

- p50 = 50ms, p99 = 500ms — tail latency problem (some requests hit a slow path)
- p50 = 200ms, p99 = 220ms — consistently slow (all requests are slow)

**Trace-based analysis pattern:**

1. Filter traces by latency (find traces > p99 threshold)
2. Compare slow trace waterfall with fast trace waterfall
3. Identify the span that differs — that is your bottleneck
4. Check span attributes for clues (specific query, specific user, specific payload size)

**Common bottleneck patterns:**

- **Sequential calls:** Spans that should be parallel are sequential — use `Promise.all`
- **N+1 queries:** Many small DB spans instead of one batch query — use DataLoader or JOINs
- **Missing cache:** Same data fetched repeatedly — add caching with cache-hit span events
- **Large payloads:** Long serialization spans — paginate or compress
- **Connection pool exhaustion:** Long wait times before DB span starts — increase pool size

**Deployment comparison:** Tag spans with the deployment version. Compare p99 latency between versions to detect regressions immediately.

## Source

https://opentelemetry.io/docs/concepts/signals/traces/#span-events
