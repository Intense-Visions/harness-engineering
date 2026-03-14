# Linter Generator Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@harness-engineering/linter-gen` package that generates ESLint rules from YAML configuration using extensible Handlebars templates.

**Architecture:** Template engine approach with clean separation between parsing, template loading/rendering, and file generation. Three built-in templates ship with the package. CLI integration adds `harness linter generate/validate` commands.

**Tech Stack:** TypeScript, Zod (validation), yaml (parsing), Handlebars (templates), Vitest (testing)

**Spec:** [2026-03-13-linter-gen-design.md](../specs/2026-03-13-linter-gen-design.md)

---

## File Structure

```
packages/linter-gen/
├── package.json
├── tsconfig.json
├── vitest.config.mts
├── src/
│   ├── index.ts                      # Public API exports
│   ├── schema/
│   │   └── linter-config.ts          # Zod schema for harness-linter.yml
│   ├── parser/
│   │   └── config-parser.ts          # Parse and validate YAML config
│   ├── engine/
│   │   ├── template-loader.ts        # Find templates (explicit → convention → builtin)
│   │   ├── template-renderer.ts      # Handlebars compilation + helpers
│   │   └── context-builder.ts        # YAML config → template context
│   ├── generator/
│   │   ├── rule-generator.ts         # Generate single rule file
│   │   ├── index-generator.ts        # Generate index.ts exports
│   │   └── orchestrator.ts           # Coordinate full generation
│   └── templates/
│       ├── import-restriction.ts.hbs
│       ├── boundary-validation.ts.hbs
│       └── dependency-graph.ts.hbs
├── tests/
│   ├── schema/
│   │   └── linter-config.test.ts
│   ├── parser/
│   │   └── config-parser.test.ts
│   ├── engine/
│   │   ├── template-loader.test.ts
│   │   ├── template-renderer.test.ts
│   │   └── context-builder.test.ts
│   ├── generator/
│   │   ├── rule-generator.test.ts
│   │   ├── index-generator.test.ts
│   │   └── orchestrator.test.ts
│   ├── integration/
│   │   └── generate.test.ts
│   └── fixtures/
│       ├── valid-config.yml
│       ├── invalid-config.yml
│       ├── with-custom-template/
│       │   ├── harness-linter.yml
│       │   └── templates/
│       │       └── custom-type.ts.hbs
│       └── expected-output/
│           ├── no-ui-in-services.ts
│           └── index.ts
└── README.md
```

**CLI integration** (in existing `packages/cli/`):
```
packages/cli/src/commands/linter/
├── index.ts       # Parent command: harness linter
├── generate.ts    # harness linter generate
└── validate.ts    # harness linter validate
```

---

## Chunk 1: Package Setup and Schema

### Task 1: Initialize linter-gen package

**Files:**
- Create: `packages/linter-gen/package.json`
- Create: `packages/linter-gen/tsconfig.json`
- Create: `packages/linter-gen/vitest.config.mts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@harness-engineering/linter-gen",
  "version": "0.1.0",
  "description": "Generate ESLint rules from YAML configuration",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc && cp -r src/templates dist/templates",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "yaml": "^2.3.0",
    "handlebars": "^4.7.0",
    "zod": "^3.22.0",
    "minimatch": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create vitest.config.mts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/templates/**'],
    },
  },
});
```

- [ ] **Step 4: Install dependencies**

Run: `pnpm install`
Expected: Dependencies installed, lockfile updated

- [ ] **Step 5: Commit package setup**

```bash
git add packages/linter-gen/package.json packages/linter-gen/tsconfig.json packages/linter-gen/vitest.config.mts pnpm-lock.yaml
git commit -m "feat(linter-gen): initialize package structure"
```

---

### Task 2: Define Zod schema for linter config

**Files:**
- Create: `packages/linter-gen/src/schema/linter-config.ts`
- Create: `packages/linter-gen/tests/schema/linter-config.test.ts`

- [ ] **Step 1: Write failing test for RuleConfigSchema**

```typescript
// tests/schema/linter-config.test.ts
import { describe, it, expect } from 'vitest';
import { RuleConfigSchema, LinterConfigSchema } from '../../src/schema/linter-config';

describe('RuleConfigSchema', () => {
  it('accepts valid rule config', () => {
    const input = {
      name: 'no-ui-in-services',
      type: 'import-restriction',
      severity: 'error',
      config: {
        source: 'src/services/**',
        forbiddenImports: ['react'],
        message: 'No UI in services',
      },
    };

    const result = RuleConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects invalid rule name (not kebab-case)', () => {
    const input = {
      name: 'NoUiInServices', // PascalCase not allowed
      type: 'import-restriction',
      config: {},
    };

    const result = RuleConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('defaults severity to error', () => {
    const input = {
      name: 'my-rule',
      type: 'some-type',
      config: {},
    };

    const result = RuleConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.severity).toBe('error');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/linter-gen && pnpm test -- tests/schema/linter-config.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Write RuleConfigSchema implementation**

```typescript
// src/schema/linter-config.ts
import { z } from 'zod';

/**
 * Schema for a single rule configuration in harness-linter.yml
 */
export const RuleConfigSchema = z.object({
  /** Rule name in kebab-case (e.g., 'no-ui-in-services') */
  name: z
    .string()
    .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'Rule name must be kebab-case'),
  /** Rule type - determines which template to use */
  type: z.string().min(1),
  /** ESLint severity level */
  severity: z.enum(['error', 'warn', 'off']).default('error'),
  /** Template-specific configuration */
  config: z.record(z.unknown()),
});

export type RuleConfig = z.infer<typeof RuleConfigSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/linter-gen && pnpm test -- tests/schema/linter-config.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for LinterConfigSchema**

Add to `tests/schema/linter-config.test.ts`:

```typescript
describe('LinterConfigSchema', () => {
  it('accepts valid linter config', () => {
    const input = {
      version: 1,
      output: './generated/eslint-rules',
      rules: [
        {
          name: 'no-ui-in-services',
          type: 'import-restriction',
          config: { source: 'src/**' },
        },
      ],
    };

    const result = LinterConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects version other than 1', () => {
    const input = {
      version: 2,
      output: './out',
      rules: [{ name: 'r', type: 't', config: {} }],
    };

    const result = LinterConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects empty rules array', () => {
    const input = {
      version: 1,
      output: './out',
      rules: [],
    };

    const result = LinterConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('accepts optional templates mapping', () => {
    const input = {
      version: 1,
      output: './out',
      templates: {
        'custom-type': './templates/custom.ts.hbs',
      },
      rules: [{ name: 'my-rule', type: 'custom-type', config: {} }],
    };

    const result = LinterConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.templates).toEqual({
        'custom-type': './templates/custom.ts.hbs',
      });
    }
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd packages/linter-gen && pnpm test -- tests/schema/linter-config.test.ts`
Expected: FAIL - LinterConfigSchema not defined

- [ ] **Step 7: Write LinterConfigSchema implementation**

Add to `src/schema/linter-config.ts`:

```typescript
/**
 * Schema for the complete harness-linter.yml configuration
 */
export const LinterConfigSchema = z.object({
  /** Config version - currently only 1 is supported */
  version: z.literal(1),
  /** Output directory for generated rules */
  output: z.string().min(1),
  /** Optional explicit template path mappings (type → path) */
  templates: z.record(z.string()).optional(),
  /** Rules to generate */
  rules: z.array(RuleConfigSchema).min(1, 'At least one rule is required'),
});

export type LinterConfig = z.infer<typeof LinterConfigSchema>;
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd packages/linter-gen && pnpm test -- tests/schema/linter-config.test.ts`
Expected: PASS

- [ ] **Step 9: Commit schema**

```bash
git add packages/linter-gen/src/schema packages/linter-gen/tests/schema
git commit -m "feat(linter-gen): add Zod schema for linter config"
```

---

## Chunk 2: Config Parser

### Task 3: Implement config parser

**Files:**
- Create: `packages/linter-gen/src/parser/config-parser.ts`
- Create: `packages/linter-gen/tests/parser/config-parser.test.ts`
- Create: `packages/linter-gen/tests/fixtures/valid-config.yml`
- Create: `packages/linter-gen/tests/fixtures/invalid-config.yml`

- [ ] **Step 1: Create test fixtures**

```yaml
# tests/fixtures/valid-config.yml
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

  - name: api-boundary-validation
    type: boundary-validation
    severity: error
    config:
      pattern: 'src/api/**/*.ts'
      requireZodSchema: true
      message: 'API endpoints must validate with Zod'
```

```yaml
# tests/fixtures/invalid-config.yml
version: 2
output: ./out
rules: []
```

- [ ] **Step 2: Write failing tests for parseConfig**

```typescript
// tests/parser/config-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseConfig, ParseError } from '../../src/parser/config-parser';
import * as path from 'path';

const fixturesDir = path.join(__dirname, '../fixtures');

describe('parseConfig', () => {
  it('parses valid YAML config', async () => {
    const configPath = path.join(fixturesDir, 'valid-config.yml');
    const result = await parseConfig(configPath);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
      expect(result.data.output).toBe('./generated/eslint-rules');
      expect(result.data.rules).toHaveLength(2);
      expect(result.data.rules[0].name).toBe('no-ui-in-services');
    }
  });

  it('returns error for invalid config', async () => {
    const configPath = path.join(fixturesDir, 'invalid-config.yml');
    const result = await parseConfig(configPath);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ParseError);
      expect(result.error.message).toContain('version');
    }
  });

  it('returns error for non-existent file', async () => {
    const result = await parseConfig('/does/not/exist.yml');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FILE_NOT_FOUND');
    }
  });

  it('returns error for invalid YAML syntax', async () => {
    const configPath = path.join(fixturesDir, 'invalid-yaml.yml');
    // Create this fixture with invalid YAML
    const result = await parseConfig(configPath);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('YAML_PARSE_ERROR');
    }
  });
});
```

- [ ] **Step 3: Create invalid YAML fixture**

```yaml
# tests/fixtures/invalid-yaml.yml
version: 1
output: ./out
rules:
  - name: test
    type: foo
    config:
      bad: [unclosed bracket
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd packages/linter-gen && pnpm test -- tests/parser/config-parser.test.ts`
Expected: FAIL - module not found

- [ ] **Step 5: Write config parser implementation**

```typescript
// src/parser/config-parser.ts
import * as fs from 'fs/promises';
import * as yaml from 'yaml';
import { LinterConfigSchema, type LinterConfig } from '../schema/linter-config';

export type ParseErrorCode =
  | 'FILE_NOT_FOUND'
  | 'FILE_READ_ERROR'
  | 'YAML_PARSE_ERROR'
  | 'VALIDATION_ERROR';

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly code: ParseErrorCode,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

export type ParseResult =
  | { success: true; data: LinterConfig; configPath: string }
  | { success: false; error: ParseError };

/**
 * Parse and validate a harness-linter.yml config file
 */
export async function parseConfig(configPath: string): Promise<ParseResult> {
  // Read file
  let content: string;
  try {
    content = await fs.readFile(configPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        success: false,
        error: new ParseError(
          `Config file not found: ${configPath}`,
          'FILE_NOT_FOUND',
          err
        ),
      };
    }
    return {
      success: false,
      error: new ParseError(
        `Failed to read config file: ${configPath}`,
        'FILE_READ_ERROR',
        err
      ),
    };
  }

  // Parse YAML
  let parsed: unknown;
  try {
    parsed = yaml.parse(content);
  } catch (err) {
    return {
      success: false,
      error: new ParseError(
        `Invalid YAML syntax in ${configPath}: ${(err as Error).message}`,
        'YAML_PARSE_ERROR',
        err
      ),
    };
  }

  // Validate with Zod
  const result = LinterConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return {
      success: false,
      error: new ParseError(
        `Invalid config: ${issues}`,
        'VALIDATION_ERROR',
        result.error
      ),
    };
  }

  return {
    success: true,
    data: result.data,
    configPath,
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/linter-gen && pnpm test -- tests/parser/config-parser.test.ts`
Expected: PASS

- [ ] **Step 7: Commit config parser**

```bash
git add packages/linter-gen/src/parser packages/linter-gen/tests/parser packages/linter-gen/tests/fixtures
git commit -m "feat(linter-gen): add config parser with YAML and Zod validation"
```

---

## Chunk 3: Template Engine

### Task 4: Implement context builder

**Files:**
- Create: `packages/linter-gen/src/engine/context-builder.ts`
- Create: `packages/linter-gen/tests/engine/context-builder.test.ts`

- [ ] **Step 1: Write failing tests for context builder**

```typescript
// tests/engine/context-builder.test.ts
import { describe, it, expect } from 'vitest';
import { buildRuleContext, type RuleContext } from '../../src/engine/context-builder';
import type { RuleConfig } from '../../src/schema/linter-config';

describe('buildRuleContext', () => {
  it('transforms rule config to template context', () => {
    const rule: RuleConfig = {
      name: 'no-ui-in-services',
      type: 'import-restriction',
      severity: 'error',
      config: {
        source: 'src/services/**',
        forbiddenImports: ['react'],
        message: 'No UI in services',
      },
    };

    const context = buildRuleContext(rule, '/path/to/config.yml');

    expect(context.name).toBe('no-ui-in-services');
    expect(context.nameCamel).toBe('noUiInServices');
    expect(context.namePascal).toBe('NoUiInServices');
    expect(context.severity).toBe('error');
    expect(context.config).toEqual(rule.config);
    expect(context.meta.configPath).toBe('/path/to/config.yml');
    expect(context.meta.generatorVersion).toBeDefined();
  });

  it('converts kebab-case names correctly', () => {
    const cases = [
      { input: 'simple', camel: 'simple', pascal: 'Simple' },
      { input: 'two-words', camel: 'twoWords', pascal: 'TwoWords' },
      { input: 'three-word-name', camel: 'threeWordName', pascal: 'ThreeWordName' },
      { input: 'with-numbers-123', camel: 'withNumbers123', pascal: 'WithNumbers123' },
    ];

    for (const { input, camel, pascal } of cases) {
      const rule: RuleConfig = {
        name: input,
        type: 'test',
        severity: 'error',
        config: {},
      };
      const context = buildRuleContext(rule, '/config.yml');
      expect(context.nameCamel).toBe(camel);
      expect(context.namePascal).toBe(pascal);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/linter-gen && pnpm test -- tests/engine/context-builder.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Write context builder implementation**

```typescript
// src/engine/context-builder.ts
import type { RuleConfig } from '../schema/linter-config';

// Package version - update when releasing
const GENERATOR_VERSION = '0.1.0';

export interface RuleContext {
  /** Original kebab-case name */
  name: string;
  /** camelCase version */
  nameCamel: string;
  /** PascalCase version */
  namePascal: string;
  /** ESLint severity */
  severity: string;
  /** Template-specific config object */
  config: Record<string, unknown>;
  /** Generation metadata */
  meta: {
    generatedAt: string;
    generatorVersion: string;
    configPath: string;
  };
}

/**
 * Convert kebab-case to camelCase
 */
function toCamelCase(str: string): string {
  return str.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
}

/**
 * Convert kebab-case to PascalCase
 */
function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Build template context from rule configuration
 */
export function buildRuleContext(rule: RuleConfig, configPath: string): RuleContext {
  return {
    name: rule.name,
    nameCamel: toCamelCase(rule.name),
    namePascal: toPascalCase(rule.name),
    severity: rule.severity,
    config: rule.config as Record<string, unknown>,
    meta: {
      generatedAt: new Date().toISOString(),
      generatorVersion: GENERATOR_VERSION,
      configPath,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/linter-gen && pnpm test -- tests/engine/context-builder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit context builder**

```bash
git add packages/linter-gen/src/engine/context-builder.ts packages/linter-gen/tests/engine/context-builder.test.ts
git commit -m "feat(linter-gen): add context builder for template rendering"
```

---

### Task 5: Implement template renderer

**Files:**
- Create: `packages/linter-gen/src/engine/template-renderer.ts`
- Create: `packages/linter-gen/tests/engine/template-renderer.test.ts`

- [ ] **Step 1: Write failing tests for template renderer**

```typescript
// tests/engine/template-renderer.test.ts
import { describe, it, expect } from 'vitest';
import { renderTemplate, TemplateError } from '../../src/engine/template-renderer';
import type { RuleContext } from '../../src/engine/context-builder';

describe('renderTemplate', () => {
  const mockContext: RuleContext = {
    name: 'no-ui-in-services',
    nameCamel: 'noUiInServices',
    namePascal: 'NoUiInServices',
    severity: 'error',
    config: {
      source: 'src/services/**',
      forbiddenImports: ['react', 'src/ui/**'],
      message: 'No UI in services',
    },
    meta: {
      generatedAt: '2026-03-13T00:00:00.000Z',
      generatorVersion: '0.1.0',
      configPath: '/path/to/config.yml',
    },
  };

  it('renders simple template with context', () => {
    const template = 'Rule name: {{name}}';
    const result = renderTemplate(template, mockContext);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe('Rule name: no-ui-in-services');
    }
  });

  it('provides json helper for serialization', () => {
    const template = 'const forbidden = {{{json config.forbiddenImports}}};';
    const result = renderTemplate(template, mockContext);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe('const forbidden = ["react","src/ui/**"];');
    }
  });

  it('provides jsonPretty helper for formatted output', () => {
    const template = 'const forbidden = {{{jsonPretty config.forbiddenImports}}};';
    const result = renderTemplate(template, mockContext);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain('[\n');
      expect(result.output).toContain('"react"');
    }
  });

  it('provides camelCase helper', () => {
    const template = '{{camelCase "some-kebab-name"}}';
    const result = renderTemplate(template, mockContext);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe('someKebabName');
    }
  });

  it('provides pascalCase helper', () => {
    const template = '{{pascalCase "some-kebab-name"}}';
    const result = renderTemplate(template, mockContext);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe('SomeKebabName');
    }
  });

  it('returns error for invalid template syntax', () => {
    const template = '{{#if unclosed';
    const result = renderTemplate(template, mockContext);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(TemplateError);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/linter-gen && pnpm test -- tests/engine/template-renderer.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Write template renderer implementation**

```typescript
// src/engine/template-renderer.ts
import Handlebars from 'handlebars';
import type { RuleContext } from './context-builder';

export class TemplateError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TemplateError';
  }
}

export type RenderResult =
  | { success: true; output: string }
  | { success: false; error: TemplateError };

/**
 * Convert kebab-case to camelCase
 */
function toCamelCase(str: string): string {
  return str.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
}

/**
 * Convert kebab-case to PascalCase
 */
function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

// Register Handlebars helpers
Handlebars.registerHelper('json', (obj: unknown) => JSON.stringify(obj));

Handlebars.registerHelper('jsonPretty', (obj: unknown) =>
  JSON.stringify(obj, null, 2)
);

Handlebars.registerHelper('camelCase', (str: string) => toCamelCase(str));

Handlebars.registerHelper('pascalCase', (str: string) => toPascalCase(str));

/**
 * Render a Handlebars template with the given context
 */
export function renderTemplate(
  templateSource: string,
  context: RuleContext
): RenderResult {
  try {
    const compiled = Handlebars.compile(templateSource, { strict: true });
    const output = compiled(context);
    return { success: true, output };
  } catch (err) {
    return {
      success: false,
      error: new TemplateError(
        `Template rendering failed: ${(err as Error).message}`,
        err
      ),
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/linter-gen && pnpm test -- tests/engine/template-renderer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit template renderer**

```bash
git add packages/linter-gen/src/engine/template-renderer.ts packages/linter-gen/tests/engine/template-renderer.test.ts
git commit -m "feat(linter-gen): add Handlebars template renderer with helpers"
```

---

### Task 6: Implement template loader

**Files:**
- Create: `packages/linter-gen/src/engine/template-loader.ts`
- Create: `packages/linter-gen/tests/engine/template-loader.test.ts`
- Create: `packages/linter-gen/tests/fixtures/with-custom-template/harness-linter.yml`
- Create: `packages/linter-gen/tests/fixtures/with-custom-template/templates/custom-type.ts.hbs`

- [ ] **Step 1: Create custom template fixture**

```yaml
# tests/fixtures/with-custom-template/harness-linter.yml
version: 1
output: ./generated

templates:
  explicit-custom: ./my-templates/explicit.ts.hbs

rules:
  - name: use-convention-template
    type: convention-type
    config: {}
  - name: use-explicit-template
    type: explicit-custom
    config: {}
```

```handlebars
{{! tests/fixtures/with-custom-template/templates/convention-type.ts.hbs }}
// Convention-discovered template
export const ruleName = '{{name}}';
```

```handlebars
{{! tests/fixtures/with-custom-template/my-templates/explicit.ts.hbs }}
// Explicit path template
export const ruleName = '{{name}}';
```

- [ ] **Step 2: Write failing tests for template loader**

```typescript
// tests/engine/template-loader.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { loadTemplate, TemplateLoadError } from '../../src/engine/template-loader';
import * as path from 'path';
import * as fs from 'fs/promises';

const fixturesDir = path.join(__dirname, '../fixtures');
const customTemplateDir = path.join(fixturesDir, 'with-custom-template');

describe('loadTemplate', () => {
  beforeAll(async () => {
    // Ensure fixture directories exist
    await fs.mkdir(path.join(customTemplateDir, 'templates'), { recursive: true });
    await fs.mkdir(path.join(customTemplateDir, 'my-templates'), { recursive: true });

    // Create convention template
    await fs.writeFile(
      path.join(customTemplateDir, 'templates', 'convention-type.ts.hbs'),
      '// Convention template\nexport const name = "{{name}}";'
    );

    // Create explicit template
    await fs.writeFile(
      path.join(customTemplateDir, 'my-templates', 'explicit.ts.hbs'),
      '// Explicit template\nexport const name = "{{name}}";'
    );
  });

  it('loads template from explicit path in config', async () => {
    const result = await loadTemplate(
      'explicit-custom',
      { 'explicit-custom': './my-templates/explicit.ts.hbs' },
      customTemplateDir
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.source.type).toBe('explicit');
      expect(result.source.content).toContain('Explicit template');
    }
  });

  it('loads template from convention path (templates/ directory)', async () => {
    const result = await loadTemplate('convention-type', {}, customTemplateDir);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.source.type).toBe('convention');
      expect(result.source.content).toContain('Convention template');
    }
  });

  it('loads built-in template when no custom template found', async () => {
    const result = await loadTemplate('import-restriction', {}, customTemplateDir);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.source.type).toBe('builtin');
    }
  });

  it('returns error for unknown template type', async () => {
    const result = await loadTemplate('unknown-type', {}, customTemplateDir);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(TemplateLoadError);
      expect(result.error.code).toBe('TEMPLATE_NOT_FOUND');
    }
  });

  it('explicit path takes priority over convention', async () => {
    // Create a convention template with same type name
    await fs.writeFile(
      path.join(customTemplateDir, 'templates', 'explicit-custom.ts.hbs'),
      '// Should not be used'
    );

    const result = await loadTemplate(
      'explicit-custom',
      { 'explicit-custom': './my-templates/explicit.ts.hbs' },
      customTemplateDir
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.source.type).toBe('explicit');
      expect(result.source.content).toContain('Explicit template');
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/linter-gen && pnpm test -- tests/engine/template-loader.test.ts`
Expected: FAIL - module not found

- [ ] **Step 4: Write template loader implementation**

```typescript
// src/engine/template-loader.ts
import * as fs from 'fs/promises';
import * as path from 'path';

export type TemplateSourceType = 'explicit' | 'convention' | 'builtin';

export interface TemplateSource {
  type: TemplateSourceType;
  path: string;
  content: string;
}

export type TemplateLoadErrorCode =
  | 'TEMPLATE_NOT_FOUND'
  | 'TEMPLATE_READ_ERROR';

export class TemplateLoadError extends Error {
  constructor(
    message: string,
    public readonly code: TemplateLoadErrorCode,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TemplateLoadError';
  }
}

export type LoadTemplateResult =
  | { success: true; source: TemplateSource }
  | { success: false; error: TemplateLoadError };

const BUILTIN_TEMPLATES = ['import-restriction', 'boundary-validation', 'dependency-graph'];

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load template content from a file
 */
async function loadTemplateFile(
  filePath: string,
  type: TemplateSourceType
): Promise<LoadTemplateResult> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return {
      success: true,
      source: { type, path: filePath, content },
    };
  } catch (err) {
    return {
      success: false,
      error: new TemplateLoadError(
        `Failed to read template: ${filePath}`,
        'TEMPLATE_READ_ERROR',
        err
      ),
    };
  }
}

/**
 * Load a template by type, checking in order:
 * 1. Explicit path from templates config
 * 2. Convention path: ./templates/{type}.ts.hbs
 * 3. Built-in templates from package
 */
export async function loadTemplate(
  ruleType: string,
  templatesConfig: Record<string, string> | undefined,
  configDir: string
): Promise<LoadTemplateResult> {
  // 1. Check explicit path
  if (templatesConfig?.[ruleType]) {
    const explicitPath = path.resolve(configDir, templatesConfig[ruleType]);
    if (await fileExists(explicitPath)) {
      return loadTemplateFile(explicitPath, 'explicit');
    }
    return {
      success: false,
      error: new TemplateLoadError(
        `Explicit template not found: ${explicitPath}`,
        'TEMPLATE_NOT_FOUND'
      ),
    };
  }

  // 2. Check convention path
  const conventionPath = path.join(configDir, 'templates', `${ruleType}.ts.hbs`);
  if (await fileExists(conventionPath)) {
    return loadTemplateFile(conventionPath, 'convention');
  }

  // 3. Check built-in templates
  if (BUILTIN_TEMPLATES.includes(ruleType)) {
    const builtinPath = path.join(__dirname, '..', 'templates', `${ruleType}.ts.hbs`);
    if (await fileExists(builtinPath)) {
      return loadTemplateFile(builtinPath, 'builtin');
    }
  }

  // Template not found
  return {
    success: false,
    error: new TemplateLoadError(
      `Template not found for type '${ruleType}'. ` +
        `Checked: explicit config, ./templates/${ruleType}.ts.hbs, built-in templates.`,
      'TEMPLATE_NOT_FOUND'
    ),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/linter-gen && pnpm test -- tests/engine/template-loader.test.ts`
Expected: PASS

- [ ] **Step 6: Commit template loader**

```bash
git add packages/linter-gen/src/engine/template-loader.ts packages/linter-gen/tests/engine/template-loader.test.ts packages/linter-gen/tests/fixtures/with-custom-template
git commit -m "feat(linter-gen): add template loader with priority resolution"
```

---

## Chunk 4: Generator

### Task 7: Implement rule generator

**Files:**
- Create: `packages/linter-gen/src/generator/rule-generator.ts`
- Create: `packages/linter-gen/tests/generator/rule-generator.test.ts`

- [ ] **Step 1: Write failing tests for rule generator**

```typescript
// tests/generator/rule-generator.test.ts
import { describe, it, expect } from 'vitest';
import { generateRule, type GeneratedRule } from '../../src/generator/rule-generator';
import type { RuleConfig } from '../../src/schema/linter-config';
import type { TemplateSource } from '../../src/engine/template-loader';

describe('generateRule', () => {
  const mockTemplate: TemplateSource = {
    type: 'builtin',
    path: '/path/to/template.ts.hbs',
    content: `// Generated rule: {{name}}
export default {
  name: '{{name}}',
  severity: '{{severity}}',
  config: {{{json config}}},
};`,
  };

  it('generates rule file from template and config', () => {
    const rule: RuleConfig = {
      name: 'no-ui-in-services',
      type: 'import-restriction',
      severity: 'error',
      config: {
        source: 'src/services/**',
        forbiddenImports: ['react'],
      },
    };

    const result = generateRule(rule, mockTemplate, './generated', '/config.yml');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.rule.name).toBe('no-ui-in-services');
      expect(result.rule.outputPath).toBe('generated/no-ui-in-services.ts');
      expect(result.rule.content).toContain("name: 'no-ui-in-services'");
      expect(result.rule.content).toContain("severity: 'error'");
      expect(result.rule.content).toContain('"forbiddenImports":["react"]');
    }
  });

  it('returns error if template rendering fails', () => {
    const rule: RuleConfig = {
      name: 'test-rule',
      type: 'test',
      severity: 'warn',
      config: {},
    };

    const badTemplate: TemplateSource = {
      type: 'convention',
      path: '/path/to/bad.ts.hbs',
      content: '{{#if unclosed}',
    };

    const result = generateRule(rule, badTemplate, './generated', '/config.yml');

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/linter-gen && pnpm test -- tests/generator/rule-generator.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Write rule generator implementation**

```typescript
// src/generator/rule-generator.ts
import * as path from 'path';
import type { RuleConfig } from '../schema/linter-config';
import type { TemplateSource } from '../engine/template-loader';
import { buildRuleContext } from '../engine/context-builder';
import { renderTemplate, TemplateError } from '../engine/template-renderer';

export interface GeneratedRule {
  name: string;
  outputPath: string;
  content: string;
}

export type GenerateRuleResult =
  | { success: true; rule: GeneratedRule }
  | { success: false; error: TemplateError; ruleName: string };

/**
 * Generate a single ESLint rule file from config and template
 */
export function generateRule(
  rule: RuleConfig,
  template: TemplateSource,
  outputDir: string,
  configPath: string
): GenerateRuleResult {
  // Build template context
  const context = buildRuleContext(rule, configPath);

  // Render template
  const renderResult = renderTemplate(template.content, context);
  if (!renderResult.success) {
    return {
      success: false,
      error: renderResult.error,
      ruleName: rule.name,
    };
  }

  // Construct output path
  const outputPath = path.join(outputDir, `${rule.name}.ts`);

  return {
    success: true,
    rule: {
      name: rule.name,
      outputPath,
      content: renderResult.output,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/linter-gen && pnpm test -- tests/generator/rule-generator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit rule generator**

```bash
git add packages/linter-gen/src/generator/rule-generator.ts packages/linter-gen/tests/generator/rule-generator.test.ts
git commit -m "feat(linter-gen): add rule generator"
```

---

### Task 8: Implement index generator

**Files:**
- Create: `packages/linter-gen/src/generator/index-generator.ts`
- Create: `packages/linter-gen/tests/generator/index-generator.test.ts`

- [ ] **Step 1: Write failing tests for index generator**

```typescript
// tests/generator/index-generator.test.ts
import { describe, it, expect } from 'vitest';
import { generateIndex } from '../../src/generator/index-generator';

describe('generateIndex', () => {
  it('generates index file with imports and exports', () => {
    const ruleNames = ['no-ui-in-services', 'api-boundary-validation', 'no-cycles'];
    const result = generateIndex(ruleNames);

    // Check imports
    expect(result).toContain("import noUiInServices from './no-ui-in-services';");
    expect(result).toContain("import apiBoundaryValidation from './api-boundary-validation';");
    expect(result).toContain("import noCycles from './no-cycles';");

    // Check rules object
    expect(result).toContain("'no-ui-in-services': noUiInServices,");
    expect(result).toContain("'api-boundary-validation': apiBoundaryValidation,");
    expect(result).toContain("'no-cycles': noCycles,");

    // Check named exports
    expect(result).toContain('export { noUiInServices, apiBoundaryValidation, noCycles };');
  });

  it('handles single rule', () => {
    const ruleNames = ['only-rule'];
    const result = generateIndex(ruleNames);

    expect(result).toContain("import onlyRule from './only-rule';");
    expect(result).toContain("'only-rule': onlyRule,");
    expect(result).toContain('export { onlyRule };');
  });

  it('includes generation header comment', () => {
    const result = generateIndex(['test-rule']);
    expect(result).toContain('Generated by @harness-engineering/linter-gen');
    expect(result).toContain('Do not edit manually');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/linter-gen && pnpm test -- tests/generator/index-generator.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Write index generator implementation**

```typescript
// src/generator/index-generator.ts

/**
 * Convert kebab-case to camelCase
 */
function toCamelCase(str: string): string {
  return str.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
}

/**
 * Generate the index.ts file that exports all generated rules
 */
export function generateIndex(ruleNames: string[]): string {
  const imports = ruleNames
    .map((name) => {
      const camel = toCamelCase(name);
      return `import ${camel} from './${name}';`;
    })
    .join('\n');

  const rulesObject = ruleNames
    .map((name) => {
      const camel = toCamelCase(name);
      return `  '${name}': ${camel},`;
    })
    .join('\n');

  const namedExports = ruleNames.map(toCamelCase).join(', ');

  return `// Generated by @harness-engineering/linter-gen
// Do not edit manually - regenerate from harness-linter.yml

${imports}

export const rules = {
${rulesObject}
};

export { ${namedExports} };
`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/linter-gen && pnpm test -- tests/generator/index-generator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit index generator**

```bash
git add packages/linter-gen/src/generator/index-generator.ts packages/linter-gen/tests/generator/index-generator.test.ts
git commit -m "feat(linter-gen): add index file generator"
```

---

### Task 9: Implement orchestrator

**Files:**
- Create: `packages/linter-gen/src/generator/orchestrator.ts`
- Create: `packages/linter-gen/tests/generator/orchestrator.test.ts`

- [ ] **Step 1: Write failing tests for orchestrator**

```typescript
// tests/generator/orchestrator.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generate, validate, type GenerateOptions } from '../../src/generator/orchestrator';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('orchestrator', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'linter-gen-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('validate', () => {
    it('returns success for valid config', async () => {
      const configPath = path.join(tempDir, 'harness-linter.yml');
      await fs.writeFile(
        configPath,
        `version: 1
output: ./generated
rules:
  - name: test-rule
    type: import-restriction
    config:
      source: "src/**"
      forbiddenImports: ["react"]
      message: "No React"
`
      );

      const result = await validate({ configPath });
      expect(result.success).toBe(true);
    });

    it('returns error for invalid config', async () => {
      const configPath = path.join(tempDir, 'harness-linter.yml');
      await fs.writeFile(configPath, 'version: 2\nrules: []');

      const result = await validate({ configPath });
      expect(result.success).toBe(false);
    });
  });

  describe('generate', () => {
    it('generates rule files to output directory', async () => {
      const configPath = path.join(tempDir, 'harness-linter.yml');
      const outputDir = path.join(tempDir, 'generated');

      await fs.writeFile(
        configPath,
        `version: 1
output: ${outputDir}
rules:
  - name: test-rule
    type: import-restriction
    config:
      source: "src/**"
      forbiddenImports: ["react"]
      message: "No React"
`
      );

      const result = await generate({ configPath });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.rulesGenerated).toContain('test-rule');
        expect(result.outputDir).toBe(outputDir);

        // Verify files were created
        const ruleExists = await fs.access(path.join(outputDir, 'test-rule.ts')).then(() => true).catch(() => false);
        const indexExists = await fs.access(path.join(outputDir, 'index.ts')).then(() => true).catch(() => false);
        expect(ruleExists).toBe(true);
        expect(indexExists).toBe(true);
      }
    });

    it('respects outputDir override', async () => {
      const configPath = path.join(tempDir, 'harness-linter.yml');
      const customOutput = path.join(tempDir, 'custom-output');

      await fs.writeFile(
        configPath,
        `version: 1
output: ./default-output
rules:
  - name: test-rule
    type: import-restriction
    config:
      source: "src/**"
      forbiddenImports: []
      message: "Test"
`
      );

      const result = await generate({ configPath, outputDir: customOutput });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.outputDir).toBe(customOutput);
      }
    });

    it('dryRun does not write files', async () => {
      const configPath = path.join(tempDir, 'harness-linter.yml');
      const outputDir = path.join(tempDir, 'generated');

      await fs.writeFile(
        configPath,
        `version: 1
output: ${outputDir}
rules:
  - name: test-rule
    type: import-restriction
    config:
      source: "src/**"
      forbiddenImports: []
      message: "Test"
`
      );

      const result = await generate({ configPath, dryRun: true });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.rulesGenerated).toContain('test-rule');
        // Directory should not exist
        const dirExists = await fs.access(outputDir).then(() => true).catch(() => false);
        expect(dirExists).toBe(false);
      }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/linter-gen && pnpm test -- tests/generator/orchestrator.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Write orchestrator implementation**

```typescript
// src/generator/orchestrator.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { parseConfig, type ParseError } from '../parser/config-parser';
import { loadTemplate, type TemplateLoadError } from '../engine/template-loader';
import { generateRule } from './rule-generator';
import { generateIndex } from './index-generator';
import type { TemplateError } from '../engine/template-renderer';

export interface GenerateOptions {
  /** Path to harness-linter.yml */
  configPath: string;
  /** Override output directory from config */
  outputDir?: string;
  /** Remove existing files before generating */
  clean?: boolean;
  /** Preview without writing files */
  dryRun?: boolean;
}

export interface ValidateOptions {
  configPath: string;
}

export type GeneratorError =
  | { type: 'parse'; error: ParseError }
  | { type: 'template'; error: TemplateLoadError; ruleName: string }
  | { type: 'render'; error: TemplateError; ruleName: string }
  | { type: 'write'; error: Error; path: string };

export type GenerateResult =
  | {
      success: true;
      rulesGenerated: string[];
      outputDir: string;
      dryRun: boolean;
    }
  | {
      success: false;
      errors: GeneratorError[];
    };

export type ValidateResult =
  | { success: true; ruleCount: number }
  | { success: false; error: ParseError };

/**
 * Validate a harness-linter.yml config without generating
 */
export async function validate(options: ValidateOptions): Promise<ValidateResult> {
  const parseResult = await parseConfig(options.configPath);
  if (!parseResult.success) {
    return { success: false, error: parseResult.error };
  }
  return { success: true, ruleCount: parseResult.data.rules.length };
}

/**
 * Generate ESLint rules from harness-linter.yml config
 */
export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const errors: GeneratorError[] = [];

  // Parse config
  const parseResult = await parseConfig(options.configPath);
  if (!parseResult.success) {
    return { success: false, errors: [{ type: 'parse', error: parseResult.error }] };
  }

  const config = parseResult.data;
  const configDir = path.dirname(path.resolve(options.configPath));
  const outputDir = options.outputDir
    ? path.resolve(options.outputDir)
    : path.resolve(configDir, config.output);

  // Clean output directory if requested
  if (options.clean && !options.dryRun) {
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch {
      // Ignore errors - directory might not exist
    }
  }

  // Create output directory
  if (!options.dryRun) {
    await fs.mkdir(outputDir, { recursive: true });
  }

  const generatedRules: string[] = [];

  // Generate each rule
  for (const rule of config.rules) {
    // Load template
    const templateResult = await loadTemplate(rule.type, config.templates, configDir);
    if (!templateResult.success) {
      errors.push({
        type: 'template',
        error: templateResult.error,
        ruleName: rule.name,
      });
      continue;
    }

    // Generate rule
    const ruleResult = generateRule(
      rule,
      templateResult.source,
      outputDir,
      options.configPath
    );
    if (!ruleResult.success) {
      errors.push({
        type: 'render',
        error: ruleResult.error,
        ruleName: ruleResult.ruleName,
      });
      continue;
    }

    // Write file
    if (!options.dryRun) {
      try {
        await fs.writeFile(ruleResult.rule.outputPath, ruleResult.rule.content, 'utf-8');
      } catch (err) {
        errors.push({
          type: 'write',
          error: err as Error,
          path: ruleResult.rule.outputPath,
        });
        continue;
      }
    }

    generatedRules.push(rule.name);
  }

  // Generate index file
  if (generatedRules.length > 0 && !options.dryRun) {
    const indexContent = generateIndex(generatedRules);
    const indexPath = path.join(outputDir, 'index.ts');
    try {
      await fs.writeFile(indexPath, indexContent, 'utf-8');
    } catch (err) {
      errors.push({ type: 'write', error: err as Error, path: indexPath });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    rulesGenerated: generatedRules,
    outputDir,
    dryRun: options.dryRun ?? false,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/linter-gen && pnpm test -- tests/generator/orchestrator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit orchestrator**

```bash
git add packages/linter-gen/src/generator/orchestrator.ts packages/linter-gen/tests/generator/orchestrator.test.ts
git commit -m "feat(linter-gen): add generation orchestrator"
```

---

## Chunk 5: Built-in Templates

### Task 10: Create import-restriction template

**Files:**
- Create: `packages/linter-gen/src/templates/import-restriction.ts.hbs`

- [ ] **Step 1: Write import-restriction template**

```handlebars
// Generated by @harness-engineering/linter-gen
// Do not edit manually - regenerate from harness-linter.yml
// Config: {{meta.configPath}}

import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import { minimatch } from 'minimatch';
import * as path from 'path';

const createRule = ESLintUtils.RuleCreator(
  () => 'https://github.com/harness-engineering/linter-gen'
);

type MessageIds = 'forbidden';

const SOURCE_PATTERN = '{{{json config.source}}}';
const FORBIDDEN_IMPORTS: string[] = {{{json config.forbiddenImports}}};
const MESSAGE = '{{{config.message}}}';

/**
 * Normalize path separators to forward slashes
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Check if a path matches a glob pattern
 */
function matchesPattern(filePath: string, pattern: string): boolean {
  const normalized = normalizePath(filePath);
  return minimatch(normalized, pattern, { matchBase: true });
}

export default createRule<[], MessageIds>({
  name: '{{name}}',
  meta: {
    type: 'problem',
    docs: {
      description: MESSAGE,
    },
    messages: {
      forbidden: MESSAGE,
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const filePath = normalizePath(context.filename);

    // Only apply to files matching source pattern
    if (!matchesPattern(filePath, SOURCE_PATTERN)) {
      return {};
    }

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        const importPath = String(node.source.value);

        for (const forbidden of FORBIDDEN_IMPORTS) {
          // Check exact match or pattern match
          if (importPath === forbidden || matchesPattern(importPath, forbidden)) {
            context.report({
              node,
              messageId: 'forbidden',
            });
            return;
          }
        }
      },
    };
  },
});
```

- [ ] **Step 2: Commit import-restriction template**

```bash
git add packages/linter-gen/src/templates/import-restriction.ts.hbs
git commit -m "feat(linter-gen): add import-restriction template"
```

---

### Task 11: Create boundary-validation template

**Files:**
- Create: `packages/linter-gen/src/templates/boundary-validation.ts.hbs`

- [ ] **Step 1: Write boundary-validation template**

```handlebars
// Generated by @harness-engineering/linter-gen
// Do not edit manually - regenerate from harness-linter.yml
// Config: {{meta.configPath}}

import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import { minimatch } from 'minimatch';

const createRule = ESLintUtils.RuleCreator(
  () => 'https://github.com/harness-engineering/linter-gen'
);

type MessageIds = 'missingSchema';

const FILE_PATTERN = '{{{json config.pattern}}}';
const REQUIRE_ZOD_SCHEMA = {{config.requireZodSchema}};
const MESSAGE = '{{{config.message}}}';

/**
 * Normalize path separators to forward slashes
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Check if a path matches a glob pattern
 */
function matchesPattern(filePath: string, pattern: string): boolean {
  const normalized = normalizePath(filePath);
  return minimatch(normalized, pattern, { matchBase: true });
}

/**
 * Check if an identifier looks like Zod usage
 */
function isZodIdentifier(name: string): boolean {
  return name === 'z' || name.startsWith('z.');
}

export default createRule<[], MessageIds>({
  name: '{{name}}',
  meta: {
    type: 'problem',
    docs: {
      description: MESSAGE,
    },
    messages: {
      missingSchema: MESSAGE,
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const filePath = normalizePath(context.filename);

    // Only apply to files matching pattern
    if (!matchesPattern(filePath, FILE_PATTERN)) {
      return {};
    }

    if (!REQUIRE_ZOD_SCHEMA) {
      return {};
    }

    let hasZodSchema = false;
    let hasExport = false;

    return {
      // Check for Zod imports
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (node.source.value === 'zod') {
          hasZodSchema = true;
        }
      },

      // Check for z.object, z.string, etc.
      CallExpression(node: TSESTree.CallExpression) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'z'
        ) {
          hasZodSchema = true;
        }
      },

      // Track exports
      ExportNamedDeclaration() {
        hasExport = true;
      },
      ExportDefaultDeclaration() {
        hasExport = true;
      },

      // Check at end of file
      'Program:exit'(node: TSESTree.Program) {
        if (hasExport && !hasZodSchema) {
          context.report({
            node,
            messageId: 'missingSchema',
          });
        }
      },
    };
  },
});
```

- [ ] **Step 2: Commit boundary-validation template**

```bash
git add packages/linter-gen/src/templates/boundary-validation.ts.hbs
git commit -m "feat(linter-gen): add boundary-validation template"
```

---

### Task 12: Create dependency-graph template

**Files:**
- Create: `packages/linter-gen/src/templates/dependency-graph.ts.hbs`

- [ ] **Step 1: Write dependency-graph template**

```handlebars
// Generated by @harness-engineering/linter-gen
// Do not edit manually - regenerate from harness-linter.yml
// Config: {{meta.configPath}}

import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import { minimatch } from 'minimatch';
import * as path from 'path';

const createRule = ESLintUtils.RuleCreator(
  () => 'https://github.com/harness-engineering/linter-gen'
);

type MessageIds = 'circularDependency';

const ENTRY_POINTS: string[] = {{{json config.entryPoints}}};
const EXCLUDE_PATTERNS: string[] = {{{json config.exclude}}};
const MAX_DEPTH = {{#if config.maxDepth}}{{config.maxDepth}}{{else}}20{{/if}};

/**
 * Normalize path separators to forward slashes
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Check if a path matches any of the exclude patterns
 */
function isExcluded(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  return EXCLUDE_PATTERNS.some((pattern) =>
    minimatch(normalized, pattern, { matchBase: true })
  );
}

// Track imports per file for cycle detection
const importGraph = new Map<string, Set<string>>();

export default createRule<[], MessageIds>({
  name: '{{name}}',
  meta: {
    type: 'problem',
    docs: {
      description: 'Detect circular import dependencies',
    },
    messages: {
      circularDependency:
        'Circular dependency detected: {{cycle}}',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const filePath = normalizePath(context.filename);

    if (isExcluded(filePath)) {
      return {};
    }

    const imports = new Set<string>();

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        const importPath = String(node.source.value);

        // Only track relative imports (internal dependencies)
        if (!importPath.startsWith('.')) {
          return;
        }

        // Resolve to absolute path
        const resolvedPath = normalizePath(
          path.resolve(path.dirname(context.filename), importPath)
        );

        imports.add(resolvedPath);
      },

      'Program:exit'() {
        // Store this file's imports
        importGraph.set(filePath, imports);

        // Check for cycles starting from this file
        const visited = new Set<string>();
        const stack: string[] = [];

        function detectCycle(current: string, depth: number): string[] | null {
          if (depth > MAX_DEPTH) return null;
          if (stack.includes(current)) {
            const cycleStart = stack.indexOf(current);
            return [...stack.slice(cycleStart), current];
          }
          if (visited.has(current)) return null;

          visited.add(current);
          stack.push(current);

          const deps = importGraph.get(current);
          if (deps) {
            for (const dep of deps) {
              const cycle = detectCycle(dep, depth + 1);
              if (cycle) return cycle;
            }
          }

          stack.pop();
          return null;
        }

        const cycle = detectCycle(filePath, 0);
        if (cycle) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: 'circularDependency',
            data: {
              cycle: cycle.map((p) => path.basename(p)).join(' → '),
            },
          });
        }
      },
    };
  },
});
```

- [ ] **Step 2: Commit dependency-graph template**

```bash
git add packages/linter-gen/src/templates/dependency-graph.ts.hbs
git commit -m "feat(linter-gen): add dependency-graph template"
```

---

### Task 13: Create public API entry point

**Files:**
- Create: `packages/linter-gen/src/index.ts`

- [ ] **Step 1: Write public API exports**

```typescript
// src/index.ts
/**
 * @harness-engineering/linter-gen
 *
 * Generate ESLint rules from YAML configuration
 */

// Main API
export { generate, validate } from './generator/orchestrator';
export type {
  GenerateOptions,
  ValidateOptions,
  GenerateResult,
  ValidateResult,
  GeneratorError,
} from './generator/orchestrator';

// Schema types
export { LinterConfigSchema, RuleConfigSchema } from './schema/linter-config';
export type { LinterConfig, RuleConfig } from './schema/linter-config';

// Engine types (for advanced usage)
export type { RuleContext } from './engine/context-builder';
export type { TemplateSource, TemplateSourceType } from './engine/template-loader';

// Error types
export { ParseError } from './parser/config-parser';
export { TemplateLoadError } from './engine/template-loader';
export { TemplateError } from './engine/template-renderer';
```

- [ ] **Step 2: Verify package builds**

Run: `cd packages/linter-gen && pnpm build`
Expected: Build succeeds, dist/ directory created with dist/templates/ containing .hbs files

- [ ] **Step 3: Verify templates are copied**

Run: `ls packages/linter-gen/dist/templates/`
Expected:
```
import-restriction.ts.hbs
boundary-validation.ts.hbs
dependency-graph.ts.hbs
```

- [ ] **Step 4: Commit public API**

```bash
git add packages/linter-gen/src/index.ts
git commit -m "feat(linter-gen): add public API entry point"
```

---

## Chunk 6: CLI Integration

### Task 14: Add linter commands to CLI

**Files:**
- Create: `packages/cli/src/commands/linter/index.ts`
- Create: `packages/cli/src/commands/linter/generate.ts`
- Create: `packages/cli/src/commands/linter/validate.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/package.json`

- [ ] **Step 1: Add linter-gen dependency to CLI package**

Add to `packages/cli/package.json` dependencies:
```json
"@harness-engineering/linter-gen": "workspace:*"
```

- [ ] **Step 2: Create generate command**

```typescript
// packages/cli/src/commands/linter/generate.ts
import { Command } from 'commander';
import { generate } from '@harness-engineering/linter-gen';
import { logger } from '../../output/logger';
import { OutputFormatter, OutputMode } from '../../output/formatter';
import { CLIError, ExitCode } from '../../utils/errors';

export function createGenerateCommand(): Command {
  return new Command('generate')
    .description('Generate ESLint rules from harness-linter.yml')
    .option('-c, --config <path>', 'Path to harness-linter.yml', './harness-linter.yml')
    .option('-o, --output <dir>', 'Override output directory')
    .option('--clean', 'Remove existing files before generating')
    .option('--dry-run', 'Preview without writing files')
    .option('--json', 'Output as JSON')
    .option('--verbose', 'Show detailed output')
    .action(async (options) => {
      const formatter = new OutputFormatter(
        options.json ? OutputMode.JSON : OutputMode.TEXT
      );

      try {
        if (options.verbose) {
          logger.info(`Parsing config: ${options.config}`);
        }

        const result = await generate({
          configPath: options.config,
          outputDir: options.output,
          clean: options.clean,
          dryRun: options.dryRun,
        });

        if (!result.success) {
          const errorMessages = result.errors.map((e) => {
            switch (e.type) {
              case 'parse':
                return `Config error: ${e.error.message}`;
              case 'template':
                return `Template error for '${e.ruleName}': ${e.error.message}`;
              case 'render':
                return `Render error for '${e.ruleName}': ${e.error.message}`;
              case 'write':
                return `Write error for '${e.path}': ${e.error.message}`;
            }
          });

          if (options.json) {
            console.log(JSON.stringify({ success: false, errors: errorMessages }, null, 2));
          } else {
            errorMessages.forEach((msg) => logger.error(msg));
          }
          process.exit(ExitCode.ValidationFailed);
        }

        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            outputDir: result.outputDir,
            rulesGenerated: result.rulesGenerated,
            dryRun: result.dryRun,
          }, null, 2));
        } else {
          if (result.dryRun) {
            logger.info('Dry run - no files written');
          }
          result.rulesGenerated.forEach((name) => {
            logger.success(`Generated ${name}.ts`);
          });
          logger.success(`Generated index.ts`);
          logger.info(`\nGenerated ${result.rulesGenerated.length} rules to ${result.outputDir}`);
        }
      } catch (err) {
        throw new CLIError(`Generation failed: ${(err as Error).message}`, ExitCode.Error);
      }
    });
}
```

- [ ] **Step 3: Create validate command**

```typescript
// packages/cli/src/commands/linter/validate.ts
import { Command } from 'commander';
import { validate } from '@harness-engineering/linter-gen';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';

export function createValidateCommand(): Command {
  return new Command('validate')
    .description('Validate harness-linter.yml config')
    .option('-c, --config <path>', 'Path to harness-linter.yml', './harness-linter.yml')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const result = await validate({ configPath: options.config });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.success) {
          logger.success(`Config valid: ${result.ruleCount} rules defined`);
        } else {
          logger.error(`Config invalid: ${result.error.message}`);
          process.exit(ExitCode.ValidationFailed);
        }
      } catch (err) {
        throw new CLIError(`Validation failed: ${(err as Error).message}`, ExitCode.Error);
      }
    });
}
```

- [ ] **Step 4: Create linter parent command**

```typescript
// packages/cli/src/commands/linter/index.ts
import { Command } from 'commander';
import { createGenerateCommand } from './generate';
import { createValidateCommand } from './validate';

export function createLinterCommand(): Command {
  const linter = new Command('linter')
    .description('Generate and validate ESLint rules from YAML config');

  linter.addCommand(createGenerateCommand());
  linter.addCommand(createValidateCommand());

  return linter;
}
```

- [ ] **Step 5: Register linter command in CLI**

Modify `packages/cli/src/index.ts`:

1. Add import at top with other command imports:
```typescript
import { createLinterCommand } from './commands/linter';
```

2. Add command registration after existing `program.addCommand(createAddCommand());` line:
```typescript
program.addCommand(createLinterCommand());
```

The full import section should look like:
```typescript
import { createValidateCommand } from './commands/validate';
import { createCheckDepsCommand } from './commands/check-deps';
import { createCheckDocsCommand } from './commands/check-docs';
import { createInitCommand } from './commands/init';
import { createCleanupCommand } from './commands/cleanup';
import { createFixDriftCommand } from './commands/fix-drift';
import { createAgentCommand } from './commands/agent';
import { createAddCommand } from './commands/add';
import { createLinterCommand } from './commands/linter';
```

- [ ] **Step 6: Install dependencies and verify**

Run: `pnpm install && cd packages/cli && pnpm build`
Expected: Build succeeds

- [ ] **Step 7: Commit CLI integration**

```bash
git add packages/cli/src/commands/linter packages/cli/package.json packages/cli/src/index.ts pnpm-lock.yaml
git commit -m "feat(cli): add harness linter generate/validate commands"
```

---

### Task 15: Add integration tests

**Files:**
- Create: `packages/linter-gen/tests/integration/generate.test.ts`

- [ ] **Step 1: Write integration tests**

```typescript
// tests/integration/generate.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generate } from '../../src/generator/orchestrator';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('integration: generate', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'linter-gen-integration-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('generates working ESLint rules from config', async () => {
    const configPath = path.join(tempDir, 'harness-linter.yml');
    const outputDir = path.join(tempDir, 'generated');

    await fs.writeFile(
      configPath,
      `version: 1
output: ${outputDir}
rules:
  - name: no-react-in-services
    type: import-restriction
    severity: error
    config:
      source: "src/services/**"
      forbiddenImports:
        - "react"
        - "react-dom"
      message: "Service files cannot import React"
`
    );

    const result = await generate({ configPath });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Verify generated rule file
    const ruleContent = await fs.readFile(
      path.join(outputDir, 'no-react-in-services.ts'),
      'utf-8'
    );

    expect(ruleContent).toContain("name: 'no-react-in-services'");
    expect(ruleContent).toContain('Service files cannot import React');
    expect(ruleContent).toContain('"react"');
    expect(ruleContent).toContain('"react-dom"');

    // Verify index file
    const indexContent = await fs.readFile(
      path.join(outputDir, 'index.ts'),
      'utf-8'
    );

    expect(indexContent).toContain("import noReactInServices from './no-react-in-services'");
    expect(indexContent).toContain("'no-react-in-services': noReactInServices");
  });

  it('uses custom template from templates/ directory', async () => {
    const configPath = path.join(tempDir, 'harness-linter.yml');
    const outputDir = path.join(tempDir, 'generated');
    const templatesDir = path.join(tempDir, 'templates');

    await fs.mkdir(templatesDir);
    await fs.writeFile(
      path.join(templatesDir, 'custom-check.ts.hbs'),
      `// Custom template
export const ruleName = '{{name}}';
export const config = {{{json config}}};`
    );

    await fs.writeFile(
      configPath,
      `version: 1
output: ${outputDir}
rules:
  - name: my-custom-rule
    type: custom-check
    config:
      foo: bar
`
    );

    const result = await generate({ configPath });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const ruleContent = await fs.readFile(
      path.join(outputDir, 'my-custom-rule.ts'),
      'utf-8'
    );

    expect(ruleContent).toContain('// Custom template');
    expect(ruleContent).toContain("ruleName = 'my-custom-rule'");
    expect(ruleContent).toContain('"foo":"bar"');
  });

  it('generates multiple rules in single run', async () => {
    const configPath = path.join(tempDir, 'harness-linter.yml');
    const outputDir = path.join(tempDir, 'generated');

    await fs.writeFile(
      configPath,
      `version: 1
output: ${outputDir}
rules:
  - name: rule-one
    type: import-restriction
    config:
      source: "src/**"
      forbiddenImports: ["lodash"]
      message: "No lodash"
  - name: rule-two
    type: import-restriction
    config:
      source: "lib/**"
      forbiddenImports: ["jquery"]
      message: "No jQuery"
`
    );

    const result = await generate({ configPath });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.rulesGenerated).toHaveLength(2);
    expect(result.rulesGenerated).toContain('rule-one');
    expect(result.rulesGenerated).toContain('rule-two');

    // Verify index exports both
    const indexContent = await fs.readFile(
      path.join(outputDir, 'index.ts'),
      'utf-8'
    );
    expect(indexContent).toContain('ruleOne');
    expect(indexContent).toContain('ruleTwo');
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `cd packages/linter-gen && pnpm test -- tests/integration/generate.test.ts`
Expected: PASS

- [ ] **Step 3: Commit integration tests**

```bash
git add packages/linter-gen/tests/integration
git commit -m "test(linter-gen): add integration tests"
```

---

### Task 16: Add README documentation

**Files:**
- Create: `packages/linter-gen/README.md`

- [ ] **Step 1: Write README**

```markdown
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
```

- [ ] **Step 2: Commit README**

```bash
git add packages/linter-gen/README.md
git commit -m "docs(linter-gen): add README with usage examples"
```

---

### Task 17: Final verification

- [ ] **Step 1: Run all tests**

Run: `cd packages/linter-gen && pnpm test`
Expected: All tests pass

- [ ] **Step 2: Build package**

Run: `cd packages/linter-gen && pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Run full monorepo build**

Run: `pnpm build`
Expected: All packages build successfully

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(linter-gen): complete linter generator implementation"
```
