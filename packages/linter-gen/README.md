# @harness-engineering/linter-gen

Generate ESLint rules from YAML configuration using extensible Handlebars templates.

## Installation

```bash
pnpm add @harness-engineering/linter-gen
```

## Usage

### Configuration

Create `harness-linter.yml`:

```yaml
version: 1
output: ./generated/eslint-rules

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
```

### CLI

```bash
# Generate rules
harness linter generate

# Generate with options
harness linter generate --config ./custom-config.yml --output ./rules --clean

# Validate config only
harness linter validate
```

### Programmatic API

```typescript
import { generate, validate } from '@harness-engineering/linter-gen';

// Generate rules
const result = await generate({
  configPath: './harness-linter.yml',
  outputDir: './generated',
  clean: true,
});

if (result.success) {
  console.log(`Generated ${result.rulesGenerated.length} rules`);
}

// Validate config
const validation = await validate({ configPath: './harness-linter.yml' });
```

## Built-in Templates

### import-restriction

Block imports matching patterns in files matching a source pattern.

```yaml
- name: no-react-in-services
  type: import-restriction
  config:
    source: 'src/services/**'
    forbiddenImports:
      - 'react'
      - 'react-dom'
    message: 'Service files cannot import React'
```

### boundary-validation

Ensure files export Zod schemas for validation.

```yaml
- name: api-must-validate
  type: boundary-validation
  config:
    pattern: 'src/api/**/*.ts'
    requireZodSchema: true
    message: 'API endpoints must use Zod validation'
```

### dependency-graph

Detect circular import dependencies.

```yaml
- name: no-cycles
  type: dependency-graph
  config:
    entryPoints:
      - 'src/index.ts'
    exclude:
      - '**/*.test.ts'
    maxDepth: 20
```

## Custom Templates

### Convention-based

Place templates in `templates/` directory relative to config:

```
project/
├── harness-linter.yml
└── templates/
    └── my-custom-type.ts.hbs
```

### Explicit paths

Specify template paths in config:

```yaml
templates:
  my-custom-type: ./custom-templates/my-rule.ts.hbs
```

### Template Context

Templates receive:

```typescript
{
  name: 'rule-name',           // kebab-case
  nameCamel: 'ruleName',       // camelCase
  namePascal: 'RuleName',      // PascalCase
  severity: 'error',           // error | warn | off
  config: { ... },             // Template-specific config
  meta: {
    generatedAt: '2026-03-13T...',
    generatorVersion: '0.1.0',
    configPath: '/path/to/config.yml',
  }
}
```

### Handlebars Helpers

- `{{json value}}` - JSON.stringify
- `{{jsonPretty value}}` - JSON.stringify with formatting
- `{{camelCase "kebab-name"}}` - Convert to camelCase
- `{{pascalCase "kebab-name"}}` - Convert to PascalCase

## License

MIT
