# OpenTelemetry Custom Instrumentation

> Add custom spans, attributes, and events to business-critical code paths beyond auto-instrumentation

## When to Use

- Auto-instrumentation covers HTTP and database but not your business logic
- Need to trace specific operations: payment processing, recommendation generation, report building
- Adding business context (order ID, user tier, feature flag) to traces
- Wrapping third-party SDK calls that lack OpenTelemetry support

## Instructions

1. Import the API only (`@opentelemetry/api`), not the SDK, in application code. The SDK is initialized in `instrumentation.ts`.
2. Get a tracer once per module: `const tracer = trace.getTracer('module-name')`.
3. Use `tracer.startActiveSpan` for most cases — it sets the span as active context automatically.
4. Add attributes that help debugging: IDs, counts, flags, operation types.
5. Record exceptions with `span.recordException(error)` before setting error status.
6. For utility functions called from many places, create a reusable tracing wrapper.

```typescript
// decorators/traced.ts — reusable tracing wrapper
import { trace, SpanKind, SpanStatusCode, Span } from '@opentelemetry/api';

const tracer = trace.getTracer('app');

export function traced<T extends (...args: any[]) => Promise<any>>(
  name: string,
  fn: T,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
  }
): T {
  return (async (...args: any[]) => {
    return tracer.startActiveSpan(
      name,
      {
        kind: options?.kind ?? SpanKind.INTERNAL,
        attributes: options?.attributes,
      },
      async (span: Span) => {
        try {
          const result = await fn(...args);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }) as T;
}

// Usage
const processPayment = traced('payment.process', async (orderId: string, amount: number) => {
  const span = trace.getActiveSpan();
  span?.setAttribute('payment.order_id', orderId);
  span?.setAttribute('payment.amount', amount);

  const result = await paymentGateway.charge(orderId, amount);

  span?.setAttribute('payment.transaction_id', result.transactionId);
  span?.addEvent('payment.charged', { 'payment.method': result.method });

  return result;
});
```

```typescript
// services/recommendation-service.ts — inline custom spans
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('recommendation-service');

export async function getRecommendations(userId: string, limit: number): Promise<Product[]> {
  return tracer.startActiveSpan('recommendations.generate', async (span) => {
    span.setAttribute('user.id', userId);
    span.setAttribute('recommendations.limit', limit);

    // Step 1: Get user profile
    const profile = await tracer.startActiveSpan(
      'recommendations.loadProfile',
      async (profileSpan) => {
        const result = await userService.getProfile(userId);
        profileSpan.setAttribute('user.segment', result.segment);
        profileSpan.end();
        return result;
      }
    );

    // Step 2: Score candidates
    const scored = await tracer.startActiveSpan('recommendations.score', async (scoreSpan) => {
      const candidates = await productService.getCandidates(profile.segment);
      scoreSpan.setAttribute('candidates.count', candidates.length);
      const results = await mlService.score(candidates, profile);
      scoreSpan.addEvent('scoring.complete', { top_score: results[0]?.score ?? 0 });
      scoreSpan.end();
      return results;
    });

    span.setAttribute('recommendations.returned', Math.min(scored.length, limit));
    span.end();
    return scored.slice(0, limit);
  });
}
```

## Details

**API vs SDK separation:** Application code imports `@opentelemetry/api` (zero-cost no-op if no SDK is registered). The SDK is configured once in `instrumentation.ts`. This means your business code has no dependency on the SDK — if OpenTelemetry is not initialized, spans are silently discarded.

**Getting the active span (without creating a new one):**

```typescript
import { trace } from '@opentelemetry/api';

function enrichSpan(orderId: string) {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttribute('order.id', orderId);
  }
}
```

**Span links:** Connect related traces that are not parent-child (e.g., a batch job processing items from different requests):

```typescript
const span = tracer.startSpan('batch.process', {
  links: items.map((item) => ({
    context: item.spanContext,
    attributes: { 'batch.item_id': item.id },
  })),
});
```

**What to instrument (rule of thumb):**

- Business operations (order creation, payment, fulfillment) — always
- Service boundaries (incoming requests, outgoing calls) — auto-instrumentation handles this
- Significant decision points (feature flag evaluation, A/B test assignment) — as events
- Every function call — never (too much overhead, noisy traces)

## Source

https://opentelemetry.io/docs/languages/js/instrumentation/
