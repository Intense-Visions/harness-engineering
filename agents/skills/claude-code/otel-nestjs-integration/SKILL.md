# OpenTelemetry NestJS Integration

> Integrate OpenTelemetry with NestJS using interceptors, decorators, and module-based configuration

## When to Use

- Adding distributed tracing to a NestJS application
- Tracing controller methods, service calls, and guards automatically
- Creating a tracing interceptor that wraps all NestJS handlers
- Integrating with NestJS dependency injection for tracer access

## Instructions

1. Load OpenTelemetry instrumentation before NestJS bootstraps — create `instrumentation.ts` and load it via `--require`.
2. The `@opentelemetry/instrumentation-nestjs-core` auto-instrumentation creates spans for controllers and handlers automatically.
3. Create a custom `TracingInterceptor` to add business-specific attributes to handler spans.
4. Inject the `Tracer` via a custom provider for manual instrumentation in services.
5. Use `@opentelemetry/instrumentation-http` for incoming/outgoing HTTP spans — it works with NestJS's underlying Express/Fastify.

```typescript
// instrumentation.ts — loaded with --require before NestJS
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({ [ATTR_SERVICE_NAME]: 'nest-api' }),
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [getNodeAutoInstrumentations(), new NestInstrumentation()],
});

sdk.start();
```

```typescript
// tracing/tracing.module.ts — provide tracer via DI
import { Module, Global } from '@nestjs/common';
import { trace, Tracer } from '@opentelemetry/api';

const TRACER_TOKEN = 'OTEL_TRACER';

@Global()
@Module({
  providers: [
    {
      provide: TRACER_TOKEN,
      useFactory: (): Tracer => trace.getTracer('nest-api', '1.0.0'),
    },
  ],
  exports: [TRACER_TOKEN],
})
export class TracingModule {}

export { TRACER_TOKEN };
```

```typescript
// tracing/tracing.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Tracer, SpanStatusCode, trace } from '@opentelemetry/api';
import { TRACER_TOKEN } from './tracing.module';

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  constructor(@Inject(TRACER_TOKEN) private readonly tracer: Tracer) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const handler = context.getHandler().name;
    const controller = context.getClass().name;

    const span = trace.getActiveSpan();
    if (span) {
      span.setAttribute('nestjs.controller', controller);
      span.setAttribute('nestjs.handler', handler);
      span.setAttribute('http.route', request.route?.path ?? request.url);
      if (request.user?.id) {
        span.setAttribute('user.id', request.user.id);
      }
    }

    return next.handle().pipe(
      tap({
        error: (error) => {
          if (span) {
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          }
        },
      })
    );
  }
}
```

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TracingModule } from './tracing/tracing.module';
import { TracingInterceptor } from './tracing/tracing.interceptor';

@Module({
  imports: [TracingModule],
  providers: [{ provide: APP_INTERCEPTOR, useClass: TracingInterceptor }],
})
export class AppModule {}
```

## Details

**What NestInstrumentation provides:** It creates spans for NestJS-specific operations: pipe execution, guard execution, interceptor execution, and handler execution. This gives visibility into the NestJS middleware pipeline.

**Manual tracing in services:**

```typescript
@Injectable()
export class OrderService {
  constructor(@Inject(TRACER_TOKEN) private readonly tracer: Tracer) {}

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    return this.tracer.startActiveSpan('OrderService.createOrder', async (span) => {
      try {
        span.setAttribute('order.items_count', dto.items.length);
        const order = await this.orderRepo.save(dto);
        span.setAttribute('order.id', order.id);
        return order;
      } finally {
        span.end();
      }
    });
  }
}
```

**NestJS + Fastify:** The HTTP instrumentation works with both Express and Fastify adapters. No additional configuration needed.

**Exception filters:** NestJS exception filters run after interceptors. Add trace context to custom exception filters:

```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost) {
    const span = trace.getActiveSpan();
    span?.recordException(exception);
    span?.setStatus({ code: SpanStatusCode.ERROR });
    // ... handle response
  }
}
```

## Source

https://opentelemetry.io/docs/languages/js/libraries/#nestjs

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
