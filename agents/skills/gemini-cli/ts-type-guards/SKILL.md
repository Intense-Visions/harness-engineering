# TypeScript Type Guards

> Narrow union types safely using type guards, assertion functions, and control flow

## When to Use

- Narrowing union types to access type-specific properties
- Validating unknown data from APIs or user input
- Replacing unsafe type assertions (`as`) with safe runtime checks
- Creating reusable narrowing functions for domain types

## Instructions

1. **`typeof` guard** for primitives:

```typescript
function format(value: string | number): string {
  if (typeof value === 'string') {
    return value.toUpperCase(); // Narrowed to string
  }
  return value.toFixed(2); // Narrowed to number
}
```

2. **`instanceof` guard** for class instances:

```typescript
function handleError(error: Error | string): string {
  if (error instanceof Error) {
    return error.message; // Narrowed to Error
  }
  return error; // Narrowed to string
}
```

3. **Custom type guard** with `is` predicate:

```typescript
interface Cat {
  meow(): void;
}
interface Dog {
  bark(): void;
}

function isCat(animal: Cat | Dog): animal is Cat {
  return 'meow' in animal;
}

function interact(animal: Cat | Dog) {
  if (isCat(animal)) {
    animal.meow(); // Narrowed to Cat
  } else {
    animal.bark(); // Narrowed to Dog
  }
}
```

4. **Narrowing with `in` operator:**

```typescript
type ApiResponse = { status: 'success'; data: User } | { status: 'error'; message: string };

function handle(response: ApiResponse) {
  if ('data' in response) {
    console.log(response.data); // Narrowed to success variant
  }
}
```

5. **Assertion function** — narrows or throws:

```typescript
function assertDefined<T>(value: T | null | undefined, name: string): asserts value is T {
  if (value == null) {
    throw new Error(`Expected ${name} to be defined`);
  }
}

function process(user: User | null) {
  assertDefined(user, 'user');
  // user is narrowed to User after this line
  console.log(user.name);
}
```

6. **Narrow `unknown` values** safely:

```typescript
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUser(value: unknown): value is User {
  return isRecord(value) && typeof value.id === 'string' && typeof value.email === 'string';
}
```

7. **Array filtering with type guards:**

```typescript
const items: (string | null)[] = ['a', null, 'b', null, 'c'];

// Without type guard: (string | null)[]
const filtered = items.filter((x) => x !== null);

// With type guard: string[]
const filtered = items.filter((x): x is string => x !== null);
```

8. **Discriminated union narrowing:**

```typescript
type Shape = { kind: 'circle'; radius: number } | { kind: 'rect'; width: number; height: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return Math.PI * shape.radius ** 2;
    case 'rect':
      return shape.width * shape.height;
  }
}
```

## Details

Type guards are runtime checks that TypeScript uses to narrow types in subsequent code. They bridge the gap between TypeScript's static type system and JavaScript's dynamic runtime.

**Control flow analysis:** TypeScript tracks type narrowing through `if/else`, `switch`, `return`, `throw`, and assignment. After a type guard condition, the type is narrowed in the true branch and the complement is narrowed in the else branch.

**`is` predicates vs boolean returns:** A function returning `boolean` does not narrow types at the call site. A function returning `x is Type` does. The `is` predicate is a promise to the compiler — if you return `true`, the value IS that type.

**Assertion functions** (`asserts x is T`) narrow the type AFTER the function call returns. If the assertion fails, the function must throw. This is useful for precondition checks at the top of functions.

**`asserts` vs `is`:**

- `is` — used in conditions (`if`, `filter`). Returns boolean.
- `asserts` — used as a statement. Throws on failure. Narrows for subsequent code.

**Truthiness narrowing:** TypeScript narrows `if (value)` to exclude `null`, `undefined`, `0`, `''`, and `false`. This is convenient but can exclude valid falsy values — use explicit `!= null` when `0` or `''` are valid.

**Trade-offs:**

- Custom type guards with `is` put the burden of correctness on the developer — an incorrect guard silently misnarrows
- `instanceof` does not work across iframes, realms, or serialized objects
- Assertion functions cannot be used in expression position — they must be standalone statements
- Deep narrowing of nested objects requires multiple guard calls or a comprehensive validation library like Zod

## Source

https://typescriptlang.org/docs/handbook/2/narrowing.html
