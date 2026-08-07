# Harness Engineering

[![CI](https://github.com/Intense-Visions/harness-engineering/actions/workflows/ci.yml/badge.svg)](https://github.com/Intense-Visions/harness-engineering/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io/)

**If your senior engineer goes on holiday for two weeks and your agents keep shipping — do you trust what comes out the other side?**

Harness Engineering is the gear list that makes the answer _yes_. The framing draws on a growing body of work on harness engineering — Ajey Gore's ["The Solo Climb"](https://ajeygore.in/content/the-solo-climb) and ["The Anatomy of an AI-Native Org"](https://ajeygore.in/content/the-anatomy-of-an-ai-native-org), OpenAI's ["Harness engineering"](https://openai.com/index/harness-engineering/), and Martin Fowler's ["Harness engineering for coding agents"](https://martinfowler.com/articles/harness-engineering.html) — distilled to one question: shipping with agents unsupervised isn't a prompt problem, it's an equipment problem. The holiday test is Gore's; _The Solo Climb_ names the gear you need before that holiday is safe. Here is each piece — and what harness ships for it.

## The Gears

1. **Specs you operate from** — the input the agent works from, the source the eval checks against, and the artifact the team reviews when something breaks. harness both authors and polices them: `brainstorming` and `spec-craft` produce specs and ADRs, and `acceptance-eval` refuses a spec that lacks measurable, testable acceptance criteria.

2. **A test suite the team trusts enough to ship on** — green means ship, red means don't. harness doesn't write your tests, but it makes them load-bearing: `test-advisor` selects the tests a change actually needs and audits coverage gaps, and the `verify` gate runs test/lint/typecheck as a single hard pass/fail.

3. **An eval suite for "did it solve the right problem"** — the layer above the unit tests that catches the change which passes every test and still does the wrong thing. harness ships `outcome-eval`, a blocking post-execution gate that judges the diff against the spec's acceptance criteria before the change is allowed to ship.

4. **A sandboxed environment the agent can operate in** — bounded, observable, reversible, so a mistake's blast radius never reaches the user. harness covers this partly: isolated git worktrees bound the work, session search and `insights` make it observable, and the `rollback` skill proposes a full-context revert when a shipped change fails. It orchestrates your environment rather than providing the sandbox itself.

5. **Gates that actually gate** — the build either goes to production or it doesn't; no soft gates that warn and wave you through. This is the core of harness: architectural boundaries enforced by ESLint, CI checks that fail the build, a `block-no-verify` hook that refuses `--no-verify`, and phase gates that won't advance on a failed checkpoint.

6. **Agent-of-agent review** — one agent writes, another reviews, a third runs the tests. harness ships a multi-phase `code-review` pipeline that fans work out to parallel persona reviewers (architecture, security, TypeScript-strict, frontend-races, adversarial) and supports peer review between agents.

## Why This Exists

AI coding agents are powerful, but unreliable without structure. Left unconstrained, they introduce circular dependencies, violate architectural boundaries, and generate drift that compounds across a codebase. Teams respond with code review backlogs and manual checklists — trading agent speed for human bottlenecks.

Harness Engineering takes a different approach: **mechanical enforcement, not hope.**

Instead of relying on prompts and conventions, harness encodes your architectural decisions as machine-checkable constraints. Agents get real-time feedback when they violate boundaries. Entropy is detected and cleaned automatically. Every rule is validated on every change.

**For tech leads and architects:** Scale AI-assisted development across your team with confidence. Define constraints once, enforce them everywhere — across agents, developers, and CI.

**For individual developers:** Stop babysitting your AI agent. Give it guardrails and let it execute. Spend your time on design decisions, not cleanup.

## Key Features

- **Cross-Platform Support** — Fully tested on Windows, macOS, and Linux with mechanical enforcement preventing platform-specific regressions
- **Context Engineering** — Repository-as-documentation keeps agents grounded in project reality, not stale training data
- **Architectural Constraints** — Layered dependency rules enforced by ESLint, not willpower
- **Agent Feedback Loop** — Self-correcting agents with peer review and real-time validation
- **Entropy Management** — Automated detection of dead code, doc drift, and structural decay
- **Implementation Strategy** — Depth-first execution: one feature to 100% before the next begins
- **Key Performance Indicators** — Measure agent autonomy, harness coverage, and context density
- **Orchestrator Gateway API** — Token-scoped bearer auth on a versioned `/api/v1/*` surface with append-only audit log, three bridge-primitive endpoints (`jobs/maintenance`, `interactions/{id}/resolve`, `events` SSE), HMAC SHA-256-signed webhook subscriptions (`X-Harness-Signature: sha256=<hex>`) with event-bus fan-out, and a vendored OpenAPI artifact at [`docs/api/openapi.yaml`](docs/api/openapi.yaml). External bridges (Slack, Discord, GitHub Apps) build against a published, versioned contract instead of coupling to internals. See [ADR 0011](docs/knowledge/decisions/0011-orchestrator-gateway-api-contract.md). See [`examples/slack-echo-bridge/`](examples/slack-echo-bridge/) for the canonical reference consumer — a standalone Node bridge that verifies HMAC signatures and posts to Slack on `maintenance.completed`.
- **Granular Task Routing** — Spec B extends `agent.routing` with per-skill and per-cognitive-mode axes, fallback chains, and a `/routing` dashboard panel + `harness routing trace` CLI for inspecting decisions. See the [Per-skill and per-mode routing](docs/guides/multi-backend-routing.md#per-skill-and-per-mode-routing-spec-b) section.
- **Session Search & Insights** — SQLite FTS5 index over `.harness/sessions/` and `.harness/archive/sessions/` with BM25 ranking; LLM-generated retrospective `llm-summary.md` written on session archive; composite `harness insights` aggregator combining health, entropy, decay, attention, and impact. New CLI commands `harness search "<query>"` and `harness insights`, plus MCP tools `search_sessions`, `summarize_session`, `insights_summary`. See [ADR 0013](docs/knowledge/decisions/0013-hermes-phase-1-session-memory-architecture.md).
- **Skill Proposals** — Two opt-in surfaces feed candidate skills into a review queue: agents can call the `emit_skill_proposal` MCP tool on demand, and opt-in session-terminus retrospection can infer candidates when a session is archived (gated on `HARNESS_SESSION_RETROSPECTION` plus an analysis provider). Both are off by default — the loop is opt-in, not always-on. Proposals queue in `.harness/proposals/` and route through a mechanical soundness gate at approval time; every promoted skill carries `provenance: community | agent-proposed | user-authored`. CLI: `harness proposals list|show|status|approve|reject` (`status` shows whether each emitter is live or dormant). Dashboard review queue at `/s/proposals`. See the [skill-proposal loop guide](docs/guides/skill-proposal-loop.md) and [ADR 0016](docs/knowledge/decisions/0016-skill-proposal-workflow.md).
- **Local Model Lifecycle Manager** — Opt-in (`localModels.enabled`) autonomy for the local model pool: hardware-aware ranking, disk-budget-bounded install/swap/evict through the review queue, and a `LocalModelResolver` that consumes pool state. Manual `harness models` + resolver-from-pool + drift reconciliation ship today; autonomous swap proposals await the Phase-2 candidate parser. See the [operator guide](docs/guides/local-model-lifecycle.md), [ADR 0061](docs/knowledge/decisions/0061-lmlm-package-boundary-and-native-ranking-port.md), and [ADR 0062](docs/knowledge/decisions/0062-pool-bounded-autonomy-and-ollama-first-install.md).

## Quick Start

> **Using a coding agent?** Point it at the autonomous setup prompt and let it install + initialize harness for you: `https://raw.githubusercontent.com/Intense-Visions/harness-engineering/main/docs/agent-setup/prompt.md` — "follow the instructions at this URL".

Pick the install path that matches how you use harness:

- **Claude Code users** → install the `harness-claude` marketplace plugin (recommended). Skills, slash commands, persona subagents, lifecycle hooks, and MCP are wired up automatically — no `harness setup` step.
- **Cursor users** → install the `harness-cursor` marketplace plugin (recommended). Same component surface as Claude, plus 4 curated project rules.
- **Gemini CLI users** → install the `harness-gemini` marketplace extension. Slash commands + GEMINI.md context + MCP. (Gemini extensions don't define a subagents or hooks field, so those surfaces live in GEMINI.md.)
- **Codex CLI users** → install the `harness-codex` marketplace plugin. Skills + MCP (Codex's plugin spec defines no slash-command or agents surface).
- **OpenCode users** → install the npm package and run `harness setup`. OpenCode auto-discovers `.claude/skills/` and shares Claude's skill tree, so the only setup work is wiring the harness MCP server into `opencode.json`, which `harness setup` does automatically once it detects `~/.config/opencode/` or a project-local `opencode.json`.
- **Plain CLI / CI users (or any tool not yet covered by a plugin)** → install the npm package. `harness setup` detects every supported AI client (Claude Code, Gemini CLI, Cursor, Codex CLI, OpenCode) and lays down skills, slash commands, agent personas, MCP, and hooks.

### 1a. Install via the Claude Code plugin marketplace (recommended for Claude Code sessions)

In a Claude Code session:

```
/plugin marketplace add Intense-Visions/harness-engineering
/plugin install harness-claude
```

This pulls every bundled skill (so trigger phrases like "scaffold a test suite" engage `initialize-test-suite-project` automatically), registers the `/harness:*` slash commands, installs the 12 persona subagents (`harness-code-reviewer`, `harness-architecture-enforcer`, …), wires the standard hook profile (block-no-verify, protect-config, quality-gate, pre-compact-state, adoption-tracker, telemetry-reporter), and starts the `harness` MCP server via `npx @harness-engineering/cli harness-mcp`. No per-repo `harness setup` is required.

### 1b. Install via the Cursor plugin marketplace (recommended for Cursor sessions)

In Cursor, open the marketplace and install `harness-cursor` from `Intense-Visions/harness-engineering`. Same skills, slash commands, subagents, hooks, and MCP server as the Claude plugin, plus 4 curated project rules (validate-before-commit, respect-architecture, use-harness-skills, respect-hooks) that fire automatically as `alwaysApply` rules in every Cursor session in this repo.

### 1c. Install via npm (for plain CLI use, or for AI tools without a marketplace plugin)

```bash
npm install -g @harness-engineering/cli
harness setup
```

This installs the CLI and runs interactive setup: generates global slash commands and agent personas for all detected AI clients (Claude Code, Gemini CLI, Cursor, Codex CLI), configures MCP servers, and sets up peer integrations. Once set up, every project on your machine has access to `/harness:*` slash commands, agent personas, and the `harness-mcp` server binary — no per-project setup needed.

> **Tip:** Re-run `harness setup` after updating the CLI (`harness update`) to pick up new or changed skills. Marketplace plugin users update via `/plugin update harness-claude` (or `harness-cursor`).

### Plugin vs. npm: what you actually get

The marketplace plugins are the **agent-session interface**. The npm package is what you need for shell-level workflows. Pick based on where you actually use harness:

| Surface                                                                                                | `harness-claude` / `harness-cursor` plugin (after `/harness:initialize-project` runs once per repo) | `npm install -g @harness-engineering/cli` (after `harness setup`)                                                                                                        |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inside a Claude Code or Cursor session — skills, `/harness:*`, subagents, hooks, MCP tools             | ✅ full parity                                                                                      | ✅ same                                                                                                                                                                  |
| Cursor project rules (validate-before-commit, respect-architecture, use-harness-skills, respect-hooks) | ✅ shipped with `harness-cursor`                                                                    | ❌ Cursor-only feature                                                                                                                                                   |
| Adoption tracking + anonymous telemetry (hooks fire, defaults enabled)                                 | ✅ works                                                                                            | ✅ works                                                                                                                                                                 |
| Project bootstrap (`harness.config.json`, `.harness/` scaffolding)                                     | ✅ via `/harness:initialize-project` (Phase 2)                                                      | ✅ via `harness init` / `harness setup`                                                                                                                                  |
| Knowledge graph (`.harness/graph/`)                                                                    | ✅ via `/harness:initialize-project` (Phase 5 step 1)                                               | ✅ initial scan during `harness setup`                                                                                                                                   |
| Architecture / performance baselines                                                                   | ✅ via `/harness:initialize-project` (Phase 5 steps 2–3)                                            | ✅ auto-refreshed on main via CI                                                                                                                                         |
| Telemetry **identity** tagging (project / team / alias)                                                | ✅ via `/harness:initialize-project` (Phase 5 step 4)                                               | ✅ via interactive telemetry wizard                                                                                                                                      |
| Legacy layout migration warnings (`docs/plans/`, `.harness/architecture/`)                             | ✅ via `/harness:initialize-project` (Phase 5 step 5)                                               | ✅ surfaced during `harness setup`                                                                                                                                       |
| Tier-0 MCP integrations (context7, sequential-thinking, playwright) added to project `.mcp.json`       | ✅ via `/harness:initialize-project` (Phase 5 step 6)                                               | ✅ wired during interactive setup                                                                                                                                        |
| Tier-1 API-key integrations (Linear, Slack, Perplexity, …)                                             | ⚠️ surfaced by `harness integrations list`; user wires via `npx … add <name>`                       | ⚠️ same — API keys required either way                                                                                                                                   |
| Gemini CLI / Codex integration                                                                         | ✅ via sibling marketplace plugins (`harness-gemini`, `harness-codex`)                              | ✅ `harness setup` configures all detected clients                                                                                                                       |
| OpenCode integration                                                                                   | ⚠️ no OpenCode-native plugin manifest (OpenCode uses code-based plugins, not marketplace JSON)      | ✅ `harness setup` writes `opencode.json` with the harness MCP server (and Tier-0 integrations) when `~/.config/opencode/` or a project-local `opencode.json` is present |
| Terminal use — `harness validate`, `harness init`, `harness check-arch`                                | ⚠️ only via `npx @harness-engineering/cli <cmd>`                                                    | ✅ binary in PATH                                                                                                                                                        |
| CI workflows (GitHub Actions, etc.)                                                                    | ⚠️ workable via `npx` (cold-start cost per job)                                                     | ✅ `npm install -g` once, fast thereafter                                                                                                                                |
| Git pre-commit hooks (`harness validate` on commit)                                                    | ⚠️ npx-based, slow                                                                                  | ✅ direct binary, fast                                                                                                                                                   |

**TL;DR**: run `/harness:initialize-project` once per repo and the plugin covers ~95% of what `harness setup` does — the skill's Phase 5 (INSTRUMENT) closes the bootstrap gap. The remaining ~5% (multi-tool MCP wiring, fast CI/terminal access without npx cold-start) is what `npm install -g` fills. They coexist cleanly.

#### Telemetry on plugin-only installs

Adoption tracking and anonymous telemetry hooks ship in the standard hook profile, so they fire on plugin install with no extra setup. They default-enable but a privacy notice prints to stderr on first run. Opt out at any time:

```bash
# Per-shell
export DO_NOT_TRACK=1
# Or per-project, in harness.config.json:
#   { "telemetry": { "enabled": false }, "adoption": { "enabled": false } }
```

For identity-tagged telemetry (project/team/alias), run the interactive wizard once via `npx @harness-engineering/cli telemetry-wizard` — the plugin doesn't ship an interactive equivalent.

#### Updates

Plugin users have two update channels that can drift slightly:

- **Bundled artifacts** (skills, slash commands, subagents, hooks) ship from this git repo. Update via `/plugin update harness-claude`.
- **MCP server binary** is launched via `npx -y -p @harness-engineering/cli@<pinned-version> harness-mcp`, where `<pinned-version>` is an exact version pinned in the plugin manifest (not `@latest`). Every adopter runs that exact published build, and updates arrive deliberately — a `/plugin update` pulls a manifest whose pin has been bumped, rather than each new session silently pulling whatever is newest on npm. See [docs/security/trust-model.md](docs/security/trust-model.md) for the full trust and integrity model.

Both channels move together on a `/plugin update`: the git artifacts and the pinned MCP version are bumped in the same manifest revision. If you instead want to always track the newest publish yourself, `npm install -g @harness-engineering/cli` and use `harness setup` — the global install is the opt-in "latest" path.

#### Shell-from-plugin escape hatch

If you only have the plugin installed and need a shell-level harness command, `npx` works without a global install:

```bash
npx @harness-engineering/cli validate
npx @harness-engineering/cli check-deps
npx @harness-engineering/cli check-arch
```

First call is slow (npx fetches the package); subsequent calls within the cache window are fast. For frequent terminal use, `npm install -g` is still the better path.

### 2. Scaffold a new project

In an AI agent session (Claude Code, Gemini CLI):

```
/harness:initialize-project
```

The initialization skill walks you through project setup interactively — name, adoption level, framework overlay — and scaffolds everything including MCP server configuration.

> **CLI alternative** (for scripts or CI): `harness init --name my-project --level intermediate`

### 3. Validate

```
/harness:verify
```

Runs all mechanical checks in one pass — configuration, dependency boundaries, lint, typecheck, and tests.

> **CLI alternative:** `harness validate && harness check-deps`

### Explore an example

```bash
git clone https://github.com/Intense-Visions/harness-engineering.git
cd harness-engineering/examples/hello-world
npm install && harness validate
```

## Packages

| Package                                                          | Description                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@harness-engineering/types`](./packages/types)                 | Shared TypeScript types and interfaces                                                                                                                                                                                                                                                    |
| [`@harness-engineering/core`](./packages/core)                   | Validation, constraints, entropy detection, state management                                                                                                                                                                                                                              |
| [`@harness-engineering/cli`](./packages/cli)                     | CLI: `validate`, `check-deps`, `skill run`, `state show`                                                                                                                                                                                                                                  |
| [`@harness-engineering/eslint-plugin`](./packages/eslint-plugin) | 12 rules: layer violations, circular deps, forbidden imports, boundary schemas, doc exports, no nested loops in critical paths, no sync IO in async, no unbounded array chains, no unix shell commands, no hardcoded path separators, require path normalization, no process env in spawn |
| [`@harness-engineering/linter-gen`](./packages/linter-gen)       | Generate custom ESLint rules from YAML configuration                                                                                                                                                                                                                                      |
| [`@harness-engineering/graph`](./packages/graph)                 | Knowledge graph for codebase relationships and entropy detection                                                                                                                                                                                                                          |
| [`@harness-engineering/intelligence`](./packages/intelligence)   | Intelligence pipeline for spec enrichment, complexity modeling, and pre-execution simulation                                                                                                                                                                                              |
| [`@harness-engineering/orchestrator`](./packages/orchestrator)   | Agent orchestration daemon for dispatching coding agents to issues                                                                                                                                                                                                                        |
| [`@harness-engineering/dashboard`](./packages/dashboard)         | Local web dashboard for project health and roadmap visualization                                                                                                                                                                                                                          |

## Usage

```typescript
import { validateFileStructure } from '@harness-engineering/core';

const result = await validateFileStructure('/path/to/project');
if (!result.ok) {
  console.error('Validation failed:', result.error.message);
  process.exit(1);
}
```

```bash
# CLI — validate project constraints
harness validate

# Check architectural dependency boundaries
harness check-deps

# Run a skill
harness skill run harness-verification
```

See [Getting Started](./docs/guides/getting-started.md) for a full walkthrough.

## Architecture

Harness enforces a strict layered dependency model. Each layer may only import from layers below it.

```mermaid
graph TD
    A[agents] --> S[services]
    S --> R[repository]
    R --> C[config]
    C --> T[types]

    style A fill:#4a90d9,stroke:#2c5f8a,color:#fff
    style S fill:#50b86c,stroke:#2d7a3e,color:#fff
    style R fill:#f5a623,stroke:#c17d12,color:#fff
    style C fill:#9b59b6,stroke:#6c3483,color:#fff
    style T fill:#7f8c8d,stroke:#566573,color:#fff
```

Violations are caught at lint time via `@harness-engineering/eslint-plugin` — not at code review.

## AI Agent Integration

### Global setup (one-time)

Install the CLI, MCP server, skills, and personas so they're available in every project:

```bash
npm install -g @harness-engineering/cli
harness setup
```

The single `npm install -g` provides both the `harness` CLI and the `harness-mcp` server binary, with all dependencies version-matched. `harness setup` then detects installed AI clients and writes to your global config directories:

| Platform    | Slash Commands        | Agent Definitions |
| ----------- | --------------------- | ----------------- |
| Claude Code | `~/.claude/commands/` | `.claude/agents/` |
| Gemini CLI  | `~/.gemini/commands/` | `.gemini/agents/` |
| Cursor      | `~/.cursor/rules/`    | —                 |
| Codex CLI   | `~/.codex/`           | —                 |

After this, `/harness:*` slash commands and harness agent personas are available in every conversation — no per-project install needed.

### Per-project MCP server

For real-time constraint validation, connect the MCP server to your project. The easiest way is during initialization:

```
/harness:initialize-project
```

This scaffolds your project **and** configures the MCP server automatically.

To add the MCP server to an existing project:

```bash
harness setup-mcp
```

This gives your AI agent access to 62 tools (validation, entropy detection, skill execution, state management, code review, graph queries, and more) and 9 resources (project context, skills catalog, rules, learnings, state, graph, entities, relationships, business-knowledge).

<details>
<summary>Manual MCP setup</summary>

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

Then add your project directory to `~/.gemini/trustedFolders.json` (Gemini ignores workspace MCP servers in untrusted folders):

```json
{
  "/path/to/your/project": "TRUST_FOLDER"
}
```

**Cursor** — add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "harness": {
      "command": "harness",
      "args": ["mcp"]
    }
  }
}
```

**Codex CLI** — add to `.codex/config.toml` in your project root:

```toml
[mcp_servers.harness]
command = "harness"
args = ["mcp"]
enabled = true
```

**OpenCode** — add to `opencode.json` in your project root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "harness": {
      "type": "local",
      "command": ["harness", "mcp"],
      "enabled": true
    }
  }
}
```

> **Note:** `harness-mcp` is installed alongside the CLI by `npm install -g @harness-engineering/cli`. Using the installed binary instead of `npx @harness-engineering/mcp-server` avoids stale npx cache issues and ensures the MCP server uses the same package versions as the CLI.

</details>

| Client      | MCP Config Location     | Additional Setup                                     |
| ----------- | ----------------------- | ---------------------------------------------------- |
| Claude Code | `.mcp.json`             | None                                                 |
| Gemini CLI  | `.gemini/settings.json` | Add project to `~/.gemini/trustedFolders.json`       |
| Cursor      | `.cursor/mcp.json`      | None                                                 |
| Codex CLI   | `.codex/config.toml`    | None                                                 |
| OpenCode    | `opencode.json`         | None — skills auto-discovered from `.claude/skills/` |

## What's Included

| Component                              | Count | Description                                                                                                    |
| -------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------- |
| [Packages](./packages/)                | 9     | Core library, CLI, ESLint plugin, linter generator, graph, intelligence, orchestrator, dashboard, shared types |
| [Skills](./agents/skills/claude-code/) | 773   | Agent workflows. **12 are load-bearing gear (Tier-0)** — see below; the rest are an on-demand library          |
| [Personas](./agents/personas/)         | 12    | Architecture enforcer, code reviewer, planner, verifier, task executor, and 7 more                             |
| [Templates](./templates/)              | 19    | Language bases, framework overlays (Express, NestJS, Django, FastAPI, Gin, Axum, Spring Boot, and more)        |
| [Examples](./examples/)                | 3     | Progressive tutorials from 5 minutes to 30 minutes                                                             |

### Load-bearing skills (Tier-0)

The catalog runs to hundreds of skills, but a senior engineer only needs to hold a dozen in their head. These twelve carry the core workflow end to end — learn them first; everything else is a library you reach for on demand. Skills declare their standing with a first-class `catalog_tier` field in `skill.yaml` (`0` = load-bearing, `1` = library, `2` = retire candidate), surfaced here, in the [Skills Catalog](./docs/reference/skills-catalog.md), and in the dashboard command palette.

| Skill                        | Slash command                 | What it carries                                          |
| ---------------------------- | ----------------------------- | -------------------------------------------------------- |
| `harness-initialize-project` | `/harness:initialize-project` | Scaffold or migrate a harness-managed project            |
| `harness-strategy`           | `/harness:strategy`           | Set the durable product anchor (`STRATEGY.md`)           |
| `harness-brainstorming`      | `/harness:brainstorming`      | Turn intent into a spec                                  |
| `harness-planning`           | `/harness:planning`           | Decompose a spec into an ordered plan                    |
| `harness-execution`          | `/harness:execution`          | Implement a plan task-by-task with state tracking        |
| `harness-tdd`                | `/harness:tdd`                | Test-driven development inside the loop                  |
| `harness-verification`       | `/harness:verification`       | Verify built artifacts against spec and plan             |
| `harness-code-review`        | `/harness:code-review`        | Multi-persona review pipeline                            |
| `outcome-eval`               | `/harness:outcome-eval`       | Ship gate — did the change satisfy its spec?             |
| `harness-debugging`          | `/harness:debugging`          | Systematic debugging with validation                     |
| `harness-autopilot`          | `/harness:autopilot`          | Autonomous phase loop — plan → execute → verify → review |
| `harness-roadmap-pilot`      | `/harness:roadmap-pilot`      | Pick the next highest-impact roadmap item and drive it   |

## Examples

Learn by doing. Each example builds on the previous:

| Example                                          | Level        | Time   | What You Learn                                                               |
| ------------------------------------------------ | ------------ | ------ | ---------------------------------------------------------------------------- |
| [Hello World](./examples/hello-world/)           | Basic        | 5 min  | Config, validation, AGENTS.md — see what a harness project looks like        |
| [Task API](./examples/task-api/)                 | Intermediate | 15 min | Express API with 3-layer architecture enforced by ESLint                     |
| [Multi-Tenant API](./examples/multi-tenant-api/) | Advanced     | 30 min | Custom linter rules, Zod boundary validation, personas, full state lifecycle |

## Documentation

**Getting Started**

- [Getting Started Guide](./docs/guides/getting-started.md) — From zero to validated project
- [Day-to-Day Workflow](./docs/guides/day-to-day-workflow.md) — Full lifecycle tutorial using slash commands
- [Best Practices](./docs/guides/best-practices.md) — Patterns for effective harness usage
- [Agent Worktree Patterns](./docs/guides/agent-worktree-patterns.md) — Running multiple agents in parallel

**Core Concepts**

- [The Core Principles](./docs/standard/principles.md) — Foundational concepts behind harness engineering
- [Implementation Guide](./docs/standard/implementation.md) — Adoption levels and rollout strategy
- [KPIs](./docs/standard/kpis.md) — Measuring agent effectiveness

**Reference**

- [CLI Reference](./docs/reference/cli.md) — All commands and flags (for CI/scripts)
- [Configuration Reference](./docs/reference/configuration.md) — `harness.config.json` schema

## Inspirations

| Project                                                        | Key Contribution                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [GitHub Spec Kit](https://github.com/nicholasgubbins/spec-kit) | Constitution/principles, cross-artifact validation                     |
| [BMAD Method](https://github.com/bmadcode/BMAD-METHOD)         | Scale-adaptive intelligence, workflow re-entry, party mode             |
| [GSD](https://github.com/coleam00/gsd)                         | Goal-backward verification, persistent state, codebase mapping         |
| [Superpowers](https://github.com/jlowin/superpowers)           | Rigid behavioral workflows, subagent dispatch, verification discipline |
| [Ralph Loop](https://github.com/PlusNowhere/ralph-loop)        | Fresh-context iteration, append-only learnings, task sizing            |

These five projects most directly shaped harness engineering. See the full [Inspirations & Acknowledgments](./docs/inspirations.md) for all 50 projects, standards, and tools analyzed — what we adopted, what we skipped, and why.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, coding standards, and pull request guidelines.

## License

MIT License — see [LICENSE](./LICENSE) for details.
