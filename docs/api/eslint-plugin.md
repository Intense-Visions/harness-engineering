# @harness-engineering/eslint-plugin

ESLint plugin for enforcing harness engineering architectural constraints. Provides 12 rules and 2 shared configurations.

**Version:** 0.3.0

## Installation

```bash
npm install @harness-engineering/eslint-plugin
```

**Peer dependencies:** `eslint` (^8, ^9, or ^10), `typescript` (^5)

## Setup

```javascript
// eslint.config.js (flat config)
import harnessPlugin from '@harness-engineering/eslint-plugin';

export default [
  harnessPlugin.configs.recommended,
  // or: harnessPlugin.configs.strict,
];
```

## Shared Configurations

### `recommended`

Enables all 12 rules. Architectural rules are set to `error`, documentation and portability rules to `warn`. Performance rules (`no-nested-loops-in-critical`, `no-sync-io-in-async`, `no-unbounded-array-chains`) are set to `warn`.

| Rule                          | Severity |
| ----------------------------- | -------- |
| `no-layer-violation`          | error    |
| `no-circular-deps`            | error    |
| `no-forbidden-imports`        | error    |
| `require-boundary-schema`     | warn     |
| `enforce-doc-exports`         | warn     |
| `no-unix-shell-command`       | warn     |
| `no-hardcoded-path-separator` | warn     |
| `require-path-normalization`  | warn     |
| `no-nested-loops-in-critical` | warn     |
| `no-sync-io-in-async`         | warn     |
| `no-unbounded-array-chains`   | warn     |
| `no-process-env-in-spawn`     | error    |

### `strict`

Same rules as `recommended` (all 12), but all set to `error`.

## Rules

### `no-layer-violation`

Prevents imports that violate the defined architectural layer hierarchy. For example, a "domain" layer module cannot import from a "presentation" layer module.

### `no-circular-deps`

Detects and reports circular dependency chains between modules.

### `no-forbidden-imports`

Blocks imports matching forbidden patterns defined in configuration. Useful for enforcing boundaries (e.g., no importing test utilities in production code).

### `require-boundary-schema`

Requires that public API boundaries include Zod schema validation. Ensures that data crossing module boundaries is validated at runtime.

### `enforce-doc-exports`

Ensures that all publicly exported symbols have JSDoc documentation.

### `no-nested-loops-in-critical`

Flags nested loops inside functions marked as performance-critical paths.

### `no-sync-io-in-async`

Detects synchronous I/O calls (`readFileSync`, `writeFileSync`, etc.) inside async functions.

### `no-unbounded-array-chains`

Flags method chains on arrays (`.map().filter().reduce()`) that operate on unbounded data without size guards.

### `no-unix-shell-command`

Detects Unix-specific shell commands (e.g., `rm -rf`, `chmod`, `grep`) that would fail on Windows. Suggests cross-platform alternatives.

### `no-hardcoded-path-separator`

Flags hardcoded path separators (`/` or `\\`) in string literals. Use `path.join()` or `path.sep` for cross-platform compatibility.

### `require-path-normalization`

Requires that file path arguments are normalized using `path.normalize()` or `path.resolve()` before being passed to filesystem APIs. Prevents path inconsistencies across platforms.

Source: [`require-path-normalization.ts`](../../packages/eslint-plugin/src/rules/require-path-normalization.ts)

## Exports

### Default Export

```typescript
export default plugin;
```

The plugin object containing `meta`, `rules`, and `configs`.

### Named Exports

```typescript
export { rules };
export const configs: { recommended: object; strict: object };
```
