# API Documentation

Welcome to the Harness Engineering API documentation.

## Packages

- **[@harness-engineering/types](types.md)** — Core TypeScript types and interfaces (`Result<T,E>`, workflow types, skill metadata)
- **[@harness-engineering/orchestrator](orchestrator.md)** — Daemon core, state machine, agent runner, and TUI launcher
- **[@harness-engineering/core](core.md)** — Runtime library (validation, constraints, entropy detection, context generation, feedback, state)
- **[@harness-engineering/cli](cli.md)** — CLI tool and template engine (`harness validate`, `harness init`, skill/persona management)
- **[@harness-engineering/eslint-plugin](eslint-plugin.md)** — ESLint rules for architectural constraint enforcement (11 rules)
- **[@harness-engineering/linter-gen](linter-gen.md)** — Generate custom ESLint rules from YAML configuration
- **[@harness-engineering/graph](graph.md)** — Knowledge graph for codebase relationships, context assembly, and entropy detection
- **[@harness-engineering/mcp-server](mcp-server.md)** — _(Deprecated)_ MCP server now included in `@harness-engineering/cli`

## Overview

The Harness Engineering API is designed with agents in mind. All functions return `Result<T, E>` types for consistent error handling, and all data structures are JSON-serializable.

### Result Type

```typescript
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
```

This pattern ensures that errors are always explicit and must be handled by the caller.

## Getting Started

```typescript
import { Assembler } from '@harness-engineering/graph';
import type { GraphCoverageReport } from '@harness-engineering/graph';

const store = new GraphStore();
const assembler = new Assembler(store);
const report: GraphCoverageReport = assembler.checkCoverage();
console.log('Coverage check passed!', report);
```

See the package-specific documentation for detailed API references.
