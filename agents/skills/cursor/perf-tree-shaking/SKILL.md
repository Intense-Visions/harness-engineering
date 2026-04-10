# Tree Shaking

> Master tree shaking and dead code elimination — ESM static analysis requirements, sideEffects configuration, barrel file pitfalls, library authoring for tree-shakability, and debugging why unused code survives bundling.

## When to Use

- Bundle includes entire libraries when only a few functions are imported
- Importing from a barrel file (index.ts) pulls in the entire module graph
- Webpack Bundle Analyzer shows large modules where only a fraction is used
- Library consumers report your package is not tree-shakable
- Switching from CommonJS to ESM to enable dead code elimination
- Bundle size grows disproportionately to feature additions
- Lodash, moment.js, or similar utility libraries inflate the bundle
- You need to configure sideEffects in package.json for a library
- TypeScript compilation output uses CommonJS require() instead of ESM import
- Production build includes development-only code paths

## Instructions

1. **Verify ESM output is configured.** Tree shaking requires ES module syntax (import/export). CommonJS (require/module.exports) is opaque to static analysis:

   ```json
   // tsconfig.json — ensure ESM output
   {
     "compilerOptions": {
       "module": "esnext",
       "moduleResolution": "bundler",
       "target": "es2020"
     }
   }
   ```

   ```json
   // package.json — declare ESM for consumers
   {
     "type": "module",
     "main": "./dist/index.cjs",
     "module": "./dist/index.mjs",
     "exports": {
       ".": {
         "import": "./dist/index.mjs",
         "require": "./dist/index.cjs"
       },
       "./utils": {
         "import": "./dist/utils.mjs"
       }
     }
   }
   ```

2. **Configure sideEffects in package.json.** The `sideEffects` field tells bundlers which files are safe to eliminate when their exports are unused:

   ```json
   // package.json — mark the package as side-effect-free
   {
     "sideEffects": false
   }

   // Or specify files that DO have side effects
   {
     "sideEffects": [
       "*.css",
       "./src/polyfills.ts",
       "./src/global-setup.ts"
     ]
   }
   ```

   A side effect is code that executes at import time and affects global state: CSS imports, polyfills, global event listeners, prototype modifications.

3. **Avoid barrel file anti-patterns.** Barrel files (re-export everything from index.ts) defeat tree shaking in many bundler configurations:

   ```typescript
   // BAD: barrel file that re-exports everything
   // src/utils/index.ts
   export { formatDate } from './date';
   export { formatCurrency } from './currency';
   export { heavyParser } from './parser'; // 50KB — included even if unused

   // Importing one function may pull in all three:
   import { formatDate } from './utils';

   // GOOD: import directly from the source module
   import { formatDate } from './utils/date';
   ```

4. **Use named exports over default exports.** Named exports are statically analyzable. Default exports can inhibit tree shaking in some configurations:

   ```typescript
   // Preferred: named exports — each can be independently eliminated
   export function createUser() {
     /* ... */
   }
   export function deleteUser() {
     /* ... */
   }
   export function updateUser() {
     /* ... */
   }

   // Avoid: default export of object — entire object retained
   export default {
     createUser() {
       /* ... */
     },
     deleteUser() {
       /* ... */
     },
     updateUser() {
       /* ... */
     },
   };
   ```

5. **Replace tree-shaking-hostile libraries.** Some libraries ship only CommonJS or use patterns that prevent elimination:

   ```javascript
   // Before: lodash (CommonJS, entire library bundled)
   import { debounce } from 'lodash'; // ~70KB gzipped

   // After: lodash-es (ESM, tree-shakable)
   import { debounce } from 'lodash-es'; // ~1KB gzipped

   // Or: direct path import
   import debounce from 'lodash/debounce'; // ~1KB gzipped

   // Before: moment.js (not tree-shakable, includes all locales)
   import moment from 'moment'; // ~67KB gzipped

   // After: date-fns (ESM, tree-shakable, per-function imports)
   import { format, parseISO } from 'date-fns'; // ~2KB gzipped
   ```

6. **Debug tree shaking failures.** When code survives that should be eliminated:

   ```bash
   # Webpack: analyze why a module is included
   npx webpack --stats-modules-space 999 | grep "module-name"

   # Webpack: check sideEffects optimization
   npx webpack --stats-optimization-bailout

   # Rollup: use the treeshake.moduleSideEffects option
   # rollup.config.js
   export default {
     treeshake: {
       moduleSideEffects: false,  // assume all modules are side-effect-free
     },
   };
   ```

7. **Eliminate dead code paths with define/replace.** Replace environment variables at build time to enable dead code elimination of development-only branches:

   ```javascript
   // webpack.config.js
   const webpack = require('webpack');
   module.exports = {
     plugins: [
       new webpack.DefinePlugin({
         'process.env.NODE_ENV': JSON.stringify('production'),
         __DEV__: false,
       }),
     ],
   };

   // Source code — the `if (__DEV__)` block is eliminated entirely in production
   if (__DEV__) {
     validateProps(props);
     console.log('Debug:', state);
   }
   ```

## Details

### How Tree Shaking Works

Tree shaking is a form of dead code elimination that operates on the ES module graph. The bundler builds a dependency graph from import/export statements, marks which exports are actually used (starting from entry points), and eliminates modules and exports that are never referenced. This works because ESM imports and exports are statically analyzable — they cannot be computed at runtime (unlike CommonJS `require(variable)`).

### The sideEffects Mechanism

Without `"sideEffects": false`, bundlers must assume that importing any module might execute code with observable effects. Even if no exports are used, the module stays in the bundle because removing it might remove a needed side effect. Setting `"sideEffects": false` tells the bundler: "if none of this module's exports are used, the entire module can be safely removed."

### Worked Example: Material UI Import Optimization

Material UI v4 used deep path imports (`@material-ui/core/Button`) because their barrel file re-exported 100+ components, and tree shaking was unreliable across bundler configurations. In v5 (MUI), they restructured with proper `sideEffects` configuration and subpath exports, allowing `import { Button } from '@mui/material'` to tree-shake correctly in webpack 5 and Rollup. This reduced typical bundle sizes by 30-40% compared to v4 barrel imports without deep paths.

### Worked Example: Vercel Commerce

Vercel's commerce starter uses Next.js with SWC compilation, which outputs ESM and enables aggressive tree shaking. Their utility library marks `"sideEffects": false` and uses granular named exports. The result: importing 3 utility functions from a 50-function library adds only 2KB instead of the full 45KB. Combined with Next.js automatic code splitting, the initial page load ships only the JavaScript required for the visible route.

### Anti-Patterns

**Re-exporting CommonJS modules through ESM barrels.** If a barrel file re-exports a CommonJS module, the bundler cannot tree-shake the CommonJS internals. The entire CJS module is included even if only one export is used.

**Class-based APIs with prototype mutation.** Classes with methods added via prototype assignment are side-effectful at the module level. Bundlers cannot safely eliminate unused classes if the class definition mutates prototypes.

**Relying on minifier-only dead code elimination.** Terser/uglify can remove unreachable code (`if (false) { ... }`), but this is not tree shaking. Minifier DCE cannot remove unused module exports or entire unused modules from the graph.

**Importing for type-only usage without `import type`.** In TypeScript, `import { SomeType } from './module'` may cause the bundler to include the module. Use `import type { SomeType } from './module'` to ensure the import is erased at compile time.

## Source

- webpack: Tree Shaking — https://webpack.js.org/guides/tree-shaking/
- Rollup: Tree Shaking — https://rollupjs.org/introduction/#tree-shaking
- MDN: ES Modules — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
- Node.js: Package Exports — https://nodejs.org/api/packages.html#exports

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- All application code uses ESM import/export syntax.
- Package.json includes correct sideEffects configuration.
- No barrel file imports pull in unused modules (verified via bundle analyzer).
- Library dependencies are tree-shakable (ESM with sideEffects declared).
- Production bundle contains no development-only code paths.
