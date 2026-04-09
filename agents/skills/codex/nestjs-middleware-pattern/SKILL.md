# NestJS Middleware Pattern

> Apply NestMiddleware and functional middleware with consumer.forRoutes binding

## When to Use

- You need to run logic for every request before routing (logging, rate limiting, correlation ID injection)
- You are integrating Express middleware (e.g., `helmet`, `compression`, `cors`) into a NestJS app
- You need to apply middleware only to specific routes or HTTP methods
- You need request-level context that guards and interceptors cannot provide because it must run before route matching

## Instructions

1. **Class-based middleware** — implements `NestMiddleware`:

```typescript
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    req['correlationId'] = req.headers['x-correlation-id'] ?? randomUUID();
    res.setHeader('X-Correlation-ID', req['correlationId']);
    next();
  }
}
```

2. **Functional middleware** — plain function (preferred when no DI needed):

```typescript
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  console.log(`${req.method} ${req.url}`);
  next();
}
```

3. **Register in module** via `configure(consumer: MiddlewareConsumer)`:

```typescript
@Module({ controllers: [UsersController] })
export class UsersModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes(UsersController); // apply to entire controller

    consumer.apply(requestLogger).forRoutes({ path: 'users', method: RequestMethod.GET }); // specific method
  }
}
```

4. **Exclude routes:**

```typescript
consumer
  .apply(AuthMiddleware)
  .exclude({ path: 'auth/login', method: RequestMethod.POST })
  .forRoutes(UsersController);
```

5. **Global Express middleware** — apply directly to the Express instance in `main.ts` (no NestJS wiring needed):

```typescript
import helmet from 'helmet';
app.use(helmet());
app.use(compression());
```

6. Chain multiple middleware: `.apply(Middleware1, Middleware2).forRoutes(...)` — they execute in order.

## Details

NestJS middleware is equivalent to Express middleware — it receives `(req, res, next)` and must call `next()` or terminate the response. It runs before any NestJS-specific pipeline elements (guards, interceptors, pipes).

**Middleware vs Guards:** Middleware runs before routing. Guards run after routing with handler/controller metadata available. For authentication, use guards (they have `ExecutionContext`). For infrastructure concerns (logging, tracing, rate limiting), use middleware.

**`forRoutes()` target types:**

- A controller class — applies to all routes in that controller
- A string path — applies to matching URL patterns (supports wildcards)
- A `{ path, method }` object — applies to specific HTTP method + path combinations

**Class vs functional:** Class middleware can inject providers (e.g., `LoggerService`, `ConfigService`) through the constructor. Functional middleware is simpler and slightly faster but cannot use DI. Choose functional when no injection is needed.

**Execution order:** Middleware declared in a module applies only to routes in that module (unless applied globally via `app.use()`). Import order in `AppModule` determines middleware execution order across modules.

**Async middleware:** Both class and functional middleware can be async. Errors thrown (or passed to `next(err)`) propagate to NestJS exception filters.

## Source

https://docs.nestjs.com/middleware

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
