# TypeScript Declaration Merging

> Extend existing types, modules, and namespaces via declaration merging and augmentation

## When to Use

- Adding custom properties to third-party library types (Express `Request`, Next.js `Metadata`)
- Extending `Window`, `ProcessEnv`, or other global interfaces
- Adding type definitions for untyped JavaScript modules
- Patching type declarations for libraries with incomplete types

## Instructions

1. **Interface merging** — declare the same interface name to add properties:

```typescript
interface User {
  id: string;
  name: string;
}

// Later, in another file or declaration
interface User {
  email: string;
}

// Merged: { id: string; name: string; email: string }
```

2. **Module augmentation** — extend types from installed packages:

```typescript
// types/express.d.ts
import 'express';

declare module 'express' {
  interface Request {
    userId?: string;
    tenantId?: string;
  }
}
```

Now `req.userId` is available in all Express route handlers.

3. **Global augmentation** — extend built-in globals:

```typescript
// types/global.d.ts
declare global {
  interface Window {
    analytics: AnalyticsClient;
  }

  namespace NodeJS {
    interface ProcessEnv {
      DATABASE_URL: string;
      API_KEY: string;
      NODE_ENV: 'development' | 'production' | 'test';
    }
  }
}

export {}; // Required to make this a module
```

4. **Declare types for untyped modules:**

```typescript
// types/untyped-lib.d.ts
declare module 'untyped-lib' {
  export function doSomething(input: string): number;
  export interface Config {
    verbose: boolean;
  }
}
```

5. **Wildcard module declarations** for non-code imports:

```typescript
// types/assets.d.ts
declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '*.css' {
  const classes: Record<string, string>;
  export default classes;
}
```

6. **Extend enums** (namespace merging):

```typescript
enum Color {
  Red = 'red',
  Blue = 'blue',
}

namespace Color {
  export function fromHex(hex: string): Color {
    // ...
  }
}

Color.fromHex('#ff0000'); // Works
```

7. **Type-safe environment variables** with declaration merging:

```typescript
// env.d.ts
declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL: string;
    REDIS_URL: string;
    PORT: string;
  }
}
```

8. **Include declaration files** in tsconfig:

```json
{
  "compilerOptions": {
    "typeRoots": ["./node_modules/@types", "./types"]
  },
  "include": ["src", "types"]
}
```

## Details

Declaration merging is TypeScript's mechanism for combining multiple declarations of the same entity into a single definition. It enables extending types without modifying source code.

**What merges:**

- Interfaces with interfaces — properties are combined. Conflicting property types cause errors
- Namespaces with namespaces — exported members are combined
- Namespaces with classes, functions, or enums — namespace members become static properties
- Enums with namespaces — adds methods to enums

**What does NOT merge:**

- Type aliases (`type X = ...`) — redeclaring causes an error
- Classes with classes — cannot merge two class declarations

**Module augmentation requirements:**

- Must be in a file that is a module (has at least one `import` or `export`)
- The `declare module 'name'` must match the module specifier exactly
- You can only add new declarations or merge interfaces — you cannot override existing types

**Global augmentation requirements:**

- Wrap in `declare global { }` when in a module file
- Add `export {}` at the bottom if the file has no other imports/exports

**Trade-offs:**

- Declaration merging is powerful but can be hard to trace — "where did this property come from?" becomes difficult
- Module augmentations apply globally once included — they affect all files in the project
- Conflicting augmentations from different sources cause type errors that are hard to diagnose
- Over-augmenting library types can hide actual API changes during upgrades

## Source

https://typescriptlang.org/docs/handbook/declaration-merging.html

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
