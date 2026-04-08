# TypeScript Mapped Types

> Transform object types by iterating over their keys with mapped type syntax

## When to Use

- Creating new types by transforming all properties of an existing type
- Making all properties optional, readonly, or nullable
- Remapping keys to create derived property names
- Building type-safe form state, API response wrappers, or configuration objects

## Instructions

1. **Basic mapped type** — iterate over keys with `in keyof`:

```typescript
type Readonly<T> = {
  readonly [K in keyof T]: T[K];
};

type Optional<T> = {
  [K in keyof T]?: T[K];
};
```

2. **Add or remove modifiers** with `+` and `-`:

```typescript
type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

type Required<T> = {
  [K in keyof T]-?: T[K];
};
```

3. **Transform value types:**

```typescript
type Nullable<T> = {
  [K in keyof T]: T[K] | null;
};

type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

type User = { name: string; age: number };
type UserGetters = Getters<User>;
// { getName: () => string; getAge: () => number }
```

4. **Key remapping with `as`:**

```typescript
type PrefixedKeys<T, P extends string> = {
  [K in keyof T as `${P}${Capitalize<string & K>}`]: T[K];
};

type ApiUser = PrefixedKeys<User, 'user'>;
// { userName: string; userAge: number }
```

5. **Filter keys with `as` and `never`:**

```typescript
type OnlyStrings<T> = {
  [K in keyof T as T[K] extends string ? K : never]: T[K];
};

type StringFields = OnlyStrings<{ name: string; age: number; email: string }>;
// { name: string; email: string }
```

6. **Map over a union of string literals:**

```typescript
type EventHandlers<T extends string> = {
  [K in T as `on${Capitalize<K>}`]: (event: K) => void;
};

type Handlers = EventHandlers<'click' | 'hover' | 'focus'>;
// { onClick: (event: 'click') => void; onHover: ...; onFocus: ... }
```

7. **Combine with conditional types:**

```typescript
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
```

8. **Practical patterns:**

```typescript
// Form state with touched/error tracking
type FormState<T> = {
  values: T;
  touched: { [K in keyof T]: boolean };
  errors: { [K in keyof T]?: string };
};

// Pick and transform
type PickAndNullify<T, K extends keyof T> = {
  [P in K]: T[P] | null;
};
```

## Details

Mapped types iterate over a set of keys (from `keyof T` or a string literal union) and produce a new object type with one property per key. They are the foundation of most built-in utility types (`Partial`, `Required`, `Readonly`, `Pick`, `Record`).

**Homomorphic mapped types:** When the key source is `keyof T`, the mapped type preserves optional and readonly modifiers from the original type. This is why `Partial<T>` works correctly on types that already have optional properties.

**Key remapping (TypeScript 4.1+):** The `as` clause in a mapped type lets you transform key names, filter keys (by mapping to `never`), or create entirely new key sets from the original keys.

**Template literal types + mapped types:** Combining `as \`prefix${K}\`` with mapped types creates patterns like getter/setter generation, event handler typing, and API route typing.

**Recursive mapped types:** TypeScript allows recursive mapped types for deep transformations (`DeepPartial`, `DeepReadonly`). The compiler has a recursion depth limit — extremely deep object nesting can cause issues.

**Trade-offs:**

- Mapped types produce clear, readable type transformations but complex mapped types can be hard to debug
- Key remapping with `as` is powerful but the type error messages when it fails are often cryptic
- Recursive mapped types can slow the compiler on deeply nested structures

## Source

https://typescriptlang.org/docs/handbook/2/mapped-types.html
