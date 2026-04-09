# TypeScript Branded Types

> Prevent mixing semantically distinct primitives using branded opaque types

## When to Use

- Preventing accidental interchange of IDs (UserId vs PostId vs OrderId)
- Distinguishing validated from unvalidated data at the type level
- Creating nominal types in TypeScript's structural type system
- Enforcing that values have passed through a validation boundary

## Instructions

1. **Define a branded type** using intersection with a unique symbol:

```typescript
declare const brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [brand]: B };

type UserId = Brand<string, 'UserId'>;
type PostId = Brand<string, 'PostId'>;
type Email = Brand<string, 'Email'>;
```

2. **Create constructor functions** that validate and brand values:

```typescript
function UserId(id: string): UserId {
  if (!id || id.length === 0) throw new Error('Invalid user ID');
  return id as UserId;
}

function Email(value: string): Email {
  if (!value.includes('@')) throw new Error('Invalid email');
  return value as Email;
}
```

3. **Use branded types in function signatures** to prevent mixing:

```typescript
function getUser(id: UserId): Promise<User> {
  /* ... */
}
function getPost(id: PostId): Promise<Post> {
  /* ... */
}

const userId = UserId('usr_123');
const postId = PostId('post_456');

getUser(userId); // OK
getUser(postId); // Error: PostId not assignable to UserId
getUser('raw'); // Error: string not assignable to UserId
```

4. **Branded types with Zod** for runtime validation:

```typescript
import { z } from 'zod';

const UserIdSchema = z
  .string()
  .min(1)
  .transform((val) => val as UserId);
const EmailSchema = z
  .string()
  .email()
  .transform((val) => val as Email);

const userId = UserIdSchema.parse(input); // Type: UserId
```

5. **Branded numeric types** for units:

```typescript
type Cents = Brand<number, 'Cents'>;
type Dollars = Brand<number, 'Dollars'>;

function toDollars(cents: Cents): Dollars {
  return (cents / 100) as Dollars;
}

function charge(amount: Cents): void {
  /* ... */
}

charge(500 as Cents); // OK — explicit branding
charge(5 as Dollars); // Error — cannot mix units
```

6. **Common brand pattern with helper type:**

```typescript
type Branded<T, B> = T & { __brand: B };

// Shorthand branded types
type Timestamp = Branded<number, 'Timestamp'>;
type Latitude = Branded<number, 'Latitude'>;
type Longitude = Branded<number, 'Longitude'>;
```

7. **Use as return types from validation functions:**

```typescript
type ValidatedInput = Brand<string, 'ValidatedInput'>;

function validateInput(raw: string): ValidatedInput {
  const sanitized = raw.trim().slice(0, 1000);
  if (sanitized.length === 0) throw new Error('Empty input');
  return sanitized as ValidatedInput;
}

function processInput(input: ValidatedInput): void {
  // Caller guarantees input has been validated
}
```

## Details

TypeScript uses structural typing — two types with the same shape are interchangeable. Branded types add a phantom property (never accessed at runtime) that makes structurally identical types incompatible. This simulates nominal typing.

**The brand is invisible at runtime.** The `& { readonly [brand]: B }` intersection exists only at the type level. The runtime value is still a plain string or number. There is zero overhead.

**Validation boundaries:** Branded types are most valuable at system boundaries — API input validation, database ID parsing, configuration loading. Once data is branded, downstream functions can trust it without re-validating.

**`unique symbol` vs string brands:** Using `unique symbol` ensures the brand property cannot collide with real properties. String brands (like `__brand: 'UserId'`) are simpler but theoretically could collide with objects that have a `__brand` property.

**Trade-offs:**

- Branded types add type-level complexity — every consumption site must use the branded type, not the raw primitive
- `as BrandedType` casts bypass validation — only brand values through validated constructor functions
- JSON serialization/deserialization strips brands — re-brand after parsing API responses or database rows
- IDE autocompletion shows the brand property, which can be confusing to developers unfamiliar with the pattern

**When NOT to use branded types:**

- For types that are already structurally distinct (different object shapes)
- When the overhead of wrapping/unwrapping outweighs the safety benefit
- For internal-only values that never cross module boundaries

## Source

https://typescriptlang.org/docs/handbook/2/types-from-types.html

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
