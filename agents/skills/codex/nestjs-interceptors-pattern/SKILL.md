# NestJS Interceptors Pattern

> Transform responses and add cross-cutting behavior with NestInterceptor and CallHandler

## When to Use

- You need to transform every response from a controller into a consistent envelope format
- You need to log execution time for every route without touching each handler
- You need to add a response-level timeout that cancels slow database queries
- You need to cache responses or add response headers based on handler metadata

## Instructions

1. Implement `NestInterceptor<T, R>` and the `intercept(context, next)` method which returns an `Observable`:

```typescript
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, { data: T }> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<{ data: T }> {
    return next.handle().pipe(map((value) => ({ data: value })));
  }
}
```

2. Apply with `@UseInterceptors(TransformInterceptor)` at class or method level, or globally:

```typescript
// Global — in main.ts (no DI)
app.useGlobalInterceptors(new TransformInterceptor());

// Global — with DI (preferred)
providers: [{ provide: APP_INTERCEPTOR, useClass: TransformInterceptor }];
```

3. **Logging interceptor** — measure execution time:

```typescript
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    return next.handle().pipe(tap(() => console.log(`${Date.now() - start}ms`)));
  }
}
```

4. **Timeout interceptor** — cancel after N milliseconds:

```typescript
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(_: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(timeout(5000));
  }
}
```

5. **Exception mapping** — transform errors in the stream:

```typescript
return next
  .handle()
  .pipe(catchError((err) => throwError(() => new BadGatewayException(err.message))));
```

6. Code that runs BEFORE `next.handle()` is pre-handler logic. Code in the RxJS pipe AFTER `next.handle()` is post-handler logic.

## Details

Interceptors are executed in the NestJS lifecycle after guards and before pipes. They wrap the handler call using RxJS Observables, which is what makes both pre- and post-execution logic possible from a single point.

**RxJS operators to know:**

- `map(fn)` — transform the response value
- `tap(fn)` — side-effect without transforming (logging, metrics)
- `timeout(ms)` — throw `TimeoutError` if the observable does not emit in time
- `catchError(fn)` — handle errors in the response stream
- `mergeMap` / `switchMap` — flatten async operations

**Interceptors vs Middleware:** Middleware runs before routing. Interceptors wrap the entire route handler and its result. Use interceptors when you need to inspect or transform the handler's return value.

**Interceptors vs Filters:** Exception filters catch thrown errors. Interceptors can intercept errors via `catchError` in the RxJS stream, but exception filters are the canonical place for error shaping. Use interceptors for response transformation, not error handling.

**Order of execution:** When multiple interceptors are applied, they execute in order (outermost wraps innermost), similar to middleware. `@UseInterceptors(A, B)` means A's pre-logic, then B's pre-logic, then handler, then B's post-logic, then A's post-logic.

**Serialization:** NestJS ships `ClassSerializerInterceptor` which runs `class-transformer`'s `instanceToPlain` on every response, respecting `@Exclude()` and `@Expose()` decorators on entity classes.

## Source

https://docs.nestjs.com/interceptors

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
