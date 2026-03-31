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

### `UsageRecord`

Extended token usage entry for cost tracking. Composes `TokenUsage` with session metadata, cache token counts, model identifier, and cost in integer microdollars.

```typescript
import type { UsageRecord } from '@harness-engineering/types';
```

### `ModelPricing`

Per-model pricing rates in USD per 1 million tokens. Includes input, output, and optional cache read/write rates.

```typescript
import type { ModelPricing } from '@harness-engineering/types';
```

### `DailyUsage` / `SessionUsage`

Aggregated usage views for daily trends and per-session breakdowns. Used by `harness usage` CLI commands.

## License

MIT
