# @harness-engineering/types

Shared TypeScript types for harness-engineering packages.

## Installation

```bash
npm install @harness-engineering/types
# or
pnpm add @harness-engineering/types
```

## Usage

```typescript
import { Result, Ok, Err, isOk, isErr } from '@harness-engineering/types';

// Create successful result
const success: Result<number, never> = Ok(42);

// Create error result
const failure: Result<never, string> = Err('Something went wrong');

// Type-safe error handling
function divide(a: number, b: number): Result<number, string> {
  if (b === 0) {
    return Err('Division by zero');
  }
  return Ok(a / b);
}

const result = divide(10, 2);
if (isOk(result)) {
  console.log(result.value); // 5
} else {
  console.error(result.error);
}
```

## API

### `Result<T, E>`

Type-safe error handling used across all harness-engineering APIs.

```typescript
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
```

### `Ok<T>(value: T)`

Creates a successful Result.

### `Err<E>(error: E)`

Creates a failed Result.

### `isOk<T, E>(result: Result<T, E>)`

Type guard to check if Result is Ok.

### `isErr<T, E>(result: Result<T, E>)`

Type guard to check if Result is Err.

## License

MIT
