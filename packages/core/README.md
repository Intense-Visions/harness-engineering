# @harness-engineering/core

Core library for Harness Engineering toolkit - provides runtime APIs for context engineering, architectural constraints, agent feedback, and entropy management.

## Installation

```bash
pnpm add @harness-engineering/core
```

## Modules

### Validation Module

Cross-cutting validation utilities used by all other modules.

#### File Structure Validation

Verify project follows file structure conventions:

```typescript
import { validateFileStructure, type Convention } from '@harness-engineering/core';

const conventions: Convention[] = [
  {
    pattern: 'README.md',
    required: true,
    description: 'Project README',
    examples: ['README.md'],
  },
  {
    pattern: 'AGENTS.md',
    required: true,
    description: 'Knowledge map',
    examples: ['AGENTS.md'],
  },
];

const result = await validateFileStructure(conventions, './my-project');

if (result.ok) {
  console.log('Valid:', result.value.valid);
  console.log('Conformance:', result.value.conformance + '%');
  console.log('Missing:', result.value.missing);
} else {
  console.error('Error:', result.error.message);
}
```

#### Config Validation

Type-safe configuration validation with Zod:

```typescript
import { validateConfig } from '@harness-engineering/core';
import { z } from 'zod';

const ConfigSchema = z.object({
  version: z.number(),
  layers: z.array(z.object({
    name: z.string(),
    allowedDependencies: z.array(z.string()),
  })),
});

const result = validateConfig(userConfig, ConfigSchema);

if (result.ok) {
  // TypeScript knows result.value matches ConfigSchema
  console.log('Config version:', result.value.version);
} else {
  console.error('Validation failed:', result.error.message);
  console.error('Suggestions:', result.error.suggestions);
}
```

#### Commit Message Validation

Validate commit messages follow conventional format:

```typescript
import { validateCommitMessage } from '@harness-engineering/core';

const result = validateCommitMessage('feat(core): add validation module', 'conventional');

if (result.ok) {
  if (result.value.valid) {
    console.log('Type:', result.value.type);      // 'feat'
    console.log('Scope:', result.value.scope);    // 'core'
    console.log('Breaking:', result.value.breaking); // false
  } else {
    console.log('Issues:', result.value.issues);
  }
}
```

## Error Handling

All APIs use the `Result<T, E>` pattern for type-safe error handling:

```typescript
import { type Result, Ok, Err } from '@harness-engineering/core';

const result: Result<string, Error> = Ok('success');

if (result.ok) {
  console.log(result.value); // TypeScript knows this is string
} else {
  console.error(result.error); // TypeScript knows this is Error
}
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Type checking
pnpm typecheck

# Build
pnpm build

# Lint
pnpm lint
```

## License

MIT
