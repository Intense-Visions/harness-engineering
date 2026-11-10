# @harness-engineering/eslint-plugin

ESLint plugin for enforcing harness engineering architectural constraints.

## Installation

```bash
npm install -D @harness-engineering/eslint-plugin
```

## Usage

### ESLint 9.x (Flat Config)

```js
// eslint.config.js
import harness from '@harness-engineering/eslint-plugin';

export default [harness.configs.recommended];
```

### ESLint 8.x (Legacy Config)

```js
// .eslintrc.js
module.exports = {
  plugins: ['@harness-engineering'],
  extends: ['plugin:@harness-engineering/recommended'],
};
```

## Configuration

Create `harness.config.json` in your project root:

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

## Rules

### Architecture Rules

| Rule                   | Description                     | Default |
| ---------------------- | ------------------------------- | ------- |
| `no-layer-violation`   | Enforce layer boundary imports  | error   |
| `no-circular-deps`     | Detect circular dependencies    | error   |
| `no-forbidden-imports` | Block forbidden import patterns | error   |

### Boundary Rules

| Rule                      | Description                              | Default |
| ------------------------- | ---------------------------------------- | ------- |
| `require-boundary-schema` | Require Zod validation at API boundaries | warn    |

### Documentation Rules

| Rule                  | Description              | Default |
| --------------------- | ------------------------ | ------- |
| `enforce-doc-exports` | Require JSDoc on exports | warn    |

### Performance Rules

| Rule                          | Description                                                                  | Default |
| ----------------------------- | ---------------------------------------------------------------------------- | ------- |
| `no-nested-loops-in-critical` | Disallow nested loops in critical path functions                             | warn    |
| `no-sync-io-in-async`         | Disallow synchronous I/O in async functions                                  | warn    |
| `no-unbounded-array-chains`   | Disallow unbounded array method chains                                       | warn    |
| `no-spread-in-variadic`       | Disallow `Math.min`/`Math.max` array spread (stack overflow on large inputs) | error   |

### Cross-Platform Rules

| Rule                          | Description                                                          | Default |
| ----------------------------- | -------------------------------------------------------------------- | ------- |
| `no-unix-shell-command`       | Disallow Unix-specific shell commands                                | warn    |
| `prefer-execfile-over-exec`   | Prefer `execFile*` (arg array) over string-command `exec`/`execSync` | warn    |
| `no-hardcoded-path-separator` | Disallow hardcoded path separators                                   | warn    |
| `require-path-normalization`  | Require path normalization for cross-platform                        | warn    |

## Configs

- **recommended**: enables 18 rules — `error` for the architecture rules, `no-process-env-in-spawn`, `no-spread-in-variadic`, `no-focused-tests`, `no-skipped-tests`, `no-disabled-tests`, and `no-hardcoded-test-count`; `warn` for the other 9
- **strict**: enables 17 rules, all as `error` (it does not include `no-hardcoded-test-count`)
- `no-empty-describe`, `no-process-exit`, and `no-undefined-optional-assignment` are in neither preset; enable them explicitly

See the [ESLint Rules Reference](../../docs/reference/eslint-rules.md#rule-summary) for the per-rule severity table.

## License

MIT
