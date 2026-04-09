# React Static Import

> Bundle all dependencies at build time for predictable loading performance

## When to Use

- The imported module is needed immediately on component mount
- The module is small or used everywhere in the app (no benefit to splitting)
- You want tree-shaking to eliminate unused exports (only works with static imports)
- Importing types, constants, utilities, or always-needed components

## Instructions

1. Use ES module static `import` syntax at the top of the file.
2. Import only what you need — named imports enable tree-shaking.
3. Avoid barrel files (`index.ts` re-exporting everything) when tree-shaking matters.
4. Group imports: external libraries first, then internal modules, then relative imports.

```typescript
// Good: named import, tree-shakeable
import { formatDate } from 'date-fns';

// Good: specific internal module
import { Button } from '@/components/Button';

// Avoid for large libraries when only one function is needed
import _ from 'lodash'; // pulls entire lodash into bundle
import { debounce } from 'lodash'; // only debounce
```

## Details

Static imports are resolved at build time by the bundler (Webpack, Vite, esbuild). The bundler builds a dependency graph and includes all statically imported modules in the bundle.

**Tree-shaking:** Dead code elimination — if you import a named export but never use it, the bundler can eliminate it (with `sideEffects: false` in package.json and named imports). Side-effecting imports (CSS, polyfills) should not be tree-shaken.

**When to switch to dynamic import:**

- The module is only needed after a user interaction
- The module is large and not needed on the initial route
- You want to reduce initial bundle size

## Source

https://patterns.dev/react/static-import

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
