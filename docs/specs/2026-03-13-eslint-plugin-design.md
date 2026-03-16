# ESLint Plugin Design Specification

**Date**: 2026-03-13
**Status**: Draft
**Package**: `@harness-engineering/eslint-plugin`
**Prerequisites**: None (standalone package, duplicates config schema from CLI)

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
    "@typescript-eslint/utils": "^8.0.0"
  },
  "devDependencies": {
    "@typescript-eslint/rule-tester": "^8.0.0"
  },
  "peerDependencies": {
    "eslint": "^8.0.0 || ^9.0.0",
    "typescript": "^5.0.0"
  }
}
```

**Note**: `@typescript-eslint/utils` is a runtime dependency (provides `ESLintUtils.RuleCreator`). The `@harness-engineering/core` dependency is removed since the plugin duplicates the config schema locally to avoid circular dependencies.

## Config Integration

### Config Schema

The ESLint plugin uses the same `harness.config.json` schema as the CLI, defined in `packages/cli/src/config/schema.ts`. Relevant fields:

```typescript
// From packages/cli/src/config/schema.ts
const LayerSchema = z.object({
  name: z.string(),
  pattern: z.string(), // singular glob pattern
  allowedDependencies: z.array(z.string()),
});

const ForbiddenImportSchema = z.object({
  from: z.string(),
  disallow: z.array(z.string()),
  message: z.string().optional(),
});

const BoundaryConfigSchema = z.object({
  requireSchema: z.array(z.string()),
});

const HarnessConfigSchema = z.object({
  version: z.literal(1),
  layers: z.array(LayerSchema).optional(),
  forbiddenImports: z.array(ForbiddenImportSchema).optional(),
  boundaries: BoundaryConfigSchema.optional(),
  // ... other fields
});
```

**Note**: The CLI schema (`packages/cli/src/config/schema.ts`) is the source of truth for config file format. The ESLint plugin duplicates this schema to avoid a runtime dependency on the CLI package.

### Config Loading

The plugin implements its own config loader in `utils/config-loader.ts`, reusing the schema from CLI but not depending on CLI internals:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { HarnessConfigSchema, type HarnessConfig } from './schema';

const CONFIG_FILENAME = 'harness.config.json';

let cachedConfig: HarnessConfig | null = null;
let cachedConfigPath: string | null = null;

/**
 * Find harness.config.json by walking up from the given directory
 */
function findConfigFile(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const configPath = path.join(currentDir, CONFIG_FILENAME);
    if (fs.existsSync(configPath)) {
      return configPath;
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}

/**
 * Load and validate config, with caching
 */
export function getConfig(filePath: string): HarnessConfig | null {
  const configPath = findConfigFile(path.dirname(filePath));
  if (!configPath) {
    return null;
  }

  // Return cached config if same path
  if (cachedConfigPath === configPath && cachedConfig) {
    return cachedConfig;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = HarnessConfigSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return null; // Invalid config, treat as no config
    }
    cachedConfig = parsed.data;
    cachedConfigPath = configPath;
    return cachedConfig;
  } catch {
    return null; // Read/parse error, treat as no config
  }
}
```

**Note**: The plugin duplicates the config schema from CLI rather than importing it. This avoids:

- Circular dependency (CLI depends on core, plugin depends on core)
- Runtime dependency on CLI package
- Need for CLI to export internal modules

The schema is simple and stable; duplication is acceptable.

**Behavior when no config found**:

- Rules that require config (`no-layer-violation`, `no-forbidden-imports`, `require-boundary-schema`) become no-ops
- Rules that don't require config (`enforce-doc-exports`, `no-circular-deps`) still run
- No error is thrown — this allows the plugin to be installed globally without breaking projects that don't use harness

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

**Implementation approach**:

- Uses a module-level `Map<string, Set<string>>` to track import edges
- Cache persists for the duration of the ESLint process (one lint run)
- Each new `eslint` invocation starts with a fresh cache (Node process restart)
- For watch mode / `--cache`: ESLint's file-level caching is orthogonal - we track edges as files are visited

**Cycle detection strategy**:

- **Per-import check (DFS)**: When a new import edge is added, run a simple DFS from the target back to see if it can reach the source. This catches cycles immediately as they form. O(V+E) per edge but typically fast for small graphs.
- **No Tarjan needed**: Unlike the CLI which analyzes full projects and reports all cycles at once, the ESLint rule reports per-file as it encounters cycles. The simpler DFS approach is sufficient and more appropriate for incremental linting.

**Cache lifecycle**:

```
eslint src/         → fresh cache, builds graph as files lint
eslint src/ --cache → fresh cache (new process), ESLint skips unchanged files
eslint --fix        → fresh cache (new process)
```

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
    {
      "from": "src/services/**",
      "disallow": ["react", "src/ui/**"],
      "message": "Services cannot import UI code"
    }
  ]
}
```

### Rule 4: `require-boundary-schema`

**Purpose**: Ensure API boundary exports have Zod schema validation.

**How it works**:

1. Match files against `boundaries.requireSchema` patterns
2. For each exported function, check if it validates input with Zod
3. Report if no validation is found

**Detection criteria** (must satisfy at least one):

- Function body contains `schema.parse(...)` or `schema.safeParse(...)` call
- Function body contains `z.object({...}).parse(...)` inline
- Function parameter has explicit Zod type annotation (e.g., `z.infer<typeof Schema>`)
- Function wraps a validated inner function (one level deep)

**What does NOT satisfy the rule**:

- Having a Zod import but not using it on the function's input
- Re-exporting from another module (the source module must validate)
- Type-only validation (must be runtime `.parse()` or `.safeParse()`)

**Config usage**:

```json
{
  "boundaries": {
    "requireSchema": ["src/api/**/*.ts"]
  }
}
```

**Note**: This uses static AST analysis only, not TypeScript type information. It detects common Zod patterns but may have false negatives for highly abstracted validation.

### Rule 5: `enforce-doc-exports`

**Purpose**: Require JSDoc comments on public exports.

**How it works**:

1. Find all `export` declarations (functions, classes, constants, types)
2. Check for preceding JSDoc comment (`/** ... */`)
3. Report missing documentation

**Options** (rule-level, not harness.config.json):

```js
'@harness-engineering/enforce-doc-exports': ['error', {
  ignoreTypes: false,  // default: false - require docs on type exports too
  ignoreInternal: true // default: true - skip exports marked @internal
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

**ESLint 9.x (flat config)**:

```js
// eslint.config.js
import harness from '@harness-engineering/eslint-plugin';

export default [
  harness.configs.recommended,
  // or harness.configs.strict
];
```

**ESLint 8.x (legacy config)**:

```js
// .eslintrc.js
module.exports = {
  plugins: ['@harness-engineering'],
  extends: ['plugin:@harness-engineering/recommended'],
};
```

The plugin exports both flat config objects and legacy-compatible configs.

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

| Rule                      | Key Test Cases                                                              |
| ------------------------- | --------------------------------------------------------------------------- |
| `no-layer-violation`      | Valid imports, cross-layer violations, unknown layers, relative vs absolute |
| `no-circular-deps`        | No cycle, direct cycle (A→B→A), indirect cycle (A→B→C→A)                    |
| `no-forbidden-imports`    | Allowed imports, forbidden match, pattern specificity                       |
| `require-boundary-schema` | Has Zod, missing Zod, non-boundary file                                     |
| `enforce-doc-exports`     | Has JSDoc, missing JSDoc, internal exports                                  |

## Future Roadmap (Phase 3/4)

### Auto-Fix Capabilities

| Rule                      | Auto-Fix Possibility                                         |
| ------------------------- | ------------------------------------------------------------ |
| `no-layer-violation`      | Suggest moving file to correct layer, or rewrite import path |
| `no-circular-deps`        | No auto-fix (requires architectural decision)                |
| `no-forbidden-imports`    | Suggest alternative import if mapping provided               |
| `require-boundary-schema` | Insert Zod schema stub for parameters                        |
| `enforce-doc-exports`     | Insert JSDoc template with param/return placeholders         |

### Implementation Notes

- Auto-fix uses ESLint's `fixer` API in rule context
- `enforce-doc-exports` is the easiest candidate (insert template)
- `require-boundary-schema` could generate `z.object({})` stubs
- Layer violations may need interactive mode (multiple valid fixes)

This is planned as a Phase 3 or 4 enhancement after the initial plugin is stable and adopted.

## Success Criteria

- [ ] All 5 rules implemented and tested
- [ ] Both configs (`recommended`, `strict`) available
- [ ] Plugin loads `harness.config.json` with built-in loader
- [ ] > 90% test coverage
- [ ] Works with ESLint 8.x and 9.x (integration tests)
- [ ] README with usage examples
