# JS Static Import

> Use static import declarations to load ES modules at parse time for tree-shaking and static analysis

## When to Use

- You need to import functions, classes, or constants that are always required at startup
- You want bundlers (webpack, Vite, Rollup) to tree-shake unused exports
- You need static analysis support for IDE auto-imports, type checking, and refactoring

## Instructions

1. Use `import { name } from './module.js'` at the top of the file for all compile-time dependencies.
2. Prefer named exports over default exports — they enable tree-shaking and IDE auto-imports.
3. Group imports: external packages first, then internal modules, then relative paths.
4. Never use `require()` in ESM files — static `import` enables bundler dead-code elimination.

```javascript
// Named exports — tree-shakeable
import { useState, useEffect } from 'react';
import { formatDate, parseDate } from '../utils/date.js';

// Default export — avoid when possible
import MyComponent from './MyComponent.js';
```

5. Use `import * as ns from './module.js'` sparingly — it imports everything and can defeat tree-shaking.

## Details

Static `import` declarations are resolved at parse time, before any code executes. This enables bundlers to analyze the dependency graph and eliminate unused exports (tree-shaking). Static imports are hoisted — they run before the module body regardless of where they appear in the file.

**Trade-offs:**

- Static imports cannot be conditional — they always load, even if the imported value is rarely used
- Circular dependencies between static imports can cause initialization issues (temporal dead zone)
- Large static import trees increase initial bundle size and startup time

**When NOT to use:**

- For heavy libraries used only in rare code paths — use dynamic `import()` instead
- For feature-flagged code that should not be loaded unless the flag is enabled
- For route-specific code in SPAs — use code splitting with dynamic import

## Source

https://patterns.dev/javascript/static-import
