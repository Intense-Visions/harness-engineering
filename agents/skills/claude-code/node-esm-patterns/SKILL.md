# Node.js ESM Patterns

> Write Node.js ES modules correctly using import.meta.url, package.json type, and CJS interop

## When to Use

- Setting up a Node.js project with ES modules
- Converting CommonJS code to ES modules
- Handling `__dirname` and `__filename` equivalents in ESM
- Interoperating between ESM and CommonJS modules

## Instructions

1. **Enable ESM** in `package.json`:

```json
{ "type": "module" }
```

All `.js` files are now ESM. Use `.cjs` extension for CommonJS files.

2. **Replace `__dirname` and `__filename`:**

```typescript
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const configPath = join(__dirname, 'config.json');
```

3. **Dynamic imports:**

```typescript
const { default: chalk } = await import('chalk');

// Conditional imports
const db =
  process.env.DB === 'postgres' ? await import('./db/postgres.js') : await import('./db/sqlite.js');
```

4. **Import JSON** with import assertions:

```typescript
import config from './config.json' with { type: 'json' };
// Or dynamically
const pkg = await import('./package.json', { with: { type: 'json' } });
```

5. **Import CommonJS modules from ESM:**

```typescript
// Default import for CJS modules
import express from 'express';

// Named imports may not work for all CJS modules
// Use default import + destructure instead
import pkg from 'lodash';
const { pick, omit } = pkg;
```

6. **Top-level await:**

```typescript
// Works at module top level in ESM (not in CJS)
const config = await loadConfig();
const db = await connectDatabase(config.dbUrl);

export { db, config };
```

7. **File extensions are required** in imports:

```typescript
// CJS: works without extension
const { foo } = require('./utils');

// ESM: extension required
import { foo } from './utils.js'; // .js even for .ts files with Node16 module resolution
```

8. **Configure TypeScript for ESM:**

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022"
  }
}
```

## Details

ES modules are the standard module system for JavaScript. Node.js supports them natively since v12 (stable since v14). ESM is statically analyzable, supports tree-shaking, and uses `import`/`export` syntax.

**ESM vs CJS differences:**

- ESM: `import`/`export`, static analysis, async loading, strict mode by default
- CJS: `require`/`module.exports`, dynamic, synchronous, non-strict by default
- ESM can import CJS; CJS cannot `require()` ESM (use dynamic `import()` instead)

**`import.meta`:** ESM-only global with module metadata:

- `import.meta.url` — file URL of the current module (`file:///path/to/module.js`)
- `import.meta.resolve()` — resolve a module specifier relative to the current module

**Dual package publishing:** Libraries can support both ESM and CJS consumers:

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    }
  }
}
```

**Trade-offs:**

- ESM enables tree-shaking — but requires file extensions in imports
- Top-level await is convenient — but blocks module loading for all importers
- Static imports enable bundler optimizations — but dynamic imports are needed for conditional loading
- CJS interop mostly works — but named imports from CJS can fail depending on how the CJS module exports

## Source

https://nodejs.org/api/esm.html

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
