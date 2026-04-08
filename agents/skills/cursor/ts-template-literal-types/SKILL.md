# TypeScript Template Literal Types

> Construct precise string types using template literal syntax and string manipulation types

## When to Use

- Creating type-safe string patterns (event names, CSS values, API routes)
- Generating getter/setter method names from property names
- Building type-safe routing or event systems
- Manipulating string literal types with Capitalize, Uppercase, Lowercase

## Instructions

1. **Basic template literal type:**

```typescript
type EventName = `on${Capitalize<'click' | 'hover' | 'focus'>}`;
// 'onClick' | 'onHover' | 'onFocus'
```

2. **Combine with union types** — distributes across all combinations:

```typescript
type Color = 'red' | 'blue' | 'green';
type Size = 'sm' | 'md' | 'lg';
type ClassName = `${Color}-${Size}`;
// 'red-sm' | 'red-md' | 'red-lg' | 'blue-sm' | 'blue-md' | ...
```

3. **Type-safe event emitters:**

```typescript
type Events = {
  click: { x: number; y: number };
  change: { value: string };
  submit: { data: FormData };
};

type OnEvent = `on${Capitalize<keyof Events>}`;
// 'onClick' | 'onChange' | 'onSubmit'
```

4. **String manipulation utility types:**

```typescript
type Upper = Uppercase<'hello'>; // 'HELLO'
type Lower = Lowercase<'HELLO'>; // 'hello'
type Cap = Capitalize<'hello'>; // 'Hello'
type Uncap = Uncapitalize<'Hello'>; // 'hello'
```

5. **Generate property names from a type:**

```typescript
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

type Setters<T> = {
  [K in keyof T as `set${Capitalize<string & K>}`]: (value: T[K]) => void;
};

type UserAccessors = Getters<{ name: string; age: number }>;
// { getName: () => string; getAge: () => number }
```

6. **Pattern matching with `infer`:**

```typescript
type ExtractRouteParams<T extends string> = T extends `${string}:${infer Param}/${infer Rest}`
  ? Param | ExtractRouteParams<`/${Rest}`>
  : T extends `${string}:${infer Param}`
    ? Param
    : never;

type Params = ExtractRouteParams<'/users/:userId/posts/:postId'>;
// 'userId' | 'postId'
```

7. **Type-safe CSS values:**

```typescript
type CSSUnit = 'px' | 'em' | 'rem' | '%' | 'vh' | 'vw';
type CSSLength = `${number}${CSSUnit}`;

function setWidth(width: CSSLength): void {
  /* ... */
}

setWidth('100px'); // OK
setWidth('2.5rem'); // OK
setWidth('100'); // Error: not assignable to CSSLength
```

8. **Dot-notation path types:**

```typescript
type DotPath<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends object ? DotPath<T[K], `${Prefix}${K}.`> : `${Prefix}${K}`;
}[keyof T & string];

type Paths = DotPath<{ user: { name: string; address: { city: string } } }>;
// 'user.name' | 'user.address.city'
```

## Details

Template literal types (TypeScript 4.1+) allow string types to be composed from other string literals, unions, and type-level transformations. They are the string equivalent of mapped types — they generate new types by iterating over string combinations.

**Distribution:** When a template literal contains union types, it produces the Cartesian product. `\`${A | B}-${C | D}\``produces`'A-C' | 'A-D' | 'B-C' | 'B-D'`.

**Intrinsic string manipulation types:** `Uppercase<S>`, `Lowercase<S>`, `Capitalize<S>`, `Uncapitalize<S>` are built-in compiler intrinsics — they work on any string literal type.

**Pattern matching:** Template literal types with `infer` can extract parts of string types. This enables parsing route parameters, CSS values, and other structured strings at the type level.

**Performance considerations:**

- Large Cartesian products slow the compiler. `\`${100 values}-${100 values}\`` creates 10,000 types
- Recursive template literal types have a depth limit. Keep recursion shallow
- Avoid template literals in hot type positions (deeply nested generics)

**Trade-offs:**

- Precise string typing catches typos at compile time — but generates verbose union types in IDE tooltips
- Route parameter extraction is elegant — but error messages when a route does not match are cryptic
- Template literals distribute over unions automatically — this is powerful but can produce unexpectedly large types

## Source

https://typescriptlang.org/docs/handbook/2/template-literal-types.html
