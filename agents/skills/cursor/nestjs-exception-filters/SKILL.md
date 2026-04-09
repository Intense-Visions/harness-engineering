# NestJS Exception Filters

> Handle errors globally with @Catch, ExceptionFilter, and custom exception hierarchies

## When to Use

- You need a consistent error response format across all routes (e.g., `{ error, message, statusCode, timestamp }`)
- You need to handle third-party library errors (Prisma errors, TypeORM errors) and map them to HTTP exceptions
- You want to log errors with context (request URL, user ID) before sending the response
- You are building a custom exception class hierarchy for domain errors

## Instructions

1. **Custom exception class:**

```typescript
export class ResourceNotFoundException extends HttpException {
  constructor(resource: string, id: string) {
    super({ error: 'NOT_FOUND', message: `${resource} ${id} not found` }, HttpStatus.NOT_FOUND);
  }
}
```

2. **Global exception filter:**

```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    this.logger.error(exception, { url: request.url, method: request.method });

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

3. **Catch specific exceptions only:**

```typescript
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter { ... }

@Catch(PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: PrismaClientKnownRequestError, host: ArgumentsHost) {
    if (exception.code === 'P2002') {
      // unique constraint violation
    }
    if (exception.code === 'P2025') {
      // record not found
    }
  }
}
```

4. **Register globally** (DI-aware):

```typescript
providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }];
```

Or without DI: `app.useGlobalFilters(new AllExceptionsFilter())`.

5. Multiple filters execute in reverse registration order — the last registered filter catches first.

## Details

Exception filters are the final layer of the NestJS request pipeline. They catch exceptions that were not caught by interceptors or handlers and convert them to HTTP responses.

**`@Catch()` with no arguments** catches ALL exceptions including non-HTTP ones (uncaught database errors, third-party SDK failures). This is useful as a safety net but should log the error and return a generic 500.

**`@Catch(HttpException)` specifically** only intercepts NestJS HTTP exceptions, leaving non-HTTP exceptions to bubble up to the next filter (or the runtime).

**Prisma error codes:**

- `P2002` — Unique constraint violation → `ConflictException`
- `P2025` — Record not found → `NotFoundException`
- `P2003` — Foreign key constraint failure → `BadRequestException`

**Exception hierarchy design:** Build a `DomainException extends HttpException` base, then specific exceptions like `InsufficientInventoryException extends DomainException`. The filter only needs to handle `DomainException` and extract the structured payload.

**WebSocket and microservice contexts:** `ArgumentsHost` is transport-agnostic. Use `host.getType()` to check whether the request is HTTP, WS, or RPC before calling `switchToHttp()`.

## Source

https://docs.nestjs.com/exception-filters

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
