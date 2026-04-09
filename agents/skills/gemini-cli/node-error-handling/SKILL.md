# Node.js Error Handling

> Handle uncaught exceptions, promise rejections, and errors across async Node.js code

## When to Use

- Setting up global error handling for a Node.js application
- Preventing the process from crashing on unhandled errors
- Implementing structured error handling across async code
- Logging and recovering from errors in production

## Instructions

1. **Handle uncaught exceptions** — log and exit:

```typescript
process.on('uncaughtException', (error, origin) => {
  console.error('Uncaught exception:', error);
  console.error('Origin:', origin);
  // Perform synchronous cleanup, then exit
  process.exit(1);
});
```

2. **Handle unhandled promise rejections:**

```typescript
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  // In Node.js 15+, unhandled rejections crash the process by default
});
```

3. **Always catch async errors:**

```typescript
// Express: wrap async handlers
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

app.get(
  '/users',
  asyncHandler(async (req, res) => {
    const users = await getUsers(); // Errors are caught
    res.json(users);
  })
);
```

4. **Custom error classes:**

```typescript
class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} ${id} not found`, 404, 'NOT_FOUND');
  }
}
```

5. **Centralized error handler:**

```typescript
function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  // Unexpected error — log full details, return generic message
  console.error('Unexpected error:', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}

app.use(errorHandler);
```

6. **Operational vs programmer errors:**

```typescript
// Operational: expected, recoverable (invalid input, network timeout)
throw new AppError('Email already exists', 400, 'DUPLICATE_EMAIL', true);

// Programmer: unexpected, should crash (null reference, type error)
// Let these propagate to uncaughtException handler
```

7. **Graceful shutdown on fatal errors:**

```typescript
async function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully`);
  server.close(() => {
    db.$disconnect();
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

8. **Error handling in streams:**

```typescript
import { pipeline } from 'node:stream/promises';

try {
  await pipeline(readable, transform, writable);
} catch (err) {
  // Pipeline handles cleanup of all streams on error
  console.error('Pipeline failed:', err);
}
```

## Details

Node.js error handling spans synchronous throws, async rejections, event emitter errors, and process-level handlers. A comprehensive strategy covers all four.

**Error propagation layers:**

1. `try/catch` — synchronous and `async/await` code
2. `.catch()` — Promise chains
3. `'error'` event — EventEmitter instances (streams, servers)
4. `process.on('uncaughtException')` — last resort for synchronous throws
5. `process.on('unhandledRejection')` — last resort for unhandled promises

**Operational vs programmer errors:**

- Operational: expected failures that the application can handle (validation errors, timeouts, 404s)
- Programmer: bugs in the code (null dereference, wrong arguments, logic errors)
- Operational errors should be caught and handled; programmer errors should crash the process (in production, use a process manager like PM2 to restart)

**Trade-offs:**

- Global error handlers catch everything — but should only log and exit, not attempt recovery
- Custom error classes enable structured handling — but add code for each error type
- Graceful shutdown preserves data integrity — but adds shutdown complexity
- `process.exit(1)` is immediate — but skips cleanup. Use `server.close()` first

## Source

https://nodejs.org/api/process.html#event-uncaughtexception

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
