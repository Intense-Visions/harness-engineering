# TypeScript Discriminated Unions

> Model mutually exclusive states with discriminated unions and exhaustive narrowing

## When to Use

- Representing states that cannot coexist (loading/success/error, open/closed)
- Replacing boolean flags or optional fields that create invalid state combinations
- Ensuring switch statements handle all possible cases
- Modeling domain events, API responses, or form states

## Instructions

1. **Define a discriminated union** with a shared literal field (discriminant):

```typescript
type Result<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error }
  | { status: 'loading' };
```

2. **Narrow with `switch` or `if` statements** — TypeScript narrows the type automatically:

```typescript
function handleResult<T>(result: Result<T>) {
  switch (result.status) {
    case 'success':
      console.log(result.data); // TypeScript knows data exists here
      break;
    case 'error':
      console.log(result.error); // TypeScript knows error exists here
      break;
    case 'loading':
      console.log('Loading...');
      break;
  }
}
```

3. **Exhaustive checking** with `never` — catch unhandled cases at compile time:

```typescript
function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}

function handleResult<T>(result: Result<T>): string {
  switch (result.status) {
    case 'success':
      return 'OK';
    case 'error':
      return 'FAIL';
    case 'loading':
      return 'WAIT';
    default:
      return assertNever(result);
    // If a new status is added, this line errors at compile time
  }
}
```

4. **Replace boolean flags** with discriminated unions:

```typescript
// Bad: invalid states are possible (isLoading + error both true)
interface State {
  isLoading: boolean;
  data?: User;
  error?: Error;
}

// Good: each state is explicitly defined
type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; data: User }
  | { kind: 'error'; error: Error };
```

5. **Model domain events:**

```typescript
type OrderEvent =
  | { type: 'ORDER_PLACED'; orderId: string; items: Item[] }
  | { type: 'PAYMENT_RECEIVED'; orderId: string; amount: number }
  | { type: 'ORDER_SHIPPED'; orderId: string; trackingNumber: string }
  | { type: 'ORDER_CANCELLED'; orderId: string; reason: string };

function processEvent(event: OrderEvent): void {
  switch (event.type) {
    case 'ORDER_PLACED':
      // event.items is available
      break;
    case 'ORDER_SHIPPED':
      // event.trackingNumber is available
      break;
  }
}
```

6. **Combine with generics:**

```typescript
type ApiResponse<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status: number };

async function fetchUser(): Promise<ApiResponse<User>> {
  // ...
}
```

7. **Discriminate on multiple properties** when one is not enough:

```typescript
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'rectangle'; width: number; height: number }
  | { kind: 'triangle'; base: number; height: number };
```

8. **Use `in` operator for narrowing** when there is no explicit discriminant:

```typescript
type Fish = { swim: () => void };
type Bird = { fly: () => void };

function move(animal: Fish | Bird) {
  if ('swim' in animal) {
    animal.swim(); // Narrowed to Fish
  }
}
```

## Details

A discriminated union (also called a tagged union) is a union of types that share a common property with literal type values. TypeScript uses this property as a discriminant to narrow the type in conditional branches.

**The discriminant property must be:**

- Present on every member of the union
- A literal type (string literal, number literal, boolean literal)
- Unique per member (or at least narrow enough to distinguish)

**Exhaustive checking patterns:**

- `switch` with `default: assertNever(x)` — throws at runtime if an unhandled case is reached
- Assigning to `never` variable: `const _exhaustive: never = x` — compile-time only, no runtime overhead
- TypeScript's `--noUncheckedIndexedAccess` and `strictNullChecks` enhance exhaustiveness checking

**Performance:** Discriminated unions have zero runtime overhead beyond the discriminant property. The narrowing happens entirely at compile time.

**Common naming conventions for discriminants:**

- `kind` — for geometric shapes, node types, abstract syntax trees
- `type` — for events, actions, messages
- `status` — for state machines, API responses
- `tag` — for algebraic data types

**Trade-offs:**

- Discriminated unions make invalid states unrepresentable — but require more type definitions upfront
- Adding a new variant requires updating all switch statements — the exhaustive check catches this at compile time
- Deep nesting of discriminated unions can make type inference slow
- String literal discriminants are not refactoring-friendly — renaming a string literal requires finding all usage sites

## Source

https://typescriptlang.org/docs/handbook/2/narrowing.html
