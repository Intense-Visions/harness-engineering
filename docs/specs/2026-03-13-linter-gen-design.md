# Linter Generator Design Specification

**Date**: 2026-03-13
**Status**: Approved
**Package**: `@harness-engineering/linter-gen`

## Overview

The linter generator transforms YAML configuration into standalone ESLint rule TypeScript files. It provides an extensible template system where users can create custom rule types via Handlebars templates.

## Key Decisions

| Decision             | Choice                | Rationale                                                      |
| -------------------- | --------------------- | -------------------------------------------------------------- |
| Generated rule style | Standalone files      | Each YAML rule becomes independent .ts file                    |
| Template engine      | Handlebars            | Mature, well-documented, supports helpers                      |
| Extensibility        | Custom templates      | Users add rule types via .hbs files                            |
| Template discovery   | Convention + explicit | Check `templates/` dir, allow YAML overrides                   |
| Output control       | Template-defined      | Template authors decide wrapper vs self-contained              |
| Built-in templates   | All three types       | Ship import-restriction, boundary-validation, dependency-graph |
| CLI integration      | Subcommand            | `harness linter generate/validate`                             |
| Watch mode           | Later iteration       | Design for it, implement after core works                      |

## Package Structure

```
packages/linter-gen/
├── src/
│   ├── index.ts                  # Public API exports
│   ├── engine/
│   │   ├── template-loader.ts    # Find templates (convention + explicit)
│   │   ├── template-renderer.ts  # Handlebars compilation + rendering
│   │   └── context-builder.ts    # YAML config → template context
│   ├── generator/
│   │   ├── rule-generator.ts     # Generate single rule file
│   │   ├── index-generator.ts    # Generate index.ts with all exports
│   │   └── orchestrator.ts       # Coordinate full generation run
│   ├── parser/
│   │   └── config-parser.ts      # Parse harness-linter.yml
│   ├── schema/
│   │   └── linter-config.ts      # Zod schema for config validation
│   └── templates/
│       ├── import-restriction.ts.hbs
│       ├── boundary-validation.ts.hbs
│       └── dependency-graph.ts.hbs
├── tests/
│   ├── engine/
│   ├── generator/
│   ├── parser/
│   └── fixtures/
├── package.json
├── tsconfig.json
└── README.md
```

## Dependencies

```json
{
  "dependencies": {
    "yaml": "^2.3.0",
    "handlebars": "^4.7.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

## Configuration Format

### `harness-linter.yml`

```yaml
version: 1
output: ./generated/eslint-rules

# Optional: explicit template paths (override convention)
templates:
  my-custom-type: ./custom-templates/my-custom-type.ts.hbs

rules:
  - name: no-ui-in-services
    type: import-restriction
    severity: error
    config:
      source: 'src/services/**'
      forbiddenImports:
        - 'react'
        - 'src/ui/**'
      message: 'Service layer cannot import UI code'

  - name: api-boundary-validation
    type: boundary-validation
    severity: error
    config:
      pattern: 'src/api/**/*.ts'
      requireZodSchema: true
      message: 'API endpoints must validate with Zod'

  - name: no-cycles
    type: dependency-graph
    severity: error
    config:
      entryPoints:
        - 'src/index.ts'
      exclude:
        - '**/*.test.ts'
      maxDepth: 10
```

### Zod Schema

```typescript
const RuleConfigSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/), // kebab-case
  type: z.string(),
  severity: z.enum(['error', 'warn', 'off']).default('error'),
  config: z.record(z.unknown()), // Template-specific
});

const LinterConfigSchema = z.object({
  version: z.literal(1),
  output: z.string(),
  templates: z.record(z.string()).optional(),
  rules: z.array(RuleConfigSchema).min(1),
});
```

### Template Discovery Order

1. Explicit path in `templates:` section
2. `./templates/{type}.ts.hbs` relative to config file
3. Built-in templates from package

## Template Engine

### Template Loader

Resolves template source in priority order:

```typescript
interface TemplateSource {
  type: 'explicit' | 'convention' | 'builtin';
  path: string;
  content: string;
}

async function loadTemplate(
  ruleType: string,
  config: LinterConfig,
  configDir: string
): Promise<TemplateSource>;
```

### Template Renderer

Compiles Handlebars templates with helpers:

```typescript
// Built-in Handlebars helpers
Handlebars.registerHelper('json', (obj) => JSON.stringify(obj, null, 2));
Handlebars.registerHelper('camelCase', (str) => toCamelCase(str));
Handlebars.registerHelper('pascalCase', (str) => toPascalCase(str));

function renderTemplate(template: string, context: RuleContext): string;
```

### Context Builder

Transforms YAML rule config into template context:

```typescript
interface RuleContext {
  name: string; // 'no-ui-in-services'
  nameCamel: string; // 'noUiInServices'
  namePascal: string; // 'NoUiInServices'
  severity: string; // 'error'
  config: unknown; // Template-specific config object
  meta: {
    generatedAt: string;
    generatorVersion: string;
    configPath: string;
  };
}
```

## Generator

### Rule Generator

Generates a single rule file:

```typescript
interface GeneratedRule {
  name: string;
  outputPath: string;
  content: string;
}

async function generateRule(
  rule: RuleConfig,
  templateSource: TemplateSource,
  outputDir: string
): Promise<GeneratedRule>;
```

### Index Generator

Creates `index.ts` that exports all generated rules:

```typescript
// Generated output: generated/eslint-rules/index.ts
import noUiInServices from './no-ui-in-services';
import apiBoundaryValidation from './api-boundary-validation';
import noCycles from './no-cycles';

export const rules = {
  'no-ui-in-services': noUiInServices,
  'api-boundary-validation': apiBoundaryValidation,
  'no-cycles': noCycles,
};

export { noUiInServices, apiBoundaryValidation, noCycles };
```

### Orchestrator

Coordinates the full generation run:

```typescript
interface GenerateOptions {
  configPath: string;
  outputDir?: string; // Override config's output
  clean?: boolean; // Remove existing files first
  dryRun?: boolean; // Preview without writing
}

interface GenerateResult {
  success: boolean;
  rulesGenerated: string[];
  outputDir: string;
  errors: GeneratorError[];
}

async function generate(options: GenerateOptions): Promise<GenerateResult>;
```

### Generation Flow

1. Parse and validate `harness-linter.yml`
2. Resolve output directory (from config or override)
3. Optionally clean existing generated files
4. For each rule:
   - Load template (explicit → convention → builtin)
   - Build context from rule config
   - Render template
   - Write to `{outputDir}/{rule-name}.ts`
5. Generate `index.ts` with all exports
6. Return result summary

### Error Handling

- Missing template → clear error with resolution suggestions
- Invalid rule config → Zod validation error with path
- Template render failure → show template line + context that failed
- File write failure → surface OS error with path

## CLI Integration

The `linter-gen` package exposes a programmatic API. The `cli` package adds commands.

### Commands

```
harness linter generate [options]
harness linter validate [options]
```

### `harness linter generate`

```
Options:
  --config <path>    Path to harness-linter.yml (default: ./harness-linter.yml)
  --output <dir>     Override output directory from config
  --clean            Remove existing generated files before generating
  --dry-run          Preview what would be generated without writing files
  --watch            Watch config and templates, regenerate on change (future)
  --json             Output result as JSON
  --verbose          Show detailed generation info
```

### `harness linter validate`

```
Options:
  --config <path>    Path to harness-linter.yml (default: ./harness-linter.yml)
  --json             Output validation result as JSON
```

### Example Output

```
$ harness linter generate

✓ Parsed harness-linter.yml (3 rules)
✓ Generated no-ui-in-services.ts
✓ Generated api-boundary-validation.ts
✓ Generated no-cycles.ts
✓ Generated index.ts

Generated 3 rules to ./generated/eslint-rules
```

### Exit Codes

- `0` — Success
- `1` — Validation/generation failed
- `2` — Config not found or unreadable

## Built-in Templates

### 1. `import-restriction.ts.hbs`

Blocks imports matching patterns from source files matching a pattern.

**Config schema:**

```typescript
{
  source: string;           // Glob for files this rule applies to
  forbiddenImports: string[]; // Patterns to block
  message: string;          // Error message
}
```

**Logic:**

- Check if current file matches `source` pattern
- On `ImportDeclaration`, check if import matches any `forbiddenImports`
- Report with custom message

### 2. `boundary-validation.ts.hbs`

Ensures files matching a pattern export Zod schemas for validation.

**Config schema:**

```typescript
{
  pattern: string; // Glob for files requiring validation
  requireZodSchema: boolean; // Must export z.object or similar
  message: string; // Error message
}
```

**Logic:**

- Check if current file matches `pattern`
- Scan exports for Zod schema usage
- Report if no schema found and `requireZodSchema` is true

### 3. `dependency-graph.ts.hbs`

Detects circular import chains.

**Config schema:**

```typescript
{
  entryPoints: string[];    // Starting points for graph traversal
  exclude: string[];        // Patterns to ignore
  maxDepth?: number;        // Limit traversal depth (default: 20)
}
```

**Logic:**

- Build import graph starting from entry points
- Detect cycles using DFS with visited tracking
- Report cycle with full chain path

## Public API

```typescript
import { generate, validate } from '@harness-engineering/linter-gen';

// Generate rules
const result = await generate({
  configPath: './harness-linter.yml',
  outputDir: './generated/eslint-rules',
  clean: true,
});

// Validate config only
const validation = await validate({
  configPath: './harness-linter.yml',
});
```

## Testing Strategy

### Unit Tests

| Module                         | Tests                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `parser/config-parser.ts`      | Valid YAML parsing, schema validation errors, missing required fields                     |
| `engine/template-loader.ts`    | Explicit path resolution, convention discovery, builtin fallback, missing template errors |
| `engine/template-renderer.ts`  | Handlebars rendering, helper functions, invalid template syntax                           |
| `engine/context-builder.ts`    | Name transformations (kebab→camel→pascal), meta fields                                    |
| `generator/rule-generator.ts`  | Single rule generation, output path construction                                          |
| `generator/index-generator.ts` | Export statement generation, naming                                                       |

### Integration Tests

- Generate rules from valid config, verify output
- Custom template from convention path
- Explicit template override
- Error cases (missing template, invalid config)

### Generated Rule Tests

- Generate rules to temp directory
- Import generated rule
- Run through `RuleTester` with valid/invalid cases

### Coverage Target

> 80% line coverage

## Future Iterations

- **Watch mode**: `--watch` flag to monitor config and templates
- **Additional built-in templates**: As common patterns emerge
- **Template validation**: Lint templates for common errors before generation
