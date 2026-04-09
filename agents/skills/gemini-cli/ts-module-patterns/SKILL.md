# TypeScript Module Patterns

> Organize TypeScript code with ES modules, barrel exports, path aliases, and declaration files

## When to Use

- Structuring a TypeScript project's import/export architecture
- Setting up barrel files (index.ts re-exports) for clean public APIs
- Configuring path aliases to avoid deep relative imports
- Creating or consuming declaration files (.d.ts)

## Instructions

1. **Use named exports** over default exports for better refactoring and tree-shaking:

```typescript
// user.ts
export interface User {
  id: string;
  name: string;
}
export function createUser(name: string): User {
  /* ... */
}

// consumer.ts
import { User, createUser } from './user';
```

2. **Barrel files** — re-export from `index.ts` to create clean module boundaries:

```typescript
// features/auth/index.ts
export { AuthProvider } from './auth-provider';
export { useAuth } from './use-auth';
export type { AuthState, AuthAction } from './types';

// Consumer imports from the module, not internal files
import { AuthProvider, useAuth } from '@/features/auth';
```

3. **Configure path aliases** in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@/db/*": ["src/db/*"],
      "@/lib/*": ["src/lib/*"]
    }
  }
}
```

Mirror in your bundler config (Next.js, Vite, etc.) so runtime resolution matches TypeScript's.

4. **`export type` for type-only exports** — prevents runtime import of type-only modules:

```typescript
export type { User, Post } from './types';
export { createUser } from './user';
```

5. **`import type` for type-only imports:**

```typescript
import type { User } from './types';
import { createUser } from './user';
```

Enable `verbatimModuleSyntax` in tsconfig to enforce this distinction.

6. **Declaration files (.d.ts)** — provide types for JavaScript modules:

```typescript
// legacy-module.d.ts
declare module 'legacy-module' {
  export function doWork(input: string): number;
  export interface Config {
    verbose: boolean;
  }
}
```

7. **Namespace imports** for modules with many exports:

```typescript
import * as Schema from '@/db/schema';

const user = Schema.users;
const post = Schema.posts;
```

8. **Avoid circular imports** — if module A imports from B and B imports from A:
   - Extract shared types into a separate module C
   - Use `import type` when only types are needed (type imports are erased and do not cause runtime circularity)
   - Restructure to unidirectional dependencies

9. **Package entry points** — configure `exports` in `package.json` for library projects:

```json
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./utils": { "types": "./dist/utils.d.ts", "import": "./dist/utils.js" }
  }
}
```

## Details

TypeScript modules follow the ES module standard. Each file with a top-level `import` or `export` is a module; files without them are scripts (global scope).

**`verbatimModuleSyntax` (recommended):** Forces you to use `import type` for type-only imports and `export type` for type-only re-exports. This eliminates ambiguity about which imports are erased during compilation.

**Barrel file trade-offs:**

- Pros: Clean public API, consumers do not depend on internal file structure
- Cons: Can defeat tree-shaking in some bundlers (import from barrel loads entire module), can create large import chains
- Best practice: Use barrels at feature boundaries, not for every directory

**Path aliases require bundler sync:** TypeScript's `paths` only affect type checking. The runtime module resolver (Node.js, Vite, webpack) must also be configured to resolve the same aliases.

**`moduleResolution` options:**

- `node` — traditional Node.js resolution (index.ts, package.json main)
- `node16` / `nodenext` — Node.js ESM resolution (requires file extensions in imports)
- `bundler` — modern bundler resolution (Vite, webpack, esbuild). Best choice for most frontend projects

**Trade-offs:**

- Barrel files improve DX but can hurt bundle size — profile with your bundler's analysis tool
- Path aliases improve readability but add configuration overhead in every tool that processes imports
- `verbatimModuleSyntax` catches real bugs but requires existing code to be updated with `import type`

## Source

https://typescriptlang.org/docs/handbook/modules.html

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
