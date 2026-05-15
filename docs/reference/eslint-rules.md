# ESLint Rules Reference

Complete reference for all rules provided by `@harness-engineering/eslint-plugin`. The plugin ships 12 rules across 5 categories, enforcing architecture, boundary, documentation, performance, and cross-platform constraints at lint time.

## Quick Start

```js
// eslint.config.js
import harness from '@harness-engineering/eslint-plugin';

export default [harness.configs.recommended];
```

The `recommended` config enables architecture rules as errors and all others as warnings. The `strict` config promotes every rule to error severity.

## Configuration

### Preset Configs

| Config        | Architecture Rules | Other Rules |
| ------------- | ------------------ | ----------- |
| `recommended` | `error`            | `warn`      |
| `strict`      | `error`            | `error`     |

### Custom Rule Configuration

Override individual rules in your flat config:

```js
// eslint.config.js
import harness from '@harness-engineering/eslint-plugin';

export default [
  harness.configs.recommended,
  {
    rules: {
      // Promote boundary schema to error
      '@harness-engineering/require-boundary-schema': 'error',
      // Disable doc exports in test files
      '@harness-engineering/enforce-doc-exports': 'off',
    },
  },
];
```

### Project Configuration

Several rules read from `harness.config.json` in your project root. See the [Configuration Reference](./configuration.md) for the full schema.

```json
{
  "version": 1,
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "domain", "pattern": "src/domain/**", "allowedDependencies": ["types"] },
    {
      "name": "services",
      "pattern": "src/services/**",
      "allowedDependencies": ["types", "domain"]
    },
    {
      "name": "api",
      "pattern": "src/api/**",
      "allowedDependencies": ["types", "domain", "services"]
    }
  ],
  "forbiddenImports": [
    { "from": "src/services/**", "disallow": ["react"], "message": "Services cannot import React" }
  ],
  "boundaries": {
    "requireSchema": ["src/api/**/*.ts"]
  }
}
```

## Inline Suppression

Suppress a rule on a single line or block using standard ESLint comments. Include a reason after `--`:

```ts
// eslint-disable-next-line @harness-engineering/no-hardcoded-path-separator -- platform-safe URL pattern
const apiPath = '/api/v1/';

/* eslint-disable @harness-engineering/no-sync-io-in-async -- startup init, not hot path */
const config = fs.readFileSync('config.json', 'utf-8');
/* eslint-enable @harness-engineering/no-sync-io-in-async */
```

---

## Architecture Rules

### `no-layer-violation`

Enforces layer boundary imports. Files in one layer can only import from layers listed in their `allowedDependencies`.

| Property             | Value                                   |
| -------------------- | --------------------------------------- |
| **Category**         | Architecture                            |
| **Default severity** | `error`                                 |
| **Requires config**  | Yes (`layers` in `harness.config.json`) |
| **Fixable**          | No                                      |
| **Options**          | None                                    |

**What it detects:** A relative import that crosses from one layer to another layer not listed in the importing layer's `allowedDependencies`.

**Violation:**

```ts
// File: src/domain/user.ts (domain layer)
// domain layer only allows imports from "types"
import { UserService } from '../services/user-service'; // ERROR: Layer "domain" cannot import from layer "services"
```

**Correct:**

```ts
// File: src/domain/user.ts (domain layer)
import { UserId } from '../types/user'; // OK: "types" is in allowedDependencies
```

**No-op when:** No `layers` array in config, or the file does not match any layer pattern.

---

### `no-circular-deps`

Detects circular import dependencies by building an import graph across the lint run and checking for cycles via DFS.

| Property             | Value        |
| -------------------- | ------------ |
| **Category**         | Architecture |
| **Default severity** | `error`      |
| **Requires config**  | No           |
| **Fixable**          | No           |
| **Options**          | None         |

**What it detects:** A relative import that creates a cycle in the import graph (A imports B imports C imports A).

**Violation:**

```ts
// File: src/a.ts
import { b } from './b';

// File: src/b.ts
import { a } from './a'; // ERROR: Circular dependency detected: a → b → a
```

**Correct:**

```ts
// File: src/a.ts
import { b } from './b';

// File: src/b.ts
import { SharedType } from './types'; // No cycle — depends on a shared module instead
```

---

### `no-forbidden-imports`

Blocks imports that match configurable forbidden patterns. Rules are scoped by source file glob, so you can restrict specific modules to specific parts of the codebase.

| Property             | Value                                             |
| -------------------- | ------------------------------------------------- |
| **Category**         | Architecture                                      |
| **Default severity** | `error`                                           |
| **Requires config**  | Yes (`forbiddenImports` in `harness.config.json`) |
| **Fixable**          | No                                                |
| **Options**          | None                                              |

**Configuration:** Each entry in `forbiddenImports` specifies:

- `from` -- glob pattern matching source files the rule applies to
- `disallow` -- array of import specifiers or glob patterns to block
- `message` -- optional custom error message

**Violation:**

```ts
// File: src/services/payment.ts
// Config: { from: "src/services/**", disallow: ["react"], message: "Services cannot import React" }
import React from 'react'; // ERROR: Services cannot import React
```

**Correct:**

```ts
// File: src/ui/payment-form.tsx
// UI layer is not restricted from importing React
import React from 'react'; // OK
```

**No-op when:** No `forbiddenImports` array in config, or no rules match the current file.

---

## Boundary Rules

### `require-boundary-schema`

Requires Zod schema validation in exported functions at API boundaries. Ensures that all public-facing entry points validate their inputs.

| Property             | Value                                                     |
| -------------------- | --------------------------------------------------------- |
| **Category**         | Boundary                                                  |
| **Default severity** | `warn` (recommended), `error` (strict)                    |
| **Requires config**  | Yes (`boundaries.requireSchema` in `harness.config.json`) |
| **Fixable**          | No                                                        |
| **Options**          | None                                                      |

**What it detects:** An `export function` in a boundary file that does not contain a Zod `.parse()` or `.safeParse()` call in its body.

**Violation:**

```ts
// File: src/api/users.ts (matches boundaries.requireSchema pattern)
export function createUser(data: unknown) {
  // ERROR: Exported function "createUser" at API boundary must validate input with Zod schema
  return db.users.create(data);
}
```

**Correct:**

```ts
// File: src/api/users.ts
import { z } from 'zod';

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

export function createUser(data: unknown) {
  const validated = CreateUserSchema.parse(data); // Zod validation present
  return db.users.create(validated);
}
```

**No-op when:** No `boundaries.requireSchema` array in config, or the file does not match any boundary pattern.

---

## Documentation Rules

### `enforce-doc-exports`

Requires JSDoc comments on all public exports (functions, classes, variables, types, interfaces).

| Property             | Value                                  |
| -------------------- | -------------------------------------- |
| **Category**         | Documentation                          |
| **Default severity** | `warn` (recommended), `error` (strict) |
| **Requires config**  | No                                     |
| **Fixable**          | No                                     |
| **Options**          | See below                              |

**Options:**

```js
'@harness-engineering/enforce-doc-exports': ['warn', {
  ignoreTypes: false,     // Set to true to skip type aliases and interfaces
  ignoreInternal: true,   // Set to false to require docs on @internal exports
}]
```

| Option           | Type      | Default | Description                          |
| ---------------- | --------- | ------- | ------------------------------------ |
| `ignoreTypes`    | `boolean` | `false` | Skip `type` and `interface` exports  |
| `ignoreInternal` | `boolean` | `true`  | Skip exports marked with `@internal` |

**Violation:**

```ts
export function calculateTotal(items: Item[]): number {
  // ERROR: Exported function "calculateTotal" is missing JSDoc documentation
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

**Correct:**

```ts
/** Calculates the total price for an array of line items. */
export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

---

## Performance Rules

### `no-nested-loops-in-critical`

Disallows nested loops inside functions annotated with `@perf-critical`. Nested loops imply O(n^2) or worse complexity, which is unacceptable in hot paths.

| Property             | Value                                  |
| -------------------- | -------------------------------------- |
| **Category**         | Performance                            |
| **Default severity** | `warn` (recommended), `error` (strict) |
| **Requires config**  | No                                     |
| **Fixable**          | No                                     |
| **Options**          | None                                   |

**What it detects:** Any loop (`for`, `for...in`, `for...of`, `while`, `do...while`) nested inside another loop within a `@perf-critical` function.

**Violation:**

```ts
// @perf-critical
function findDuplicates(items: string[]): string[] {
  const dupes: string[] = [];
  for (const a of items) {
    for (const b of items) {
      // ERROR: Nested loop in @perf-critical code
      if (a === b) dupes.push(a);
    }
  }
  return dupes;
}
```

**Correct:**

```ts
// @perf-critical
function findDuplicates(items: string[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const item of items) {
    if (seen.has(item)) dupes.push(item);
    else seen.add(item);
  }
  return dupes;
}
```

**No-op when:** The file contains no `@perf-critical` annotation.

---

### `no-sync-io-in-async`

Disallows synchronous `fs` operations (`readFileSync`, `writeFileSync`, `existsSync`, etc.) inside `async` functions. Sync I/O blocks the event loop, defeating the purpose of async execution.

| Property             | Value                                  |
| -------------------- | -------------------------------------- |
| **Category**         | Performance                            |
| **Default severity** | `warn` (recommended), `error` (strict) |
| **Requires config**  | No                                     |
| **Fixable**          | No                                     |
| **Options**          | None                                   |

**Detected methods:** `readFileSync`, `writeFileSync`, `existsSync`, `readdirSync`, `statSync`, `mkdirSync`, `unlinkSync`, `copyFileSync`, `renameSync`, `accessSync`

**Violation:**

```ts
async function loadConfig(path: string) {
  const data = fs.readFileSync(path, 'utf-8'); // ERROR: Use async fs methods instead of 'readFileSync'
  return JSON.parse(data);
}
```

**Correct:**

```ts
async function loadConfig(path: string) {
  const data = await fs.promises.readFile(path, 'utf-8');
  return JSON.parse(data);
}
```

---

### `no-unbounded-array-chains`

Disallows 3 or more chained array methods (`filter`, `map`, `reduce`, `sort`, `flatMap`, `find`, `some`, `every`, `forEach`). Long chains create multiple intermediate arrays and iterate the data multiple times.

| Property             | Value                                  |
| -------------------- | -------------------------------------- |
| **Category**         | Performance                            |
| **Default severity** | `warn` (recommended), `error` (strict) |
| **Requires config**  | No                                     |
| **Fixable**          | No                                     |
| **Options**          | None                                   |

**Violation:**

```ts
const result = items
  .filter((item) => item.active)
  .map((item) => item.value)
  .sort((a, b) => a - b); // ERROR: 3+ chained array operations
```

**Correct:**

```ts
// Single-pass approach
const result: number[] = [];
for (const item of items) {
  if (item.active) result.push(item.value);
}
result.sort((a, b) => a - b);
```

---

## Cross-Platform Rules

### `no-unix-shell-command`

Disallows `exec()` and `execSync()` calls that contain Unix-specific shell commands (`rm`, `cp`, `mv`, `mkdir`, `chmod`, `chown`). These commands fail on Windows.

| Property             | Value                                  |
| -------------------- | -------------------------------------- |
| **Category**         | Cross-Platform                         |
| **Default severity** | `warn` (recommended), `error` (strict) |
| **Requires config**  | No                                     |
| **Fixable**          | No                                     |
| **Options**          | None                                   |

**What it detects:** String arguments to `exec()` or `execSync()` containing Unix commands, including full-path variants like `/bin/rm` or `/usr/bin/cp`. Does not flag `execFile` or `execFileSync`.

**Violation:**

```ts
import { execSync } from 'child_process';

execSync('rm -rf dist/'); // ERROR: Avoid Unix-specific shell commands
execSync('cp -r src/ build/'); // ERROR
```

**Correct:**

```ts
import fs from 'fs';

fs.rmSync('dist', { recursive: true, force: true });
fs.cpSync('src', 'build', { recursive: true });
```

---

### `no-hardcoded-path-separator`

Disallows hardcoded Unix path separators (`/dir/`) in `path.*` method calls, `fs.*` method calls, and string comparison methods. Forward-slash paths break on Windows when used with `path.join()`, `fs.readFile()`, or `string.includes()`.

| Property             | Value                                  |
| -------------------- | -------------------------------------- |
| **Category**         | Cross-Platform                         |
| **Default severity** | `warn` (recommended), `error` (strict) |
| **Requires config**  | No                                     |
| **Fixable**          | No                                     |
| **Options**          | None                                   |

**What it detects:** String literals containing `/word/` patterns used as arguments to `path.join()`, `path.resolve()`, `fs.readFileSync()`, `str.includes()`, and similar methods. Ignores URLs (`http://`, `https://`), import/require statements, and strings outside flagged contexts.

**Violation:**

```ts
import path from 'path';

const file = path.join(root, '/src/utils/'); // ERROR: Avoid hardcoded Unix path separators
const exists = filePath.includes('/dist/'); // ERROR
```

**Correct:**

```ts
import path from 'path';

const file = path.join(root, 'src', 'utils');
const exists = filePath.includes(`${path.sep}dist${path.sep}`);
```

---

### `require-path-normalization`

Requires that `path.relative()` results are normalized with `.replaceAll('\\', '/')` (or equivalent `.replace()`) for cross-platform safety. On Windows, `path.relative()` returns backslash-separated paths that silently mismatch forward-slash conventions used elsewhere.

| Property             | Value                                  |
| -------------------- | -------------------------------------- |
| **Category**         | Cross-Platform                         |
| **Default severity** | `warn` (recommended), `error` (strict) |
| **Requires config**  | No                                     |
| **Fixable**          | No                                     |
| **Options**          | None                                   |

**Violation:**

```ts
import path from 'path';

const rel = path.relative(root, file); // ERROR: path.relative() result must be normalized
```

**Correct:**

```ts
import path from 'path';

const rel = path.relative(root, file).replaceAll('\\', '/');
```

---

## Security Rules

### `no-process-env-in-spawn`

Disallows passing `process.env` directly to `spawn`, `execFile`, `fork`, and their sync variants. When `process.env` is forwarded to a child process, every environment variable -- including API keys, database credentials, and secrets -- is inherited by that child. Instead, build an explicit env object containing only the variables the child process actually needs.

| Property             | Value                                   |
| -------------------- | --------------------------------------- |
| **Category**         | Security                                |
| **Default severity** | `error` (recommended), `error` (strict) |
| **Requires config**  | No                                      |
| **Fixable**          | No                                      |
| **Options**          | None                                    |

**Affected functions:** `spawn`, `spawnSync`, `execFile`, `execFileSync`, `fork` (bare identifiers and `child_process.*` member expressions).

**What it detects:** An options argument to a spawn-family function that sets `env: process.env`, or spreads `process.env` via `{ ...process.env }` inside the options object.

**Violation:**

```ts
import { spawn } from 'child_process';

spawn('node', ['script.js'], { env: process.env }); // ERROR: Do not pass process.env directly to 'spawn'
```

Spread pattern is also caught:

```ts
spawn('node', ['script.js'], { ...process.env }); // ERROR
```

**Correct:**

```ts
import { spawn } from 'child_process';

spawn('node', ['script.js'], {
  env: {
    PATH: process.env.PATH,
    NODE_ENV: process.env.NODE_ENV,
  },
});
```

---

## Rule Summary

| Rule                          | Category       | Default | Config Required |
| ----------------------------- | -------------- | ------- | --------------- |
| `no-layer-violation`          | Architecture   | `error` | Yes             |
| `no-circular-deps`            | Architecture   | `error` | No              |
| `no-forbidden-imports`        | Architecture   | `error` | Yes             |
| `require-boundary-schema`     | Boundary       | `warn`  | Yes             |
| `enforce-doc-exports`         | Documentation  | `warn`  | No              |
| `no-nested-loops-in-critical` | Performance    | `warn`  | No              |
| `no-sync-io-in-async`         | Performance    | `warn`  | No              |
| `no-unbounded-array-chains`   | Performance    | `warn`  | No              |
| `no-unix-shell-command`       | Cross-Platform | `warn`  | No              |
| `no-hardcoded-path-separator` | Cross-Platform | `warn`  | No              |
| `require-path-normalization`  | Cross-Platform | `warn`  | No              |
| `no-process-env-in-spawn`     | Security       | `error` | No              |

**Note:** The `recommended` config enables all 12 rules. Performance rules (`no-nested-loops-in-critical`, `no-sync-io-in-async`, `no-unbounded-array-chains`) are set to `warn` severity. To customize severity:

```js
'@harness-engineering/no-nested-loops-in-critical': 'warn',
'@harness-engineering/no-sync-io-in-async': 'warn',
'@harness-engineering/no-unbounded-array-chains': 'warn',
```

---

_Last Updated: 2026-04-18_
