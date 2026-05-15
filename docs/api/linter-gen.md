# @harness-engineering/linter-gen

Generate ESLint rules from YAML configuration files. Define custom linting rules declaratively and generate the TypeScript ESLint rule implementations.

**Version:** 0.1.7

## Installation

```bash
npm install @harness-engineering/linter-gen
```

## Overview

This package reads a `harness-linter.yml` configuration file, validates it, and generates ESLint rule source files from Handlebars templates.

```typescript
import { generate, validate } from '@harness-engineering/linter-gen';

// Validate config only
const valid = await validate({ configPath: './harness-linter.yml' });

// Generate rules
const result = await generate({
  configPath: './harness-linter.yml',
  outputDir: './generated-rules',
  clean: true,
});
```

## API

### `generate(options)`

```typescript
function generate(options: GenerateOptions): Promise<GenerateResult>;
```

Generates ESLint rule files from a YAML config. Parses the config, loads templates, renders each rule, and writes output files.

### `validate(options)`

```typescript
function validate(options: ValidateOptions): Promise<ValidateResult>;
```

Validates a `harness-linter.yml` config file without generating any output.

## Types

### `GenerateOptions`

```typescript
interface GenerateOptions {
  configPath: string; // Path to harness-linter.yml
  outputDir?: string; // Override output directory
  clean?: boolean; // Remove existing files first
  dryRun?: boolean; // Preview without writing
}
```

### `ValidateOptions`

```typescript
interface ValidateOptions {
  configPath: string;
}
```

### `GenerateResult`

```typescript
type GenerateResult =
  | { success: true; rulesGenerated: string[]; outputDir: string; dryRun: boolean }
  | { success: false; errors: GeneratorError[] };
```

### `ValidateResult`

```typescript
type ValidateResult = { success: true; ruleCount: number } | { success: false; error: ParseError };
```

### `GeneratorError`

```typescript
type GeneratorError =
  | { type: 'parse'; error: ParseError }
  | { type: 'template'; error: TemplateLoadError; ruleName: string }
  | { type: 'render'; error: TemplateError; ruleName: string }
  | { type: 'write'; error: Error; path: string };
```

## Schema Exports

### `LinterConfigSchema` / `RuleConfigSchema`

Zod schemas for validating configuration objects programmatically.

```typescript
import { LinterConfigSchema } from '@harness-engineering/linter-gen';

const parsed = LinterConfigSchema.parse(rawConfig);
```

**Types:** `LinterConfig`, `RuleConfig`

## Advanced Types

### `RuleContext`

Context object passed to templates during rule generation.

### `TemplateSource` / `TemplateSourceType`

Types describing where templates are loaded from (built-in, file path, or inline string).

## Error Classes

### `ParseError`

Thrown when YAML config parsing fails.

### `TemplateLoadError`

Thrown when a template file cannot be loaded.

### `TemplateError`

Thrown when Handlebars template rendering fails.
