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

## Install and Generate Global Skills

Before using harness in any project, install the CLI and generate global slash commands and agent personas:

```bash
npm install -g @harness-engineering/cli
harness setup
```

The single `npm install -g` provides both the `harness` CLI and the `harness-mcp` server binary, with all dependencies version-matched. `harness setup` then checks your Node version, generates `/harness:*` slash commands and agent definitions to your global config directories for Claude Code and Gemini CLI, configures MCP, and sets up integrations. After this one-time step, all harness skills, personas, and the MCP server are available in every AI agent session — no per-project setup needed.

> **Tip:** Re-run `harness setup` after `harness update` to pick up new or changed skills.

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

Once you've explored the examples, initialize your own project. The recommended way is via the slash command in your AI agent:

```
/harness:initialize-project
```

This walks you through project setup interactively — name, adoption level, framework overlay — and scaffolds everything including MCP server configuration.

> **CLI alternative** (for scripts or non-interactive use):
>
> ```bash
> harness init --name my-project --level intermediate
> ```

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

485 workflow skills that guide agent behavior: TDD, execution, debugging, verification, planning, brainstorming, code review, and more. Each skill has a `skill.yaml` (metadata) and `SKILL.md` (process documentation).

#### Installing External Skills

Skills can be installed from npm, local directories, or GitHub repositories:

```bash
# Install a single skill from npm
harness install acme-ui

# Install all skills from a GitHub repo — globally (available to every project)
harness install . --from github:owner/acme-skills --global

# Install from a local directory (auto-discovers all skills)
harness install . --from /path/to/acme-skills/skills --global
```

**Global installs** (`--global`) place skills in `~/.harness/skills/community/` and are available to every harness project on your machine — no per-project setup. After installing, regenerate slash commands to pick up the new skills:

```bash
harness generate-slash-commands --global --include-global
```

This makes skills available as slash commands. By default, installed skills are namespaced under `harness:` (e.g., `/harness:acme-ui`). Skills can define a custom namespace via `command_namespace` in their `skill.yaml` (e.g., `command_namespace: acme` produces `/acme:ui`).

#### Updating Third-Party Skills

Re-run the install command with `--force` to pull the latest version, then regenerate slash commands:

```bash
# Update from GitHub
harness install . --from github:owner/acme-skills --force --global

# Update from npm
harness install acme-ui --force --global

# Regenerate slash commands after updating
harness generate-slash-commands --global --include-global
```

### Personas

Twelve agent personas that run on your project:

- **Architecture Enforcer** — validates constraints on PRs and commits
- **Code Reviewer** — structured code review with automated checks
- **Codebase Health Analyst** — analyzes codebase health metrics
- **Documentation Maintainer** — detects doc drift and missing coverage
- **Entropy Cleaner** — finds dead code, stale patterns, unused deps
- **Graph Maintainer** — maintains knowledge graph freshness
- **Parallel Coordinator** — coordinates parallel agent work
- **Performance Guardian** — enforces performance budgets and detects regressions
- **Planner** — creates executable phase plans with task breakdown and dependency ordering
- **Security Reviewer** — scans for vulnerabilities and enforces security policies
- **Task Executor** — executes planned tasks with validation
- **Verifier** — verifies implementation completeness against spec and plan

### State Management

Persistent state across agent sessions via `.harness/`:

- `state.json` — position, progress, decisions, blockers
- `learnings.md` — tagged institutional knowledge
- `failures.md` — dead ends and anti-patterns
- `handoff.json` — structured context between skills

## Connect to AI Agents

Harness includes an MCP server that gives AI coding agents real-time access to validation, skills, and project context.

### Automatic Setup

```bash
# Configure for all supported clients (Claude Code + Gemini CLI)
harness setup-mcp

# Or configure a specific client
harness setup-mcp --client claude
harness setup-mcp --client gemini
```

This creates the MCP config in your project directory. The `harness init` command also sets this up automatically.

### Manual Setup

**Claude Code** — add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "harness": {
      "command": "harness-mcp"
    }
  }
}
```

**Gemini CLI** — add to `.gemini/settings.json` in your project root:

```json
{
  "mcpServers": {
    "harness": {
      "command": "harness-mcp"
    }
  }
}
```

Then add your project directory to `~/.gemini/trustedFolders.json` so Gemini trusts the workspace MCP server:

```json
{
  "/path/to/your/project": "TRUST_FOLDER"
}
```

> **Note:** `harness-mcp` is installed alongside the CLI by `npm install -g @harness-engineering/cli`. The MCP server is bundled with the CLI -- no separate package needed.

> **Note:** Gemini CLI ignores `mcpServers` in workspace settings for untrusted directories. The `harness setup-mcp` command handles this automatically.

### What the MCP Server Provides

- **62 tools** — project validation, dependency checking, entropy detection, skill execution, persona management, linter generation, state management, code review, diff analysis, phase gates, cross-checks, skill scaffolding, graph querying, impact analysis, agent definition generation, and more
- **9 resources** — `harness://project` (AGENTS.md context), `harness://skills` (skill catalog), `harness://rules` (active linter rules), `harness://learnings` (review log), `harness://state` (project state), `harness://graph` (graph statistics), `harness://entities` (entity nodes), `harness://relationships` (graph edges), `harness://business-knowledge` (business context)

Once connected, your AI agent can validate constraints, run skills, and access project context without leaving the conversation.

## Common Slash Commands

Use these in your AI agent session for the full interactive workflow:

```
/harness:initialize-project       # Scaffold a new harness-managed project
/harness:verify                   # Quick pass/fail gate (tests, lint, typecheck, harness checks)
/harness:brainstorming            # Explore problem space before implementation
/harness:planning                 # Decompose a spec into executable tasks
/harness:execution                # Execute a plan with TDD and state tracking
/harness:verification             # Deep audit — does the implementation match the spec?
/harness:code-review              # Structured code review with automated checks
/harness:detect-doc-drift         # Find documentation out of sync with code
/harness:enforce-architecture     # Validate layer boundaries and dependency rules
/harness:debugging                # Systematic debugging with state tracking
```

### CLI Commands (CI/scripts)

For non-interactive use — CI pipelines, shell scripts, or quick terminal checks:

```bash
harness validate              # Check project configuration
harness check-deps            # Verify dependency boundaries
harness ci check              # Run all CI checks in one pass
harness skill list            # List available skills
harness state show            # View current state
harness state learn "..."     # Capture a learning
harness linter generate       # Generate ESLint rules from YAML
harness setup-mcp             # Configure MCP server for AI clients
```

## Troubleshooting

### "harness: command not found"

Install the CLI globally or use npx. For day-to-day work, prefer slash commands (e.g., `/harness:verify`) which don't require a global install:

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
