# ESLint Plugin Design Specification

**Date**: 2026-03-13
**Status**: Draft
**Package**: `@harness-engineering/eslint-plugin`
**Prerequisites**: `@harness-engineering/core` v0.5.0

## Summary

An ESLint plugin that enforces harness engineering architectural constraints at lint time. Provides 5 rules covering layer boundaries, circular dependencies, forbidden imports, boundary validation, and documentation requirements.

## Package Structure

```
packages/eslint-plugin/
├── src/
│   ├── index.ts              # Plugin entry, exports rules + configs
│   ├── rules/
│   │   ├── index.ts
│   │   ├── no-layer-violation.ts
│   │   ├── no-circular-deps.ts
│   │   ├── no-forbidden-imports.ts
│   │   ├── require-boundary-schema.ts
│   │   └── enforce-doc-exports.ts
│   ├── configs/
│   │   ├── index.ts
│   │   ├── recommended.ts
│   │   └── strict.ts
│   └── utils/
│       ├── config-loader.ts  # Load harness.config.json (via core)
│       └── ast-helpers.ts    # Import path resolution, JSDoc detection
├── tests/
│   ├── rules/
│   │   └── [one test file per rule]
│   └── fixtures/
│       ├── harness.config.json
│       ├── valid-layers/
│       └── layer-violations/
├── package.json
├── tsconfig.json
├── vitest.config.mts
└── README.md
```

## Dependencies

```json
{
  "dependencies": {
    "@harness-engineering/core": "workspace:*"
  },
  "devDependencies": {
    "@typescript-eslint/rule-tester": "^8.0.0",
    "@typescript-eslint/utils": "^8.0.0"
  },
  "peerDependencies": {
    "eslint": "^8.0.0 || ^9.0.0"
  }
}
```

## Rules

### Rule 1: `no-layer-violation`

**Purpose**: Enforce that imports respect the layer hierarchy defined in `harness.config.json`.

**How it works**:
1. On each `ImportDeclaration`, determine which layer the current file belongs to (via glob matching)
2. Determine which layer the imported module belongs to
3. Check if the import is allowed per `allowedDependencies` config
4. Report violation if importing from a disallowed layer

**Config usage**:
```json
{
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "domain", "pattern": "src/domain/**", "allowedDependencies": ["types"] },
    { "name": "services", "pattern": "src/services/**", "allowedDependencies": ["types", "domain"] }
  ]
}
```

**Error example**:
```
src/types/user.ts:3:1 - '@harness-engineering/no-layer-violation'
  Layer 'types' cannot import from layer 'services'
```

### Rule 2: `no-circular-deps`

**Purpose**: Detect circular import chains.

**How it works**:
1. Build an import graph as files are linted
2. On each import, check if adding this edge creates a cycle
3. Report the cycle path if detected

**Implementation note**: This rule tracks state across files using a module-level cache that resets per lint run.

**Error example**:
```
src/services/auth.ts:2:1 - '@harness-engineering/no-circular-deps'
  Circular dependency detected: auth.ts → user.ts → auth.ts
```

### Rule 3: `no-forbidden-imports`

**Purpose**: Block specific imports based on configurable patterns.

**How it works**:
1. Match current file against `from` patterns in config
2. For matching files, check if import path matches any `disallow` pattern
3. Report with custom message if configured

**Config usage**:
```json
{
  "forbiddenImports": [
    { "from": "src/services/**", "disallow": ["react", "src/ui/**"], "message": "Services cannot import UI code" }
  ]
}
```

### Rule 4: `require-boundary-schema`

**Purpose**: Ensure API boundary exports have Zod schema validation.

**How it works**:
1. Match files against `boundaries.requireSchema` patterns
2. For each exported function, check if parameters use Zod schemas
3. Look for `z.` usage or `.parse()` / `.safeParse()` calls

**Config usage**:
```json
{
  "boundaries": {
    "requireSchema": ["src/api/**/*.ts"]
  }
}
```

### Rule 5: `enforce-doc-exports`

**Purpose**: Require JSDoc comments on public exports.

**How it works**:
1. Find all `export` declarations (functions, classes, constants, types)
2. Check for preceding JSDoc comment (`/** ... */`)
3. Report missing documentation

**Options** (rule-level, not harness.config.json):
```js
'@harness-engineering/enforce-doc-exports': ['error', {
  ignoreTypes: false,  // Also require docs on type exports
  ignoreInternal: true // Skip exports marked @internal
}]
```

## Configs

### `recommended`

Sensible defaults for most projects. Architecture rules as errors, documentation rules as warnings.

```typescript
export default {
  plugins: ['@harness-engineering'],
  rules: {
    '@harness-engineering/no-layer-violation': 'error',
    '@harness-engineering/no-circular-deps': 'error',
    '@harness-engineering/no-forbidden-imports': 'error',
    '@harness-engineering/require-boundary-schema': 'warn',
    '@harness-engineering/enforce-doc-exports': 'warn',
  },
};
```

### `strict`

All rules as errors. For teams that want enforcement on all fronts.

```typescript
export default {
  plugins: ['@harness-engineering'],
  rules: {
    '@harness-engineering/no-layer-violation': 'error',
    '@harness-engineering/no-circular-deps': 'error',
    '@harness-engineering/no-forbidden-imports': 'error',
    '@harness-engineering/require-boundary-schema': 'error',
    '@harness-engineering/enforce-doc-exports': 'error',
  },
};
```

### Usage

```js
// eslint.config.js
import harness from '@harness-engineering/eslint-plugin';

export default [
  harness.configs.recommended,
  // or harness.configs.strict
];
```

## Testing Strategy

### Test Structure

```
tests/
├── rules/
│   ├── no-layer-violation.test.ts
│   ├── no-circular-deps.test.ts
│   ├── no-forbidden-imports.test.ts
│   ├── require-boundary-schema.test.ts
│   └── enforce-doc-exports.test.ts
└── fixtures/
    ├── harness.config.json
    ├── valid-layers/
    │   ├── types/user.ts
    │   ├── domain/user-service.ts
    │   └── api/handler.ts
    └── layer-violations/
        └── types-imports-api.ts
```

### Testing Approach

Use `@typescript-eslint/rule-tester` for unit testing each rule:

```typescript
import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from '../../src/rules/no-layer-violation';

const ruleTester = new RuleTester();

ruleTester.run('no-layer-violation', rule, {
  valid: [
    {
      code: `import { User } from '../types/user';`,
      filename: '/project/src/domain/user-service.ts',
    },
  ],
  invalid: [
    {
      code: `import { handler } from '../api/handler';`,
      filename: '/project/src/types/user.ts',
      errors: [{ messageId: 'layerViolation' }],
    },
  ],
});
```

### Coverage Targets

- All rules: >90% line coverage
- Config loader: 100% (critical path)
- Edge cases: Empty config, missing config, malformed patterns

### Key Test Cases

| Rule | Key Test Cases |
|------|----------------|
| `no-layer-violation` | Valid imports, cross-layer violations, unknown layers, relative vs absolute |
| `no-circular-deps` | No cycle, direct cycle (A→B→A), indirect cycle (A→B→C→A) |
| `no-forbidden-imports` | Allowed imports, forbidden match, pattern specificity |
| `require-boundary-schema` | Has Zod, missing Zod, non-boundary file |
| `enforce-doc-exports` | Has JSDoc, missing JSDoc, internal exports |

## Future Roadmap (Phase 3/4)

### Auto-Fix Capabilities

| Rule | Auto-Fix Possibility |
|------|---------------------|
| `no-layer-violation` | Suggest moving file to correct layer, or rewrite import path |
| `no-circular-deps` | No auto-fix (requires architectural decision) |
| `no-forbidden-imports` | Suggest alternative import if mapping provided |
| `require-boundary-schema` | Insert Zod schema stub for parameters |
| `enforce-doc-exports` | Insert JSDoc template with param/return placeholders |

### Implementation Notes

- Auto-fix uses ESLint's `fixer` API in rule context
- `enforce-doc-exports` is the easiest candidate (insert template)
- `require-boundary-schema` could generate `z.object({})` stubs
- Layer violations may need interactive mode (multiple valid fixes)

This is planned as a Phase 3 or 4 enhancement after the initial plugin is stable and adopted.

## Success Criteria

- [ ] All 5 rules implemented and tested
- [ ] Both configs (`recommended`, `strict`) available
- [ ] Plugin loads `harness.config.json` via core
- [ ] >90% test coverage
- [ ] Works with ESLint 8.x and 9.x
- [ ] README with usage examples
