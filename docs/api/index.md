# API Documentation

Welcome to the Harness Engineering API documentation.

## Packages

- [@harness-engineering/types](/api/types) - Core TypeScript types and interfaces
- [@harness-engineering/core](/api/core) - Core library implementation

## Overview

The Harness Engineering API is designed with agents in mind. All functions return `Result<T, E>` types for consistent error handling, and all data structures are JSON-serializable.

### Result Type

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

This pattern ensures that errors are always explicit and must be handled by the caller.

## Getting Started

```typescript
import { Result } from '@harness-engineering/types';
import { validateAgentsMap } from '@harness-engineering/core';

const result = validateAgentsMap('./AGENTS.md');
if (!result.ok) {
  console.error(result.error.message);
  process.exit(1);
}

console.log('Validation passed!', result.value);
```

See the package-specific documentation for detailed API references.
