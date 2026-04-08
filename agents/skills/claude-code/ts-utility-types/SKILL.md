# TypeScript Utility Types

> Apply built-in TypeScript utility types to transform and compose types without redundancy

## When to Use

- You need a variant of an existing type with some properties optional, required, or removed
- You want to derive a type from a function's return value or parameter list without duplicating it
- You need to build a lookup map type from a union of keys
- You want to filter a union type to include or exclude specific members
- You are building form types, API response shapes, or partial update payloads

## Instructions

1. Use `Partial<T>` for optional-update payloads where every field is optional.
2. Use `Required<T>` to make every optional field mandatory (opposite of Partial).
3. Use `Pick<T, K>` to create a type with only the listed keys from T.
4. Use `Omit<T, K>` to create a type with all keys except the listed ones.
5. Use `Record<K, V>` to define a mapping type — prefer over index signatures when keys are known.
6. Use `Exclude<T, U>` to remove union members assignable to U from T.
7. Use `Extract<T, U>` to keep only union members assignable to U.
8. Use `ReturnType<typeof fn>` to derive the return type of a function without manually declaring it.
9. Use `Parameters<typeof fn>` to derive the parameter tuple of a function.
10. Chain utility types when needed: `Partial<Pick<User, 'name' | 'email'>>`.

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'viewer' | 'editor';
  createdAt: Date;
}

// Partial update payload — all fields optional
type UserUpdate = Partial<Omit<User, 'id' | 'createdAt'>>;

// Public profile — only safe fields
type PublicUser = Pick<User, 'id' | 'name' | 'role'>;

// Role lookup map
type RoleConfig = Record<User['role'], { canWrite: boolean; canDelete: boolean }>;

// Exclude admin from public-facing role type
type PublicRole = Exclude<User['role'], 'admin'>; // 'viewer' | 'editor'

// Infer return type without coupling to implementation
async function fetchUser(id: string): Promise<User> {
  /* ... */ return {} as User;
}
type FetchUserResult = Awaited<ReturnType<typeof fetchUser>>; // User

// Infer parameters for wrapping/mocking
type FetchUserParams = Parameters<typeof fetchUser>; // [id: string]
```

## Details

All utility types are implemented as generic conditional or mapped types in TypeScript's standard library (`lib.es5.d.ts`). Understanding their implementation helps you build custom variants when the built-ins don't cover your case.

**Implementation anatomy**

```typescript
// Partial<T> implementation
type Partial<T> = { [P in keyof T]?: T[P] };

// Pick<T, K> implementation
type Pick<T, K extends keyof T> = { [P in K]: T[P] };

// Exclude<T, U> implementation
type Exclude<T, U> = T extends U ? never : T;

// ReturnType<T> implementation
type ReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : any;
```

**`Omit` vs `Exclude`**

`Omit<T, K>` operates on object types and removes properties. `Exclude<T, U>` operates on union types and removes members. They are not interchangeable.

**`Record` vs index signatures**

`Record<string, V>` and `{ [key: string]: V }` are equivalent for most purposes, but `Record<K, V>` with a union K creates a required entry for each union member — the index signature does not.

**Composing utility types**

Utility types compose via nesting. Deep transformations may require recursive types (TypeScript 4.1+) or a custom mapped type. For deeply partial types, the standard library's `Partial` only goes one level deep.

**`NonNullable<T>`**

Removes `null` and `undefined` from a type. Equivalent to `Exclude<T, null | undefined>`. Useful after null-safety guards.

**`ConstructorParameters<T>` and `InstanceType<T>`**

Less common but useful for class-based code: `ConstructorParameters` extracts the constructor's args, `InstanceType` extracts what `new T()` produces.

**When to write custom utilities instead**

When none of the built-ins express your transformation, write a mapped or conditional type. The built-ins are a starting point, not a ceiling.

## Source

https://typescriptlang.org/docs/handbook/utility-types.html
