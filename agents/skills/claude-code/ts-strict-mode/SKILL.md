# TypeScript Strict Mode

> Enable and satisfy strict TypeScript checks including strictNullChecks and exactOptionalPropertyTypes

## When to Use

- Starting a new TypeScript project (always enable strict mode from day one)
- Migrating an existing project to stricter type checking
- Debugging type errors caused by strict flags
- Deciding which individual strict flags to enable during incremental adoption

## Instructions

1. **Enable `strict: true`** in `tsconfig.json` — this activates all strict flags at once:

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

2. **What `strict: true` enables:**
   - `strictNullChecks` — `null` and `undefined` are not assignable to other types
   - `strictFunctionTypes` — function parameter types are checked contravariantly
   - `strictBindCallApply` — `bind`, `call`, `apply` are fully typed
   - `strictPropertyInitialization` — class properties must be initialized
   - `noImplicitAny` — untyped variables/parameters are errors, not `any`
   - `noImplicitThis` — `this` must have a type in function bodies
   - `alwaysStrict` — emits `"use strict"` in every file
   - `useUnknownInCatchVariables` — catch variables are `unknown`, not `any`

3. **Handle `strictNullChecks`** — the most impactful flag. Check for null before accessing:

```typescript
function getUser(id: string): User | null {
  /* ... */
}

const user = getUser('123');
// user.name; // Error: Object is possibly 'null'
if (user) {
  user.name; // OK — narrowed to User
}
```

4. **Handle `noImplicitAny`** — add explicit types where inference fails:

```typescript
// Error: Parameter 'item' implicitly has an 'any' type
function process(item) {
  /* ... */
}

// Fixed
function process(item: unknown) {
  /* ... */
}
```

5. **Handle `strictPropertyInitialization`** — initialize class properties:

```typescript
class Service {
  // Error: Property 'db' has no initializer
  private db: Database;

  // Fix 1: Initialize in constructor
  constructor(db: Database) {
    this.db = db;
  }

  // Fix 2: Definite assignment assertion (use sparingly)
  private db!: Database;
}
```

6. **Handle `useUnknownInCatchVariables`:**

```typescript
try {
  await fetchData();
} catch (error) {
  // error is 'unknown', not 'any'
  if (error instanceof Error) {
    console.log(error.message);
  }
}
```

7. **Additional strict flags beyond `strict: true`:**

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true
  }
}
```

8. **`noUncheckedIndexedAccess`** — index signatures include `undefined`:

```typescript
const map: Record<string, string> = { a: 'hello' };
// Without flag: map['b'] is string
// With flag: map['b'] is string | undefined
```

9. **Incremental strict adoption** — enable flags one at a time:

```json
{
  "compilerOptions": {
    "strict": false,
    "strictNullChecks": true,
    "noImplicitAny": true
  }
}
```

Fix errors per flag before enabling the next.

## Details

Strict mode catches entire categories of bugs at compile time: null dereferences, implicit `any` types, uninitialized properties, and unsafe function calls. The upfront cost of fixing strict errors pays back quickly in reduced runtime bugs.

**`noUncheckedIndexedAccess`** is not included in `strict: true` but is one of the most valuable additional flags. It forces you to handle the case where an array index or object key might not exist, preventing `undefined is not a function` errors.

**`exactOptionalPropertyTypes`** distinguishes between "property is missing" and "property is `undefined`". With this flag, `{ name?: string }` means the property may be absent, but if present it must be a `string` (not `undefined`).

**Strict migration strategy:**

1. Enable `strict: true` and count the errors
2. If manageable (<100), fix them all at once
3. If large (>100), disable `strict` and enable flags individually: `noImplicitAny` first (most errors), then `strictNullChecks`, then the rest
4. Use `// @ts-expect-error` temporarily for errors you cannot fix immediately — track them with a lint rule

**Trade-offs:**

- Strict mode increases type annotation verbosity — but reduces debugging time
- `strictNullChecks` causes the most migration pain — but prevents the most common runtime error (null dereference)
- `noUncheckedIndexedAccess` adds `| undefined` to every index access — use non-null assertion (`!`) or destructuring with defaults for known-safe accesses
- Third-party libraries with loose types can produce cascading strict errors — use declaration merging to fix them locally

## Source

https://typescriptlang.org/tsconfig#strict

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
