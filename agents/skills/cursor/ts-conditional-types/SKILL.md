# TypeScript Conditional Types

> Use conditional types, infer, and distributive logic to derive types programmatically

## When to Use

- Deriving a type based on the shape of another type
- Extracting nested types from generics (unwrapping Promises, extracting array elements)
- Building type-level branching logic (if-then-else at the type level)
- Creating utility types that adapt to their input

## Instructions

1. **Basic conditional type** — `T extends U ? TrueType : FalseType`:

```typescript
type IsString<T> = T extends string ? true : false;

type A = IsString<'hello'>; // true
type B = IsString<42>; // false
```

2. **Extract nested types with `infer`:**

```typescript
type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

type A = UnwrapPromise<Promise<string>>; // string
type B = UnwrapPromise<number>; // number

type ArrayElement<T> = T extends (infer E)[] ? E : never;

type C = ArrayElement<string[]>; // string
```

3. **Recursive unwrapping:**

```typescript
type DeepUnwrap<T> = T extends Promise<infer U> ? DeepUnwrap<U> : T;

type A = DeepUnwrap<Promise<Promise<string>>>; // string
```

4. **Function type extraction:**

```typescript
type Parameters<T> = T extends (...args: infer P) => any ? P : never;
type ReturnType<T> = T extends (...args: any) => infer R ? R : never;

type Params = Parameters<(a: string, b: number) => void>; // [string, number]
```

5. **Distributive conditional types** — when `T` is a union, the condition distributes over each member:

```typescript
type NonNullable<T> = T extends null | undefined ? never : T;

type A = NonNullable<string | null | undefined>; // string
// Distributes as: (string extends null ? never : string) | (null extends null ? never : null) | ...
```

6. **Prevent distribution** by wrapping in a tuple:

```typescript
type IsUnion<T> = [T] extends [T] ? false : true; // Does not distribute
```

7. **Constrain `infer` with `extends`:**

```typescript
type FirstString<T> = T extends [infer F extends string, ...any[]] ? F : never;

type A = FirstString<['hello', 42]>; // 'hello'
type B = FirstString<[42, 'hello']>; // never
```

8. **Combine with mapped types for powerful transformations:**

```typescript
type OptionalByKey<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type User = { id: string; name: string; email: string };
type CreateUser = OptionalByKey<User, 'id'>; // id is optional, rest required
```

9. **Chain conditional types** for multi-branch logic:

```typescript
type TypeName<T> = T extends string
  ? 'string'
  : T extends number
    ? 'number'
    : T extends boolean
      ? 'boolean'
      : T extends Function
        ? 'function'
        : 'object';
```

## Details

Conditional types are TypeScript's mechanism for type-level computation. They enable types that depend on other types, analogous to ternary expressions at the value level.

**Distribution behavior:** When a conditional type is applied to a naked type parameter that is a union, it distributes — the condition is applied to each union member separately, and the results form a new union. This is usually desirable but can be surprising.

**`infer` keyword:** Only valid inside the `extends` clause of a conditional type. It declares a type variable that TypeScript infers from the structure being matched. You can use multiple `infer` keywords in one condition.

**`never` in conditionals:** A conditional branch that returns `never` removes that member from a union (since `T | never = T`). This is the mechanism behind `Exclude`, `Extract`, and `NonNullable`.

**Recursive conditional types:** TypeScript supports recursive conditional types (up to a depth limit). Use them for deep unwrapping, recursive object transformation, or path-based type extraction.

**Trade-offs:**

- Conditional types make the type system Turing-complete — but deeply nested conditionals slow down the compiler
- Distributive behavior is implicit and can produce unexpected results with union inputs
- `infer` can only capture types at specific structural positions — it cannot pattern-match arbitrary nested types

**Common mistakes:**

- Forgetting that `T extends U` checks assignability, not equality — `string extends string | number` is `true`
- Not accounting for `never` input — `never extends anything` distributes to `never` (empty union)
- Using `infer` outside of a conditional type's extends clause — it is not a standalone keyword

## Source

https://typescriptlang.org/docs/handbook/2/conditional-types.html

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
