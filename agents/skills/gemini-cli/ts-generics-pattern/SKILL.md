# TypeScript Generics Pattern

> Write reusable, type-safe functions and interfaces using TypeScript generics

## When to Use

- A function, class, or interface should operate on multiple types without losing type information
- You are writing utility functions (identity, map, filter, pipe) that must preserve the caller's type
- You want to express constraints between type parameters (e.g., "K must be a key of T")
- You need to infer a return type from an argument type at the call site
- You are building library or shared code that consumers will use with their own types

## Instructions

1. Declare type parameters immediately after the function name or interface keyword: `function wrap<T>(value: T): T[]`.
2. Apply constraints with `extends` when the body requires a specific shape: `function getKey<T extends { id: string }>(item: T): string`.
3. Use multiple type parameters when you need to relate two types: `function map<T, U>(arr: T[], fn: (item: T) => U): U[]`.
4. Provide defaults for optional type parameters: `interface Response<T = unknown> { data: T; status: number }`.
5. Use `infer` inside conditional types to extract sub-types: `type Awaited<T> = T extends Promise<infer U> ? U : T`.
6. Avoid over-constraining — prefer the narrowest constraint that allows the body to compile.
7. Name type parameters meaningfully: `T` for a single generic, `TKey`/`TValue` for maps, `TResult` for return types.
8. Prefer generic interfaces over function overloads when the shape is consistent across types.

```typescript
// Generic identity — preserves exact type at call site
function identity<T>(value: T): T {
  return value;
}
const n = identity(42); // type: 42 (literal)
const s = identity('hi'); // type: "hi" (literal)

// Constrained generic — body can access .length
function longest<T extends { length: number }>(a: T, b: T): T {
  return a.length >= b.length ? a : b;
}

// Inferring the resolved type of a Promise
type Awaited<T> = T extends Promise<infer U> ? U : T;
type X = Awaited<Promise<string>>; // string

// Generic interface with default
interface ApiResponse<T = unknown> {
  data: T;
  error: string | null;
  timestamp: number;
}

// Relating two type parameters
function mapRecord<K extends string, V, W>(
  record: Record<K, V>,
  fn: (value: V, key: K) => W
): Record<K, W> {
  return Object.fromEntries(
    Object.entries(record).map(([k, v]) => [k, fn(v as V, k as K)])
  ) as Record<K, W>;
}
```

## Details

TypeScript's type system is structural and erased at runtime, but generics exist entirely in the type layer — they impose no runtime cost. The compiler resolves type parameters at each call site through a process called type argument inference, which means callers rarely need to supply explicit type arguments unless inference fails.

**Constraints and the `extends` keyword**

`extends` in a type parameter context means "is assignable to", not class inheritance. `<T extends object>` accepts any non-primitive. `<T extends keyof U>` links two parameters. When you constrain, the body gains access to the constraint's members; when unconstrained, the body can only treat `T` as `unknown`.

**Generic defaults**

Type parameter defaults (`<T = string>`) allow callers to omit the argument. They work like function parameter defaults — the default is used when inference produces `unknown` or the caller omits it explicitly.

**The `infer` keyword**

`infer` appears only inside conditional type clauses (`extends ? T : F`). It introduces a fresh type variable that is bound to whatever matched that position in the extends check. Common uses: `ReturnType<T>`, `Parameters<T>`, `Awaited<T>`, and custom extractors.

**Variance and type safety**

Generic types are covariant in their type parameters by default (not yet formally annotated in TS). This becomes relevant when storing generic values in arrays or returning them from factories — TypeScript widens to the common type unless you keep the parameter in position.

**Anti-patterns to avoid**

- Using `any` inside a generic body to make it compile — defeats the purpose
- Unnecessary explicit type arguments (`identity<string>("hello")` — inference handles this)
- Deep constraint hierarchies that make call-site error messages unreadable
- Overusing generics on simple functions that only ever operate on one type

## Source

https://typescriptlang.org/docs/handbook/2/generics.html
