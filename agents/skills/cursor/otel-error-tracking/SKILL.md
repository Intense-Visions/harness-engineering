# OpenTelemetry Error Tracking

> Track and correlate errors across services with span exceptions, status codes, and error events

## When to Use

- Tracking errors across distributed services and correlating them to specific traces
- Replacing or supplementing Sentry/Bugsnag with OpenTelemetry-native error tracking
- Understanding error propagation — which service caused a cascading failure
- Building error rate SLIs from trace data

## Instructions

1. Record exceptions with `span.recordException(error)` — this adds an exception event with stack trace, type, and message.
2. Always set span status to ERROR after recording an exception: `span.setStatus({ code: SpanStatusCode.ERROR, message })`.
3. Add error context as span attributes: error code, affected resource, user context.
4. Use span events for non-fatal errors (warnings, handled exceptions, fallback activations).
5. Create error metrics from trace data: error rate by service, error type distribution, error count by endpoint.
6. Build error-aware sampling: always keep traces that contain errors.

```typescript
// Comprehensive error recording
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('order-service');

export async function processOrder(orderId: string): Promise<Order> {
  return tracer.startActiveSpan('order.process', async (span) => {
    span.setAttribute('order.id', orderId);

    try {
      const order = await db.orders.findById(orderId);
      if (!order) {
        // Business error — record as exception with context
        const error = new NotFoundError(`Order ${orderId} not found`);
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.setAttribute('error.type', 'NotFoundError');
        span.setAttribute('error.category', 'business');
        throw error;
      }

      try {
        await paymentService.charge(order);
      } catch (paymentError) {
        // Handled error — using fallback
        span.addEvent('payment.fallback', {
          'error.message': (paymentError as Error).message,
          'fallback.strategy': 'retry-queue',
        });
        await retryQueue.enqueue(order);
        span.setAttribute('order.payment_status', 'queued');
        return { ...order, paymentStatus: 'queued' };
      }

      span.setStatus({ code: SpanStatusCode.OK });
      return order;
    } catch (error) {
      if (!span.isRecording()) return; // Span already ended
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      span.setAttribute('error.type', (error as Error).constructor.name);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

```typescript
// Global error handler that enriches the active span
export function handleUnexpectedError(error: Error, context?: Record<string, string>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.setAttribute('error.unexpected', true);
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        span.setAttribute(`error.context.${key}`, value);
      });
    }
  }
  // Also log for non-trace-aware systems
  console.error('Unexpected error', { error, context, traceId: span?.spanContext().traceId });
}
```

```typescript
// Express error middleware with tracing
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    span.setAttribute('http.status_code', err instanceof HttpError ? err.status : 500);
  }

  const status = err instanceof HttpError ? err.status : 500;
  res.status(status).json({
    error: err.message,
    traceId: span?.spanContext().traceId, // Include in response for client-side correlation
  });
});
```

## Details

**recordException vs setStatus:** Both are needed. `recordException` adds an event with the stack trace and error details. `setStatus(ERROR)` marks the span as failed in the trace viewer. Without `setStatus`, the span appears as successful even though an exception was recorded.

**Exception event attributes** (set automatically by `recordException`):

- `exception.type` — error class name
- `exception.message` — error message
- `exception.stacktrace` — full stack trace

**Error categorization:** Add custom attributes to distinguish error types in dashboards:

```typescript
span.setAttribute('error.category', 'business'); // vs 'infrastructure', 'validation', 'external'
span.setAttribute('error.retryable', true);
span.setAttribute('error.severity', 'critical'); // vs 'warning', 'info'
```

**Trace ID in API responses:** Include the trace ID in error responses so users or support teams can reference it:

```json
{
  "error": "Payment failed",
  "traceId": "abc123def456",
  "message": "Please contact support with this trace ID"
}
```

**Error-based alerting from traces:** Most observability backends support alerts on:

- Error rate exceeding threshold (>1% of traces have ERROR status)
- Specific error types appearing (new `NullPointerException` in production)
- Error count spike detection (anomaly detection on error volume)

## Source

https://opentelemetry.io/docs/specs/semconv/exceptions/exceptions-spans/

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
