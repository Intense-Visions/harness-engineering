---
type: business_rule
domain: architecture
tags: [layers, imports, dependencies, boundaries]
---

# Layer Boundary Enforcement

The harness-engineering monorepo enforces strict layer boundaries to prevent architectural erosion. Nine layers are defined in `harness.config.json`, each with explicit allowed dependencies:

1. **types** - Foundation types with zero dependencies
2. **graph** - Knowledge graph store, ingestors, and query engine (depends on: types)
3. **core** - Shared utilities, state management, learnings (depends on: types, graph)
4. **eslint-plugin** - Custom ESLint rules (depends on: types, core)
5. **linter-gen** - Linter configuration generator (depends on: types, core)
6. **intelligence** - AI-powered analysis (depends on: types, graph)
7. **orchestrator** - Workflow orchestration (depends on: types, core, intelligence)
8. **dashboard** - Web dashboard (depends on: types, core, graph)
9. **cli** - CLI and MCP server (depends on: types, core, graph, linter-gen, orchestrator)

Imports that violate layer boundaries are forbidden via the `forbiddenImports` configuration. The architecture threshold for layer violations is zero — any violation fails validation.

Lower layers must never import from higher layers. This ensures that foundational packages (types, graph, core) remain stable and independently testable.
