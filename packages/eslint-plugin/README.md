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

export default [
  harness.configs.recommended,
];
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
    { "name": "services", "pattern": "src/services/**", "allowedDependencies": ["types", "domain"] },
    { "name": "api", "pattern": "src/api/**", "allowedDependencies": ["types", "domain", "services"] }
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

| Rule | Description | Default |
|------|-------------|---------|
| `no-layer-violation` | Enforce layer boundary imports | error |
| `no-circular-deps` | Detect circular dependencies | error |
| `no-forbidden-imports` | Block forbidden import patterns | error |

### Boundary Rules

| Rule | Description | Default |
|------|-------------|---------|
| `require-boundary-schema` | Require Zod validation at API boundaries | warn |

### Documentation Rules

| Rule | Description | Default |
|------|-------------|---------|
| `enforce-doc-exports` | Require JSDoc on exports | warn |

## Configs

- **recommended**: Architecture rules as errors, others as warnings
- **strict**: All rules as errors

## License

MIT
