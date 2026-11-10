# ESLint Rules Reference

Complete reference for all rules provided by `@harness-engineering/eslint-plugin`. The plugin ships 21 rules across 8 categories, enforcing architecture, boundary, documentation, performance, cross-platform, security, test-hygiene, and type-safety constraints at lint time.

## Quick Start

```js
// eslint.config.js
import harness from '@harness-engineering/eslint-plugin';

export default [harness.configs.recommended];
```

The `recommended` config enables 18 rules: the architecture, security, and test-hygiene rules it includes (plus `no-spread-in-variadic`) as errors and the rest as warnings. The `strict` config enables 17 rules, all as errors. Three rules (`no-empty-describe`, `no-process-exit`, `no-undefined-optional-assignment`) are in neither preset and must be enabled explicitly. See the [Rule Summary](#rule-summary) for the per-rule breakdown.

## Configuration

### Preset Configs

| Config        | Rules enabled | Severity                                                                                                                                       |
| ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `recommended` | 18            | `error` for architecture rules, `no-process-env-in-spawn`, `no-spread-in-variadic`, and the test-hygiene rules it enables; `warn` for the rest |
| `strict`      | 17            | `error` for every rule it enables (`no-hardcoded-test-count` is not included)                                                                  |

Neither preset enables `no-empty-describe`, `no-process-exit`, or `no-undefined-optional-assignment`.

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

**Source:** [`no-layer-violation.ts`](../../packages/eslint-plugin/src/rules/no-layer-violation.ts)

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

**Source:** [`no-circular-deps.ts`](../../packages/eslint-plugin/src/rules/no-circular-deps.ts)

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

**Source:** [`no-forbidden-imports.ts`](../../packages/eslint-plugin/src/rules/no-forbidden-imports.ts)

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

**Source:** [`require-boundary-schema.ts`](../../packages/eslint-plugin/src/rules/require-boundary-schema.ts)

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

**Source:** [`enforce-doc-exports.ts`](../../packages/eslint-plugin/src/rules/enforce-doc-exports.ts)

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

**Source:** [`no-nested-loops-in-critical.ts`](../../packages/eslint-plugin/src/rules/no-nested-loops-in-critical.ts)

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

**Source:** [`no-sync-io-in-async.ts`](../../packages/eslint-plugin/src/rules/no-sync-io-in-async.ts)

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

**Source:** [`no-unbounded-array-chains.ts`](../../packages/eslint-plugin/src/rules/no-unbounded-array-chains.ts)

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

### `no-spread-in-variadic`

Disallows spreading an array into `Math.min` / `Math.max`. Spreading pushes every element onto the call stack as a separate argument, so a large array (~65k+ elements on V8) throws `RangeError: Maximum call stack size exceeded` — an input-dependent runtime crash the type checker cannot catch.

| Property             | Value       |
| -------------------- | ----------- |
| **Category**         | Performance |
| **Default severity** | `error`     |
| **Requires config**  | No          |
| **Fixable**          | No          |
| **Options**          | None        |

**Source:** [`no-spread-in-variadic.ts`](../../packages/eslint-plugin/src/rules/no-spread-in-variadic.ts)

**What it detects:** A `CallExpression` whose callee is the non-computed member `Math.min` or `Math.max` and whose arguments include a spread element (`...`).

**Violation:**

```ts
const peak = Math.max(...values); // ERROR: throws on large arrays
```

**Safe alternative:**

```ts
const peak = values.reduce((a, b) => Math.max(a, b), -Infinity); // bounded, no stack blowup
```

Not flagged: plain arguments (`Math.min(a, b)`), other Math methods (`Math.floor(...xs)`), array/object spread (`[...arr]`, `{ ...obj }`), or spread into a non-`Math` callee (`f(...args)`).

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

**Source:** [`no-unix-shell-command.ts`](../../packages/eslint-plugin/src/rules/no-unix-shell-command.ts)

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

**Source:** [`no-hardcoded-path-separator.ts`](../../packages/eslint-plugin/src/rules/no-hardcoded-path-separator.ts)

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

**Source:** [`require-path-normalization.ts`](../../packages/eslint-plugin/src/rules/require-path-normalization.ts)

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

### `prefer-execfile-over-exec`

Prefers `execFile` / `execFileSync` with an argument array over `exec` / `execSync` with a string command. The string form spawns a shell, which is an injection surface and mishandles exit codes when the command uses shell operators such as `&&` or `>`.

| Property             | Value                                  |
| -------------------- | -------------------------------------- |
| **Category**         | Cross-Platform                         |
| **Default severity** | `warn` (recommended), `error` (strict) |
| **Requires config**  | No                                     |
| **Fixable**          | No                                     |
| **Options**          | None                                   |

**Source:** [`prefer-execfile-over-exec.ts`](../../packages/eslint-plugin/src/rules/prefer-execfile-over-exec.ts)

**What it detects:** A call to `exec` or `execSync` whose first argument is a string literal or template literal. Bare `exec(...)` / `execSync(...)` calls are flagged, as is any member call to `.execSync(...)`. A member call to `.exec(...)` is flagged only when the object is `child_process`, `childProcess`, `cp`, or `child`, so `RegExp.prototype.exec` calls such as `myRegex.exec(input)` are not reported. Calls whose first argument is a variable (`execSync(buildCommand)`) are not flagged.

**Violation:**

```ts
import { exec, execSync } from 'child_process';

exec('rm -rf dist', callback); // ERROR: Prefer execFile/execFileSync with an argument array
execSync('tsc && cp a b'); // ERROR
```

**Correct:**

```ts
import { execFile, execFileSync } from 'child_process';

execFile('git', ['status'], callback);
execFileSync('rm', ['-rf', 'dist']);
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

**Source:** [`no-process-env-in-spawn.ts`](../../packages/eslint-plugin/src/rules/no-process-env-in-spawn.ts)

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

---

### `no-process-exit`

Disallows direct `process.exit()` calls, which terminate the process immediately and bypass graceful shutdown, so pending async cleanup never runs.

| Property             | Value                                          |
| -------------------- | ---------------------------------------------- |
| **Category**         | Security                                       |
| **Default severity** | Off (not enabled by `recommended` or `strict`) |
| **Requires config**  | No                                             |
| **Fixable**          | No                                             |
| **Options**          | None                                           |

**Source:** [`no-process-exit.ts`](../../packages/eslint-plugin/src/rules/no-process-exit.ts)

**What it detects:** A call whose callee is the member expression `process.exit`, with or without an exit code. `foo.exit()`, `bar.process.exit()`, a bare `exit(1)`, and non-call accesses such as `process.env` are not flagged.

**Enable it explicitly:**

```js
'@harness-engineering/no-process-exit': 'error',
```

**Violation:**

```ts
process.exit(1); // ERROR: Direct process.exit() call — use graceful shutdown instead
```

**Correct:**

```ts
process.exitCode = 1; // let the event loop drain and pending cleanup finish
```

---

## Test Hygiene Rules

These rules target test files. They are registered for every file the config applies to, so scope them to your test globs if your non-test code uses identifiers such as `describe`, `it`, or `test`.

### `no-focused-tests`

Disallows focused tests, which must not be committed. A focused test or block mutes every other test in the file, so the suite reports green while most of it never ran.

| Property             | Value                                   |
| -------------------- | --------------------------------------- |
| **Category**         | Test Hygiene                            |
| **Default severity** | `error` (recommended), `error` (strict) |
| **Requires config**  | No                                      |
| **Fixable**          | No                                      |
| **Options**          | None                                    |

**Source:** [`no-focused-tests.ts`](../../packages/eslint-plugin/src/rules/no-focused-tests.ts)

**What it detects:** Any dotted call chain rooted at `describe`, `it`, or `test` that ends in `.only` — the flat Jest/Mocha spellings (`describe.only`, `it.only`, `test.only`) and Playwright's namespaced ones (`test.describe.only`, `test.describe.serial.only`) — plus the `fdescribe()` and `fit()` prefixes.

**Violation:**

```ts
it.only('creates a user', () => {}); // ERROR: Focused test — remove '.only'/'f' prefix before committing
fdescribe('users', () => {}); // ERROR
```

**Correct:**

```ts
it('creates a user', () => {});
describe('users', () => {});
```

---

### `no-skipped-tests`

Disallows skipped tests, which must not be committed. A skipped test never runs and silently drops coverage.

| Property             | Value                                   |
| -------------------- | --------------------------------------- |
| **Category**         | Test Hygiene                            |
| **Default severity** | `error` (recommended), `error` (strict) |
| **Requires config**  | No                                      |
| **Fixable**          | No                                      |
| **Options**          | None                                    |

**Source:** [`no-skipped-tests.ts`](../../packages/eslint-plugin/src/rules/no-skipped-tests.ts)

**What it detects:** Any dotted call chain rooted at `describe`, `it`, or `test` that ends in `.skip` (including Playwright's `test.describe.skip` and `test.describe.serial.skip`), plus the `xdescribe()`, `xit()`, and `xtest()` prefixes. It matches exactly the same calls as [`no-disabled-tests`](#no-disabled-tests); the two differ only in their message id, so enabling both reports each skipped call twice.

**Violation:**

```ts
it.skip('handles retries', () => {}); // ERROR: Skipped test — it never runs and silently drops coverage
xdescribe('retries', () => {}); // ERROR
```

**Correct:**

```ts
it('handles retries', () => {}); // re-enable it, or delete it
```

---

### `no-disabled-tests`

Disallows disabled tests, which must not be committed. A disabled test never runs and silently drops coverage.

| Property             | Value                                   |
| -------------------- | --------------------------------------- |
| **Category**         | Test Hygiene                            |
| **Default severity** | `error` (recommended), `error` (strict) |
| **Requires config**  | No                                      |
| **Fixable**          | No                                      |
| **Options**          | None                                    |

**Source:** [`no-disabled-tests.ts`](../../packages/eslint-plugin/src/rules/no-disabled-tests.ts)

**What it detects:** The same calls as [`no-skipped-tests`](#no-skipped-tests): any `describe` / `it` / `test` chain ending in `.skip`, plus `xdescribe()`, `xit()`, and `xtest()`.

**Violation:**

```ts
test.describe.skip('checkout', () => {}); // ERROR: Disabled test — it never runs and silently drops coverage
xit('applies a coupon', () => {}); // ERROR
```

**Correct:**

```ts
test.describe('checkout', () => {});
it('applies a coupon', () => {});
```

---

### `no-empty-describe`

Disallows `describe` blocks whose callback body contains no statements.

| Property             | Value                                          |
| -------------------- | ---------------------------------------------- |
| **Category**         | Test Hygiene                                   |
| **Default severity** | Off (not enabled by `recommended` or `strict`) |
| **Requires config**  | No                                             |
| **Fixable**          | No                                             |
| **Options**          | None                                           |

**Source:** [`no-empty-describe.ts`](../../packages/eslint-plugin/src/rules/no-empty-describe.ts)

**What it detects:** A call to the bare identifier `describe` whose second argument is an arrow function or function expression with an empty block body. Any statement in the body (not only a test) makes it valid, and `describe` calls without a callback are ignored. Member forms such as `test.describe(...)` are not checked.

**Enable it explicitly:**

```js
'@harness-engineering/no-empty-describe': 'error',
```

**Violation:**

```ts
describe('suite', () => {}); // ERROR: Empty describe block — remove or add tests to the describe block
```

**Correct:**

```ts
describe('suite', () => {
  it('test', () => {});
});
```

---

### `no-hardcoded-test-count`

Disallows hardcoded numeric literals in test-count assertions. Hardcoded counts drift when items are added or removed; compare against a derived value instead.

| Property             | Value                                          |
| -------------------- | ---------------------------------------------- |
| **Category**         | Test Hygiene                                   |
| **Default severity** | `error` (recommended); not enabled by `strict` |
| **Requires config**  | No                                             |
| **Fixable**          | No                                             |
| **Options**          | None                                           |

**Source:** [`no-hardcoded-test-count.ts`](../../packages/eslint-plugin/src/rules/no-hardcoded-test-count.ts)

**What it detects:** `expect(x).toHaveLength(<number literal>)`, and `expect(x.length).toBe(<number literal>)` when the value under assertion is a `.length` access. Non-literal arguments (`toHaveLength(expected)`, `toBe(items.length)`) are not flagged.

**Violation:**

```ts
expect(rules).toHaveLength(12); // ERROR: Hardcoded test-count literal
expect(items.length).toBe(10); // ERROR
```

**Correct:**

```ts
expect(rules).toHaveLength(expected);
expect(x.length).toBe(items.length);
```

---

## Type Safety Rules

### `no-undefined-optional-assignment`

Disallows assigning a possibly-undefined variable directly to an object property, which breaks `exactOptionalPropertyTypes`. Use a conditional spread instead.

| Property             | Value                                          |
| -------------------- | ---------------------------------------------- |
| **Category**         | Type Safety                                    |
| **Default severity** | Off (not enabled by `recommended` or `strict`) |
| **Requires config**  | No                                             |
| **Fixable**          | No                                             |
| **Options**          | None                                           |

**Source:** [`no-undefined-optional-assignment.ts`](../../packages/eslint-plugin/src/rules/no-undefined-optional-assignment.ts)

**What it detects:** A non-computed object property whose value is an identifier declared with a union type annotation that spells out `undefined` (for example `let v: string | undefined` or a parameter `v: number | undefined`). The check is purely syntactic — it does not use type information — so a variable with no annotation, or a union without `undefined`, is not flagged. A property already guarded by an enclosing `v !== undefined && ...` or `v != null && ...` is not flagged.

**Enable it explicitly:**

```js
'@harness-engineering/no-undefined-optional-assignment': 'error',
```

**Violation:**

```ts
let v: string | undefined;
const o = { field: v }; // ERROR: Assigning possibly-undefined 'v' directly to 'field' breaks exactOptionalPropertyTypes
```

**Correct:**

```ts
let v: string | undefined;
const o = { ...(v !== undefined && { field: v }) };
```

---

## Rule Summary

| Rule                               | Category       | `recommended` | `strict` | Fixable | Config Required |
| ---------------------------------- | -------------- | ------------- | -------- | ------- | --------------- |
| `no-layer-violation`               | Architecture   | `error`       | `error`  | No      | Yes             |
| `no-circular-deps`                 | Architecture   | `error`       | `error`  | No      | No              |
| `no-forbidden-imports`             | Architecture   | `error`       | `error`  | No      | Yes             |
| `require-boundary-schema`          | Boundary       | `warn`        | `error`  | No      | Yes             |
| `enforce-doc-exports`              | Documentation  | `warn`        | `error`  | No      | No              |
| `no-nested-loops-in-critical`      | Performance    | `warn`        | `error`  | No      | No              |
| `no-sync-io-in-async`              | Performance    | `warn`        | `error`  | No      | No              |
| `no-unbounded-array-chains`        | Performance    | `warn`        | `error`  | No      | No              |
| `no-spread-in-variadic`            | Performance    | `error`       | `error`  | No      | No              |
| `no-unix-shell-command`            | Cross-Platform | `warn`        | `error`  | No      | No              |
| `no-hardcoded-path-separator`      | Cross-Platform | `warn`        | `error`  | No      | No              |
| `require-path-normalization`       | Cross-Platform | `warn`        | `error`  | No      | No              |
| `prefer-execfile-over-exec`        | Cross-Platform | `warn`        | `error`  | No      | No              |
| `no-process-env-in-spawn`          | Security       | `error`       | `error`  | No      | No              |
| `no-process-exit`                  | Security       | off           | off      | No      | No              |
| `no-focused-tests`                 | Test Hygiene   | `error`       | `error`  | No      | No              |
| `no-skipped-tests`                 | Test Hygiene   | `error`       | `error`  | No      | No              |
| `no-disabled-tests`                | Test Hygiene   | `error`       | `error`  | No      | No              |
| `no-empty-describe`                | Test Hygiene   | off           | off      | No      | No              |
| `no-hardcoded-test-count`          | Test Hygiene   | `error`       | off      | No      | No              |
| `no-undefined-optional-assignment` | Type Safety    | off           | off      | No      | No              |

Severities come from the `configs` in [`packages/eslint-plugin/src/index.ts`](../../packages/eslint-plugin/src/index.ts). To change a rule's severity, override it in your flat config:

```js
'@harness-engineering/no-nested-loops-in-critical': 'error',
'@harness-engineering/no-process-exit': 'error',
```

## Maintaining This List

Rule registration is derived, not hand-written: [`generate-rules-barrel.mjs`](../../packages/eslint-plugin/scripts/generate-rules-barrel.mjs) generates `src/rules/index.ts` from the files in `packages/eslint-plugin/src/rules/`, so dropping a rule file there registers it automatically. Preset membership is still hand-edited in `src/index.ts`. When you add a rule, add a section here and a row to the summary table above.

---

_Last Updated: 2026-11-10_
