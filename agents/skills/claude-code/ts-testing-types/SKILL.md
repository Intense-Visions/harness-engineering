# TypeScript Testing Types

> Test TypeScript types at compile time using expect-type, tsd, and vitest type matchers

## When to Use

- Verifying that utility types produce the expected output types
- Testing that generic functions infer types correctly
- Ensuring library public APIs maintain correct type signatures
- Catching type regressions in CI without runtime tests

## Instructions

1. **Use `expectTypeOf` from vitest** (built-in, no extra dependencies):

```typescript
import { expectTypeOf, test } from 'vitest';

test('User type has correct shape', () => {
  expectTypeOf<User>().toMatchTypeOf<{
    id: string;
    name: string;
    email: string;
  }>();
});
```

2. **Test function return types:**

```typescript
test('createUser returns User', () => {
  expectTypeOf(createUser).returns.toMatchTypeOf<User>();
  expectTypeOf(createUser).parameters.toEqualTypeOf<[name: string, email: string]>();
});
```

3. **Test generic inference:**

```typescript
test('identity preserves literal types', () => {
  const result = identity('hello');
  expectTypeOf(result).toEqualTypeOf<'hello'>();
});
```

4. **Verify types are NOT assignable:**

```typescript
test('UserId and PostId are not interchangeable', () => {
  expectTypeOf<UserId>().not.toEqualTypeOf<PostId>();
  expectTypeOf<UserId>().not.toMatchTypeOf<PostId>();
});
```

5. **Use `expect-type` library** for standalone type tests:

```typescript
import { expectTypeOf } from 'expect-type';

// In a .test-d.ts file or regular test file
expectTypeOf<Pick<User, 'id' | 'name'>>().toEqualTypeOf<{
  id: string;
  name: string;
}>();

expectTypeOf<Partial<User>>().toMatchTypeOf<{ id?: string }>();
```

6. **Use `tsd`** for declaration file testing:

```typescript
// test-d.ts
import { expectType, expectError } from 'tsd';
import { createUser } from './index';

expectType<User>(createUser('Alice', 'alice@test.com'));
expectError(createUser(123)); // Should fail with number input
```

Run with `npx tsd` in package.json.

7. **Test conditional types:**

```typescript
test('UnwrapPromise extracts inner type', () => {
  expectTypeOf<UnwrapPromise<Promise<string>>>().toEqualTypeOf<string>();
  expectTypeOf<UnwrapPromise<Promise<Promise<number>>>>().toEqualTypeOf<number>();
  expectTypeOf<UnwrapPromise<string>>().toEqualTypeOf<string>();
});
```

8. **Test mapped types:**

```typescript
test('Nullable adds null to all properties', () => {
  type Input = { name: string; age: number };
  type Expected = { name: string | null; age: number | null };
  expectTypeOf<Nullable<Input>>().toEqualTypeOf<Expected>();
});
```

9. **Compile-time only assertions** (no runtime, no test runner):

```typescript
// types.test.ts — checked by tsc, not executed
type Assert<T extends true> = T;
type IsEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type _test1 = Assert<IsEqual<ReturnType<typeof getUser>, Promise<User>>>;
type _test2 = Assert<IsEqual<Parameters<typeof createUser>, [string, string]>>;
```

## Details

Type tests verify that your type-level code (generics, utility types, conditional types) produces the expected types. They catch regressions that runtime tests cannot — a function might work correctly at runtime but accept the wrong types due to an overly permissive generic.

**`toEqualTypeOf` vs `toMatchTypeOf`:**

- `toEqualTypeOf` — exact match. `{ a: string }` does NOT equal `{ a: string; b?: number }`
- `toMatchTypeOf` — structural compatibility. `{ a: string; b: number }` MATCHES `{ a: string }`

**Tool comparison:**

- **Vitest `expectTypeOf`** — integrated into vitest, runs alongside runtime tests, best for projects already using vitest
- **`expect-type`** — standalone library, works with any test runner, same API as vitest's built-in
- **`tsd`** — designed for library authors testing .d.ts files, uses a different assertion API

**When to test types:**

- Utility types that transform other types (DeepPartial, NonNullable variants)
- Generic functions with complex inference
- Public API surfaces of libraries
- Discriminated union handlers (ensure exhaustiveness)

**When NOT to test types:**

- Simple type annotations (TypeScript already checks these)
- One-off types used in a single file
- Types that mirror a runtime test's assertions

**Trade-offs:**

- Type tests add maintenance overhead — but catch regressions that runtime tests miss
- `expectTypeOf` assertions run at compile time, not runtime — test files must be type-checked by tsc
- Complex type assertions can produce cryptic error messages
- Type tests do not verify runtime behavior — always pair with runtime tests for critical paths

## Source

https://typescriptlang.org/docs/handbook/2/types-from-types.html
