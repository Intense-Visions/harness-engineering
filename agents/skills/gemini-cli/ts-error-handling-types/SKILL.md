# TypeScript Error Handling Types

> Model and type errors explicitly using Result types, discriminated unions, and typed throws

## When to Use

- Replacing untyped try/catch with explicit error types
- Building APIs that communicate all possible failure modes in the type signature
- Creating a consistent error handling pattern across a codebase
- Distinguishing recoverable errors from fatal exceptions

## Instructions

1. **Define a Result type** for functions that can fail:

```typescript
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
```

2. **Use Result in function signatures:**

```typescript
type ValidationError = { field: string; message: string };

function validateEmail(input: string): Result<string, ValidationError> {
  if (!input.includes('@')) {
    return err({ field: 'email', message: 'Must contain @' });
  }
  return ok(input.toLowerCase().trim());
}

const result = validateEmail(input);
if (result.ok) {
  sendEmail(result.value); // Type: string
} else {
  showError(result.error); // Type: ValidationError
}
```

3. **Typed error hierarchies** with discriminated unions:

```typescript
type AppError =
  | { type: 'NOT_FOUND'; resource: string; id: string }
  | { type: 'VALIDATION'; errors: ValidationError[] }
  | { type: 'UNAUTHORIZED'; reason: string }
  | { type: 'RATE_LIMITED'; retryAfter: number };

function handleError(error: AppError): Response {
  switch (error.type) {
    case 'NOT_FOUND':
      return new Response(`${error.resource} ${error.id} not found`, { status: 404 });
    case 'VALIDATION':
      return Response.json({ errors: error.errors }, { status: 400 });
    case 'UNAUTHORIZED':
      return new Response(error.reason, { status: 401 });
    case 'RATE_LIMITED':
      return new Response('Too many requests', {
        status: 429,
        headers: { 'Retry-After': String(error.retryAfter) },
      });
  }
}
```

4. **Custom error classes** with typed properties:

```typescript
class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(resource: string, id: string): AppError {
    return new AppError(`${resource} ${id} not found`, 'NOT_FOUND', 404);
  }

  static badRequest(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(message, 'BAD_REQUEST', 400, details);
  }
}
```

5. **Type-safe catch blocks:**

```typescript
function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

try {
  await processRequest();
} catch (error: unknown) {
  if (isAppError(error)) {
    return handleAppError(error); // Typed as AppError
  }
  if (error instanceof Error) {
    return handleUnexpectedError(error);
  }
  throw error; // Re-throw unknown errors
}
```

6. **Chain Results** for multi-step operations:

```typescript
function andThen<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

const result = andThen(validateEmail(input), (email) => checkEmailAvailable(email));
```

7. **Async Result pattern:**

```typescript
type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

async function fetchUser(id: string): AsyncResult<User, AppError> {
  try {
    const res = await fetch(`/api/users/${id}`);
    if (!res.ok) return err(AppError.notFound('User', id));
    return ok(await res.json());
  } catch {
    return err(new AppError('Network error', 'NETWORK', 503));
  }
}
```

8. **Use `never` for functions that always throw:**

```typescript
function fail(message: string): never {
  throw new Error(message);
}

function assertDefined<T>(value: T | undefined, name: string): T {
  if (value === undefined) fail(`${name} is required`);
  return value; // TypeScript knows this is T because fail returns never
}
```

## Details

TypeScript does not have a built-in mechanism for typed exceptions. The `catch` block always receives `unknown` (with `useUnknownInCatchVariables`). The Result pattern brings error typing to function signatures, making error handling explicit and exhaustive.

**Result vs try/catch:**

- Result: errors are in the type signature, caller MUST handle them, composable with `andThen`
- try/catch: errors are invisible in the signature, caller can ignore them, convenient for unexpected failures
- Best practice: use Result for expected/recoverable errors (validation, not found, rate limited); use exceptions for unexpected/fatal errors (null reference, OOM)

**`Error` class inheritance:** JavaScript's `instanceof` check works with Error subclasses, but `Error.captureStackTrace` (V8) must be called in the constructor for proper stack traces:

```typescript
class CustomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomError';
    // Fix prototype chain for instanceof checks
    Object.setPrototypeOf(this, CustomError.prototype);
  }
}
```

**Trade-offs:**

- Result types make error handling explicit — but add verbosity to every function signature
- Discriminated union errors are exhaustively checkable — but require updating all handlers when adding new error types
- Custom error classes integrate with try/catch — but lose exhaustiveness checking (any Error could be caught)
- `never` return type enables dead code elimination — but is easy to misuse

## Source

https://typescriptlang.org/docs/handbook/2/narrowing.html

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
