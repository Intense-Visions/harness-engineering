# What Can Harness Do?

Harness Engineering is a toolkit that makes AI coding agents reliable through mechanical enforcement. Instead of hoping agents follow conventions, harness validates their output at every step.

This page maps every major capability to the command, skill, or tool that provides it. Use it as a starting point — each section links to detailed docs.

## At a Glance

| Capability                    | What It Does                                                                    | How to Use It                                    |
| ----------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Project scaffolding**       | Initialize projects with templates for 10 frameworks across 5 languages         | `harness init --framework express`               |
| **Architectural enforcement** | Validate layer boundaries, detect circular deps, block forbidden imports        | `harness check-deps`, `harness check-arch`       |
| **Code review**               | 7-phase pipeline with mechanical checks + parallel AI agents                    | `/harness:code-review` or `harness agent review` |
| **Security scanning**         | Secrets, injection, XSS, crypto, path traversal, agent config, MCP rules        | `harness check-security`                         |
| **Performance enforcement**   | Benchmarks, baselines, regression detection, critical path analysis             | `harness check-perf`, `harness perf bench`       |
| **Documentation health**      | Drift detection, coverage checks, auto-fix pipeline                             | `harness check-docs`, `/harness:docs-pipeline`   |
| **Knowledge graph**           | Structural analysis with 30 node types, 25 edge types, natural language queries | `harness scan`, `ask_graph` MCP tool             |
| **Autonomous execution**      | Plan → execute → verify → review loop across multi-phase projects               | `/harness:autopilot`                             |
| **Agent orchestration**       | Long-running daemon dispatching coding agents to issues                         | `harness orchestrator run`                       |
| **Cost tracking**             | Token spend visibility across sessions, days, and models                        | `harness usage daily` (in progress)              |

## Project Setup & Scaffolding

Start a new project or adopt harness in an existing one.

| Command                           | Description                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `harness init`                    | Scaffold a new harness project with templates                                                     |
| `harness init --framework <name>` | Use a framework overlay (Express, Next.js, FastAPI, Django, Gin, Axum, Spring Boot, etc.)         |
| `harness init --level <level>`    | Set adoption level: basic (validate only), intermediate (+ constraints), advanced (full pipeline) |
| `harness setup`                   | Complete setup wizard — Node check, slash commands, MCP server, integrations                      |
| `harness doctor`                  | Diagnose environment: Node.js, git, MCP, integrations health                                      |
| `harness add <type> <name>`       | Add a layer, module, doc, skill, or persona to an existing project                                |

**Related skills:** `/harness:initialize-project`, `/harness:onboarding`, `/harness:add-component`

## Validation & Enforcement

The core of harness — mechanical checks that run in CI and during development.

| Command                    | Description                                                        |
| -------------------------- | ------------------------------------------------------------------ |
| `harness validate`         | Run all validation checks (file structure, config, knowledge map)  |
| `harness check-deps`       | Validate dependency layers, detect circular dependencies           |
| `harness check-arch`       | Check architectural constraints against baselines                  |
| `harness check-docs`       | Verify documentation coverage meets threshold                      |
| `harness check-security`   | Scan for secrets, injection, XSS, weak crypto, agent config issues |
| `harness check-perf`       | Run structural complexity, coupling, and size budget checks        |
| `harness check-phase-gate` | Verify implementation matches spec requirements                    |
| `harness ci check`         | Run all checks in CI mode with configurable failure thresholds     |

**All-in-one:** `harness ci check` runs validate + deps + docs + entropy + security + perf + phase-gate + arch in sequence.

**Related skills:** `/harness:verify` (binary pass/fail gate), `/harness:integrity` (verify + AI review), `/harness:verification` (comprehensive validation)

## Development Workflow Skills

These skills guide AI agents through structured workflows. Invoke them as slash commands in Claude Code or Gemini CLI.

### Core Loop

| Skill                    | What It Does                                           | When to Use                                             |
| ------------------------ | ------------------------------------------------------ | ------------------------------------------------------- |
| `/harness:brainstorming` | Structured ideation → spec document                    | Starting a new feature that needs design decisions      |
| `/harness:planning`      | Spec → detailed implementation plan with tasks         | After a spec is approved, before writing code           |
| `/harness:execution`     | Execute plan tasks with state tracking and checkpoints | Implementing a planned set of tasks                     |
| `/harness:verification`  | Validate implementation against spec and plan          | After execution, before review                          |
| `/harness:code-review`   | 7-phase code review with parallel AI agents            | Before merging any changes                              |
| `/harness:autopilot`     | Chain all of the above autonomously across phases      | Multi-phase projects where you want hands-off execution |

### Supporting Skills

| Skill                       | What It Does                                                  | When to Use                                  |
| --------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| `/harness:tdd`              | Test-driven development with red-green-refactor enforcement   | Writing code that needs tests first          |
| `/harness:debugging`        | Systematic debugging with investigation-before-fix discipline | Bug with non-obvious root cause              |
| `/harness:refactoring`      | Safe refactoring with before/after validation                 | Restructuring code without changing behavior |
| `/harness:soundness-review` | Deep analysis of specs and plans with auto-fix                | Before approving a spec or plan              |
| `/harness:skill-authoring`  | Create and maintain harness skills                            | Building new skills for the project          |

## Architecture & Code Quality

Tools for understanding and enforcing codebase structure.

| Capability                    | Command / Tool                  | Description                                                      |
| ----------------------------- | ------------------------------- | ---------------------------------------------------------------- |
| Layer enforcement             | `harness check-deps`            | Validates that imports follow defined layer boundaries           |
| Circular dependency detection | `harness check-deps`            | Finds and reports circular import chains                         |
| Architecture baselines        | `harness check-arch`            | Tracks module size, coupling, complexity — fails on regression   |
| Dead code detection           | `/harness:cleanup-dead-code`    | Finds dead exports, commented-out code, orphaned deps            |
| Architecture enforcement      | `/harness:enforce-architecture` | Auto-fixes import violations and forbidden imports               |
| Architecture advisor          | `/harness:architecture-advisor` | Interactive advisor that surfaces tradeoffs for design decisions |
| Entropy detection             | `harness cleanup`               | Detects drift, dead code, and pattern violations                 |
| Impact analysis               | `/harness:impact-analysis`      | Graph-based "if I change X, what breaks?"                        |
| Hotspot detection             | `/harness:hotspot-detector`     | Identifies structural risk via co-change and churn analysis      |
| Dependency health             | `/harness:dependency-health`    | Analyze structural health using graph metrics                    |

## Knowledge Graph

A structural analysis engine that powers many of the above capabilities.

| Command / Tool                  | Description                                                       |
| ------------------------------- | ----------------------------------------------------------------- |
| `harness scan`                  | Build the knowledge graph from code, git, and docs                |
| `harness graph query <id>`      | Query the graph from a starting node with depth/type filters      |
| `harness graph status`          | Show graph statistics (nodes, edges, last scan)                   |
| `harness graph export`          | Export graph as JSON or Mermaid diagram                           |
| `ask_graph` (MCP)               | Natural language queries: "what depends on the auth module?"      |
| `search_similar` (MCP)          | Find structurally similar code across the codebase                |
| `get_impact` (MCP)              | Analyze blast radius of changing a file or module                 |
| `compute_blast_radius` (MCP)    | Probabilistic cascading failure simulation with confidence scores |
| `predict_conflicts` (MCP)       | Predict merge conflicts before parallel work starts               |
| `check_task_independence` (MCP) | Verify parallel tasks won't conflict                              |
| `detect_anomalies` (MCP)        | Find structural outliers via z-score analysis                     |

**Graph features:** 30 node types, 25 edge types, 4 external connectors (Jira, Slack, Confluence, CI), ContextQL query language, natural language translation, vector search via FusionLayer.

## Security

Multi-layered security scanning and enforcement.

| Feature               | Description                                                 |
| --------------------- | ----------------------------------------------------------- |
| Secret detection      | API keys, tokens, passwords across 11 patterns              |
| Injection detection   | SQL injection, command injection, eval/Function             |
| XSS detection         | innerHTML, dangerouslySetInnerHTML, document.write          |
| Cryptography checks   | Weak hashing algorithms, hardcoded keys                     |
| Path traversal        | Directory traversal in file operations                      |
| Network security      | CORS wildcards, disabled TLS, hardcoded HTTP                |
| Agent config auditing | Unicode detection, wildcard permissions, auto-approve risks |
| MCP server security   | Hardcoded secrets, shell injection, typosquatting           |
| Stack-specific rules  | Node.js (prototype pollution), Express, React, Go           |

**Commands:** `harness check-security`, `harness check-security --changed-only`
**Skills:** `/harness:security-scan` (lightweight), domain skills for auth, compliance, secrets management

## Documentation

Keep docs in sync with code automatically.

| Command / Skill             | Description                                                    |
| --------------------------- | -------------------------------------------------------------- |
| `harness check-docs`        | Verify documentation coverage percentage                       |
| `/harness:docs-pipeline`    | Full pipeline: detect drift → fix → audit gaps → fill → report |
| `/harness:detect-doc-drift` | Find documentation that has drifted from code                  |
| `harness blueprint`         | Generate interactive offline HTML blueprint of the codebase    |

## Performance

Benchmark management and regression detection.

| Command                           | Description                                                 |
| --------------------------------- | ----------------------------------------------------------- |
| `harness check-perf`              | Run structural complexity, coupling, and size budget checks |
| `harness perf bench [glob]`       | Run benchmarks via vitest bench                             |
| `harness check-perf --structural` | Check structural complexity only                            |
| `harness check-perf --coupling`   | Check coupling metrics only                                 |

**Skills:** `/harness:perf` (enforcement and baselines)

## State Management

Track progress, learnings, and failures across sessions.

| Command                         | Description                                                |
| ------------------------------- | ---------------------------------------------------------- |
| `harness state show`            | Show current project state (position, progress, decisions) |
| `harness state learn <message>` | Record a learning to `.harness/learnings.md`               |
| `harness state streams`         | List all state streams with branch associations            |
| `harness state reset`           | Reset project state                                        |
| `harness learnings prune`       | Archive stale learnings                                    |

**MCP tool:** `manage_state` — read/write state sections, manage sessions, record decisions

## Agent Orchestration

Run coding agents at scale.

| Feature                     | Description                                                                |
| --------------------------- | -------------------------------------------------------------------------- |
| `harness orchestrator run`  | Long-running daemon that polls issue trackers and dispatches agents        |
| Event-sourced state machine | Pure state transitions, replayable, side-effect isolation                  |
| Workspace isolation         | Each agent gets its own git worktree                                       |
| Tracker adapters            | Roadmap-based tracker built in; extensible for Jira, Linear, GitHub Issues |
| Ink TUI                     | Terminal dashboard showing agent status, token usage, issue progress       |

**Guide:** [docs/guides/orchestrator.md](orchestrator.md)

## Ecosystem & Extensibility

| Feature                        | Description                                                   |
| ------------------------------ | ------------------------------------------------------------- |
| `harness skill create <name>`  | Scaffold a new skill with YAML + SKILL.md                     |
| `harness skill search <query>` | Search community skills on npm `@harness-skills/*`            |
| `harness install <skill>`      | Install a community skill                                     |
| `harness skill publish`        | Publish a skill to the npm registry                           |
| `harness share`                | Export architectural constraints as a shareable bundle        |
| `harness install-constraints`  | Import constraints from a shared bundle                       |
| `harness linter generate`      | Generate ESLint rules from YAML config                        |
| `harness generate`             | Generate slash commands + agent definitions for all platforms |
| `harness integrations list`    | Show available MCP integrations (Context7, Playwright, etc.)  |
| `harness hooks init`           | Install Claude Code hook profiles (minimal/standard/strict)   |

## Agent Personas

12 specialized personas that can be dispatched via the Agent tool with `subagent_type`:

| Persona                      | Role                                                  | When Dispatched                           |
| ---------------------------- | ----------------------------------------------------- | ----------------------------------------- |
| **planner**                  | Creates executable phase plans with task breakdown    | During `/harness:autopilot` PLAN state    |
| **task-executor**            | Executes approved plans task-by-task with TDD         | During `/harness:autopilot` EXECUTE state |
| **verifier**                 | Validates implementation against spec at three tiers  | During `/harness:autopilot` VERIFY state  |
| **code-reviewer**            | Full-lifecycle code review with harness methodology   | During `/harness:autopilot` REVIEW state  |
| **security-reviewer**        | OWASP/CWE-focused security review                     | When security-specific review is needed   |
| **architecture-enforcer**    | Validates layer boundaries and dependency rules       | During architecture enforcement           |
| **codebase-health-analyst**  | Identifies structural problems, coupling risks, drift | Proactive health sweeps                   |
| **documentation-maintainer** | Keeps documentation in sync with code                 | During docs pipeline                      |
| **entropy-cleaner**          | Detects and fixes dead code and pattern violations    | During cleanup workflows                  |
| **graph-maintainer**         | Monitors graph health and connector status            | Graph maintenance tasks                   |
| **parallel-coordinator**     | Dispatches independent work across isolated agents    | When parallelizing tasks                  |
| **performance-guardian**     | Enforces performance budgets and catches regressions  | Performance-critical changes              |

## Domain Skills (Tier 3)

43 domain-specific skills available on-demand via `search_skills` MCP tool or direct invocation:

| Category           | Skills                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| **Backend**        | api-design, database, caching, event-driven, resilience                                                   |
| **Security**       | auth, secrets, compliance, security-review                                                                |
| **Infrastructure** | deployment, containerization, infrastructure-as-code, observability                                       |
| **Testing**        | e2e, integration-test, load-testing, mutation-test, property-test, visual-regression, perf-tdd, test-data |
| **Frontend**       | design, design-system, design-web, design-mobile, accessibility, ux-copy                                  |
| **Reliability**    | chaos, incident-response, diagnostics                                                                     |
| **Data**           | data-pipeline, data-validation, sql-review, ml-ops                                                        |
| **Mobile**         | mobile-patterns                                                                                           |
| **Process**        | product-spec, feature-flags, git-workflow, pre-commit-review                                              |
| **i18n**           | i18n, i18n-process, i18n-workflow                                                                         |

## What's Next

- [Getting Started](getting-started.md) — Install and scaffold your first project
- [Day-to-Day Workflow](day-to-day-workflow.md) — Full lifecycle tutorial with a real example
- [Orchestrator Guide](orchestrator.md) — Run coding agents at scale
- [Skill Marketplace](skill-marketplace.md) — Discover and publish community skills
- [Best Practices](best-practices.md) — Patterns for effective harness usage
