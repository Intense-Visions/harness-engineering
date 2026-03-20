# API Documentation

Welcome to the Harness Engineering API documentation.

## Packages

- **@harness-engineering/types** — Core TypeScript types and interfaces (`Result<T,E>`, workflow types, skill metadata)
- **@harness-engineering/core** — Runtime library (validation, constraints, entropy detection, context generation, feedback, state)
- **@harness-engineering/cli** — CLI tool and template engine (`harness validate`, `harness init`, skill/persona management)
- **@harness-engineering/eslint-plugin** — ESLint rules for architectural constraint enforcement (8 rules)
- **@harness-engineering/linter-gen** — Generate custom ESLint rules from YAML configuration
- **@harness-engineering/graph** — Knowledge graph for codebase relationships, context assembly, and entropy detection
- **@harness-engineering/mcp-server** — MCP server exposing 37 tools and 8 resources for AI agent integration

> **Note:** Package-specific API reference pages are not yet generated. Use TypeScript definitions in each package's `dist/index.d.ts` for the authoritative API surface.

## Overview

The Harness Engineering API is designed with agents in mind. All functions return `Result<T, E>` types for consistent error handling, and all data structures are JSON-serializable.

### Result Type

```typescript
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
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
