# TypeScript Config Patterns

> Configure tsconfig with extends, project references, composite builds, and incremental compilation

## When to Use

- Setting up tsconfig.json for a new project
- Organizing shared TypeScript configuration across a monorepo
- Enabling project references for faster builds in multi-package repos
- Troubleshooting TypeScript compilation issues

## Instructions

1. **Minimal modern tsconfig** for a Node.js/Next.js project:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "incremental": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

2. **Extend a shared base config:**

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}

// packages/api/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

3. **Project references** for monorepo builds:

```json
// tsconfig.json (root)
{
  "references": [
    { "path": "packages/shared" },
    { "path": "packages/api" },
    { "path": "packages/web" }
  ],
  "files": []
}

// packages/shared/tsconfig.json
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "outDir": "./dist"
  },
  "include": ["src"]
}

// packages/api/tsconfig.json
{
  "references": [{ "path": "../shared" }],
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist"
  }
}
```

Build with: `tsc --build` (builds referenced projects in dependency order).

4. **Incremental compilation** — cache type check results:

```json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo"
  }
}
```

5. **Separate configs for different concerns:**

```json
// tsconfig.json — IDE and type checking (no emit)
{
  "compilerOptions": { "noEmit": true },
  "include": ["src", "tests"]
}

// tsconfig.build.json — production build (emit, no tests)
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "outDir": "dist" },
  "include": ["src"],
  "exclude": ["**/*.test.ts", "**/*.spec.ts"]
}
```

6. **Key options explained:**
   - `target` — JavaScript version to emit. Use `ES2022` for Node 18+, `ES2021` for broader compat
   - `module` — Module system. `ESNext` for bundler-based projects, `NodeNext` for Node.js packages
   - `moduleResolution` — `bundler` for Vite/webpack/Next.js, `NodeNext` for Node.js libraries
   - `isolatedModules` — required for esbuild/swc transpilation (one file at a time)
   - `skipLibCheck` — skip type checking `.d.ts` files from dependencies. Almost always enable

7. **Configure for testing:**

```json
// vitest needs jsdom types
{
  "compilerOptions": {
    "types": ["vitest/globals"]
  }
}
```

## Details

`tsconfig.json` controls both the TypeScript compiler and the language service (IDE features). Many projects use TypeScript only for type checking (`noEmit: true`) while a bundler (Vite, esbuild, Next.js) handles actual compilation.

**`composite: true` requirements:**

- `declaration: true` must be set
- All input files must be matched by `include` or listed in `files`
- `rootDir` defaults to the directory containing `tsconfig.json`
- Enables `tsc --build` mode for dependency-aware compilation

**`moduleResolution` choices:**

- `bundler` — best for projects using Vite, webpack, esbuild, Next.js. Allows extensionless imports, `index.ts` resolution, and `package.json` exports
- `NodeNext` / `Node16` — for pure Node.js packages. Requires `.js` extensions in imports (even for `.ts` files). Enforces ESM/CJS boundaries
- `node` (legacy) — Node.js CommonJS resolution. Avoid for new projects

**`paths` vs `baseUrl`:** `paths` requires `baseUrl` in older TypeScript versions but since TypeScript 5.0+, `paths` can be relative to the tsconfig directory without `baseUrl`.

**Trade-offs:**

- `skipLibCheck: true` speeds up compilation significantly — but hides type errors in `.d.ts` files from dependencies
- `incremental: true` speeds up subsequent builds — but creates a `.tsbuildinfo` file that should be gitignored
- Project references enable parallel builds — but add complexity to the monorepo configuration
- `isolatedModules` is required for fast transpilers — but prevents `const enum` and namespace merging across files

## Source

https://typescriptlang.org/tsconfig

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
