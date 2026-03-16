# Harness Engineering

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io/)

**Self-contained toolkit for agent-first development.**

Human engineers design constraints and feedback loops. AI agents execute, maintain, and improve code within those constraints. Harness Engineering provides the mechanical enforcement, behavioral guidance, and state management that makes this work.

## Quick Start

The fastest way to understand harness engineering is to explore the examples:

```bash
# Clone the repo
git clone https://github.com/harness-engineering/harness-engineering.git
cd harness-engineering

# Try the simplest example
cd examples/hello-world
npm install
harness validate
```

See the [examples](#examples) section for the full progression.

## What's in the Box

| Component                              | Count | What it does                                                                                 |
| -------------------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| [Packages](./packages/)                | 6     | Core library, CLI, ESLint plugin, linter generator, MCP server, shared types                 |
| [Skills](./agents/skills/claude-code/) | 21    | Rigid and flexible workflows for TDD, execution, debugging, verification, planning, and more |
| [Personas](./agents/personas/)         | 3     | Architecture enforcer, documentation maintainer, entropy cleaner                             |
| [Templates](./templates/)              | 4     | Basic, intermediate, advanced, Next.js — progressive adoption scaffolds                      |
| [Examples](./examples/)                | 3     | Hello world, task API, multi-tenant API — progressive tutorials                              |

## Packages

| Package                                                          | Description                                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [`@harness-engineering/types`](./packages/types)                 | Shared TypeScript types and interfaces                                                                                   |
| [`@harness-engineering/core`](./packages/core)                   | Core runtime: validation, constraints, entropy detection, state management                                               |
| [`@harness-engineering/cli`](./packages/cli)                     | CLI: `harness validate`, `check-deps`, `skill run`, `state show`, and more                                               |
| [`@harness-engineering/eslint-plugin`](./packages/eslint-plugin) | 5 ESLint rules: no-layer-violation, no-circular-deps, no-forbidden-imports, require-boundary-schema, enforce-doc-exports |
| [`@harness-engineering/linter-gen`](./packages/linter-gen)       | Generate custom ESLint rules from YAML configuration                                                                     |
| [`@harness-engineering/mcp-server`](./packages/mcp-server)       | MCP server with 15 tools for AI agent integration                                                                        |

## Examples

Three progressive examples, each building on the previous:

### 1. [Hello World](./examples/hello-world/) (Basic) — 5 minutes

Minimal project: config, validation, AGENTS.md. See what a harness-managed project looks like.

### 2. [Task API](./examples/task-api/) (Intermediate) — 15 minutes

Express API with 3-layer architecture enforced by ESLint. Try breaking a constraint and watch harness catch it.

### 3. [Multi-Tenant API](./examples/multi-tenant-api/) (Advanced) — 30 minutes

Custom linter rules, Zod boundary validation, cross-artifact checking, all 3 personas, and full state lifecycle.

## The Six Principles

1. **Context Engineering** — Repository-as-documentation, everything in git
2. **Architectural Constraints** — Mechanical enforcement of dependencies and boundaries
3. **Agent Feedback Loop** — Self-correcting agents with peer review
4. **Entropy Management** — Automated cleanup and drift detection
5. **Implementation Strategy** — Depth-first, one feature to 100% completion
6. **Key Performance Indicators** — Agent autonomy, harness coverage, context density

Read the full standard: [docs/standard/](./docs/standard/)

## Project Structure

```
harness-engineering/
├── packages/                  # Runtime libraries and tools
│   ├── types/                # Shared TypeScript types
│   ├── core/                 # Core runtime library
│   ├── cli/                  # CLI tool
│   ├── eslint-plugin/        # ESLint rules for constraint enforcement
│   ├── linter-gen/           # YAML-to-ESLint rule generator
│   └── mcp-server/           # MCP server for AI agent integration
├── agents/                    # Agent configuration
│   ├── skills/               # 21 skills (skill.yaml + SKILL.md each)
│   └── personas/             # 3 personas (YAML configs)
├── templates/                 # Project scaffolding templates
│   ├── basic/                # Minimal harness setup
│   ├── intermediate/         # Layers + ESLint + personas
│   ├── advanced/             # Full feature set
│   └── nextjs/               # Next.js overlay
├── examples/                  # Progressive tutorial examples
│   ├── hello-world/          # Basic adoption level
│   ├── task-api/             # Intermediate adoption level
│   └── multi-tenant-api/     # Advanced adoption level
├── docs/                      # Documentation
│   ├── standard/             # The six principles
│   ├── guides/               # Getting started, best practices
│   ├── specs/                # Technical specifications
│   └── plans/                # Implementation plans
└── AGENTS.md                  # AI agent knowledge map
```

## Documentation

- [The Standard](./docs/standard/index.md) — Six core principles
- [Getting Started](./docs/guides/getting-started.md) — Quick start via examples
- [Implementation Guide](./docs/standard/implementation.md) — Adoption levels and rollout
- [API Reference](./docs/reference/) — Configuration and CLI docs

## License

MIT License — see [LICENSE](./LICENSE) for details.
