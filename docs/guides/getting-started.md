# Getting Started with Harness Engineering

The fastest way to learn harness engineering is to explore the examples. Each one builds on the previous, progressing from basic configuration to full constraint enforcement.

## Prerequisites

- **Node.js 22+** — [nodejs.org](https://nodejs.org/)
- **pnpm 8+** — `npm install -g pnpm`
- **Git**

```bash
node --version   # 22+
pnpm --version   # 8+
```

## Quick Start: Try an Example

### 1. Hello World (Basic) — 5 minutes

```bash
cd examples/hello-world
npm install
harness validate
```

See what a harness-managed project looks like at the simplest level: configuration, validation, and an agent knowledge map.

[Read the full tutorial](../../examples/hello-world/README.md)

### 2. Task API (Intermediate) — 15 minutes

```bash
cd examples/task-api
npm install
npm test && npm run lint
```

A REST API with 3-layer architecture enforced by `@harness-engineering/eslint-plugin`. Try breaking a constraint — see [VIOLATIONS.md](../../examples/task-api/VIOLATIONS.md) for exercises.

[Read the full tutorial](../../examples/task-api/README.md)

### 3. Multi-Tenant API (Advanced) — 30 minutes

```bash
cd examples/multi-tenant-api
npm install
npm test && npm run lint && harness validate --cross-check
```

Custom linter rules, Zod boundary validation, cross-artifact checking, all 3 personas, and a full state management lifecycle.

[Read the full tutorial](../../examples/multi-tenant-api/README.md)

## Starting Your Own Project

Once you've explored the examples, initialize your own project:

```bash
# If installed globally
harness init --name my-project --level intermediate

# Or via npx
npx @harness-engineering/cli init --name my-project --level intermediate
```

This scaffolds a project using the intermediate template with layer definitions, ESLint rules, and an AGENTS.md.

### Adoption Levels

| Level            | What you get                                                       | When to use                       |
| ---------------- | ------------------------------------------------------------------ | --------------------------------- |
| **Basic**        | Config + validation + AGENTS.md                                    | Learning harness, simple projects |
| **Intermediate** | + Layer enforcement, ESLint rules, personas                        | Most production projects          |
| **Advanced**     | + Custom linter rules, boundary schemas, cross-artifact validation | Complex architectures, multi-team |

See [Implementation Guide](../standard/implementation.md) for the full adoption roadmap.

## Key Concepts

### Layers

Architectural layers with one-way dependencies, enforced by ESLint:

```
types/     → (no imports from upper layers)
services/  → can import from types
api/       → can import from types, services
```

Defined in `harness.config.json`, enforced by `@harness-engineering/no-layer-violation`.

### Skills

26 workflow skills that guide agent behavior: TDD, execution, debugging, verification, planning, brainstorming, code review, and more. Each skill has a `skill.yaml` (metadata) and `SKILL.md` (process documentation).

### Personas

Three agent personas that run on your project:

- **Architecture Enforcer** — validates constraints on PRs and commits
- **Documentation Maintainer** — detects doc drift and missing coverage
- **Entropy Cleaner** — finds dead code, stale patterns, unused deps

### State Management

Persistent state across agent sessions via `.harness/`:

- `state.json` — position, progress, decisions, blockers
- `learnings.md` — tagged institutional knowledge
- `failures.md` — dead ends and anti-patterns
- `handoff.json` — structured context between skills

## Common Commands

```bash
harness validate              # Check project configuration
harness check-deps            # Verify dependency boundaries
harness skill list            # List available skills
harness skill run <name>      # Run a skill
harness state show            # View current state
harness state learn "..."     # Capture a learning
harness linter generate       # Generate ESLint rules from YAML
```

## Troubleshooting

### "harness: command not found"

Install the CLI globally or use npx:

```bash
npx @harness-engineering/cli validate
```

### "pnpm: command not found"

```bash
npm install -g pnpm
```

### "Node version not compatible"

```bash
nvm install 22
nvm use 22
```

## Next Steps

- Read [The Standard](../standard/index.md) for the six principles
- Explore [Adoption Levels](../standard/implementation.md) for phased rollout
- Check [Configuration Reference](../reference/) for harness.config.json options
