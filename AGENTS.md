# Harness Engineering: AI Agent Knowledge Map

This is the single source of truth for AI agents working on the Harness Engineering project. It provides essential context about our repository structure, architecture, conventions, and where to find information.

## Project Overview

**Harness Engineering** is a comprehensive toolkit for transitioning from manual coding to **agent-first development**. We help teams architect software in ways that enable AI agents to execute, maintain, and improve code reliably and autonomously.

### Purpose and Goals

- Create a reusable library and toolkit for agent-first development
- Establish patterns that make AI-driven development predictable and scalable
- Document architectural decisions as the single source of truth
- Enforce constraints mechanically rather than through code review
- Measure and improve agent autonomy over time

### Current Phase

**Complete** — All core packages (types, core, cli, eslint-plugin, linter-gen, graph, orchestrator), 737 skills (claude-code and gemini-cli), 12 personas, 19 templates, and 3 progressive examples are implemented. The project is in adoption and refinement mode. See `examples/` for progressive tutorials.

## Repository Structure

This is a **monorepo** using pnpm workspaces and Turborepo for orchestration.

```
harness-engineering/
├── packages/                  # Core application packages
│   ├── types/                # Shared TypeScript types and interfaces
│   ├── core/                 # Core runtime library and utilities
│   ├── cli/                  # CLI tool (harness validate, check-deps, skill, state, etc.)
│   ├── eslint-plugin/        # ESLint rules for constraint enforcement
│   ├── linter-gen/           # YAML-to-ESLint rule generator
│   ├── graph/                # Unified Knowledge Graph: LokiJS store, ContextQL queries, code/git/knowledge ingestion, FusionLayer search, 4 external connectors (Jira, Slack, Confluence, CI)
│   ├── intelligence/         # Intelligence pipeline for spec enrichment, complexity modeling, and pre-execution simulation
│   ├── dashboard/            # Local web dashboard for project health and roadmap visualization
│   └── orchestrator/         # Agent orchestration daemon for dispatching coding agents to issues
├── agents/                    # Agent configuration
│   ├── skills/claude-code/   # 737 skills (skill.yaml + SKILL.md each)
│   ├── skills/gemini-cli/    # 737 skills (symlinked to claude-code for platform parity)
│   ├── skills/codex/         # 737 skills (symlinked to claude-code for platform parity)
│   ├── skills/cursor/        # 737 skills (symlinked to claude-code for platform parity)
│   ├── skills/templates/     # Shared discipline template (Evidence Requirements, Red Flags, Rationalizations to Reject)
│   └── personas/             # 12 personas (architecture-enforcer, code-reviewer, codebase-health-analyst, documentation-maintainer, entropy-cleaner, graph-maintainer, parallel-coordinator, performance-guardian, planner, security-reviewer, task-executor, verifier)
├── templates/                 # 19 project scaffolding templates (language bases + framework overlays: Express, NestJS, Next.js, FastAPI, Django, Gin, Axum, Spring Boot, React Vite, Vue, and more)
├── examples/                  # Progressive tutorial examples
│   ├── hello-world/          # Basic adoption level
│   ├── task-api/             # Intermediate adoption level
│   └── multi-tenant-api/     # Advanced adoption level
├── docs/                     # Complete documentation suite
│   ├── standard/            # Harness Engineering principles and standard
│   ├── guides/              # How-to guides and tutorials
│   ├── reference/           # Configuration and API reference
│   ├── changes/             # Design change proposals and technical specifications
│   ├── plans/               # Implementation and execution plans
│   ├── research/            # Framework research and analysis
│   └── conventions/          # Format conventions (markdown interaction patterns)
├── package.json             # Root package metadata and scripts
├── tsconfig.json            # Root TypeScript configuration
├── pnpm-workspace.yaml      # pnpm workspace definition
├── turbo.json               # Turborepo configuration
└── AGENTS.md                # This file - AI agent knowledge map
```

### Package Relationships

- **types** → Shared type definitions (no dependencies)
- **core** → Runtime library (depends on types)
- **graph** → Knowledge graph for codebase relationships and entropy detection (depends on types)
- **orchestrator** → Agent orchestration and multi-agent coordination (depends on core)
- All packages follow strict dependency rules: no circular dependencies, no upward dependencies

## Architecture

### Layered Architecture

We follow a strict, one-way dependency model:

```
Types (bottom layer - no dependencies)
  ↓
Configuration & Constants
  ↓
Repository & Data Access
  ↓
Services & Business Logic
  ↓
Agents & External Interfaces (top layer)
```

**Key Rule**: Layers can only depend on lower layers, never upward.

### Design Decisions

1. **TypeScript Strict Mode** - All code runs with strict type checking enabled
2. **Project References** - We use tsconfig project references for proper compilation order and dependency validation
3. **Monorepo Structure** - Enables shared code and consistent tooling across packages
4. **Documentation-First** - All architectural decisions live in git as version-controlled markdown
5. **Result<T, E> Pattern** - Explicit error handling using Result types (similar to Rust's Result)

### Module Boundaries

Each package has a clear responsibility:

- **types**: Type definitions, interfaces, and constants used across packages
- **graph**: Knowledge graph store, ContextQL queries, code/git/knowledge ingestion, FusionLayer search
- **core**: Runtime library with validation, constraints, entropy detection, architecture checks, and pricing/cost calculation (depends on types, graph)
- **eslint-plugin**: ESLint rules for architectural constraint enforcement (depends on types, core)
- **linter-gen**: YAML-to-ESLint rule generator (depends on types, core)
- **orchestrator**: Agent orchestration daemon for dispatching coding agents to issues (depends on types, core)
- **dashboard**: Web dashboard — React + Hono full-stack app with 10 pages (Overview, Roadmap, Health, Graph, Impact, Adoption, Analyze, Attention, Chat, Orchestrator), SSE-based live updates, and server-side data gathering (depends on types, core, graph)
- **cli**: CLI tool and MCP server — top-level integration layer (depends on all packages)

### Notable Core Modules

- **pricing** (`packages/core/src/pricing/`): LiteLLM-based model pricing lookup. Fetches pricing data from LiteLLM's GitHub JSON with a 24h disk cache at `.harness/cache/pricing.json`, falling back to a bundled `fallback.json` for offline/CI use. Public API: `getModelPrice(model)` returns per-1M-token rates, `calculateCost(record)` returns integer microdollars (USD \* 1,000,000) to avoid floating-point drift. Supports Claude, GPT-4, and Gemini model families.
  - `pricing.ts` — Parses LiteLLM's raw pricing JSON into a PricingDataset map, filtering to chat models with valid costs
  - `calculator.ts` — Calculates cost of a usage record in integer microdollars accounting for input/output/cache tokens
  - `cache.ts` — 24-hour TTL disk cache for LiteLLM pricing with fallback and staleness warning

- **security** (`packages/core/src/security/`): Taint tracking, injection detection, and security rule enforcement.
  - `taint.ts` — Session-scoped taint file read/write/check/clear/expire logic via `.harness/session-taint-{sessionId}.json`
  - `scan-config-shared.ts` — Shared scan-config types and utilities for CLI and orchestrator workspace scanner
  - `injection-patterns.ts` — Shared pattern library for detecting prompt injection attacks in text input
  - `rules/sharp-edges.ts` — Rules for deprecated crypto APIs (createCipher/createDecipher) and weak cryptography
  - `rules/insecure-defaults.ts` — Rules for hardcoded defaults on sensitive variables and TLS/SSL disabled by default
  - `rules/agent-config.ts` — Rules for agent configuration (hidden unicode, URL execution directives, wildcard permissions)

- **architecture** (`packages/core/src/architecture/`): Architecture stability tracking and constraint failure prediction.
  - `timeline-types.ts` — Zod schemas for architectural timeline snapshots and per-category metric aggregates
  - `timeline-manager.ts` — Disk I/O and lifecycle management for `timeline.json` storing historical stability snapshots
  - `spec-impact-estimator.ts` — Mechanical extraction of structural signals (layer violations, coupling, complexity) from spec files
  - `regression.ts` — Pure math module for weighted linear regression on metric time series
  - `prediction-types.ts` — Zod schemas for regression results, direction classification, and failure forecasts
  - `prediction-engine.ts` — Constraint failure prediction using timeline trends and roadmap impact to forecast threshold breaks

- **usage** (`packages/core/src/usage/`): Token usage tracking and cost aggregation.
  - `jsonl-reader.ts` — Extracts and validates token_usage from parsed JSONL entries
  - `cc-parser.ts` — Parses Claude Code JSONL logs with deduplication of streaming chunks by requestId
  - `aggregator.ts` — Aggregates UsageRecords from harness and claude-code sources by session and day with cost calculation

- **adoption** (`packages/core/src/adoption/`): Skill adoption tracking and aggregation.
  - `reader.ts` — Parses `.harness/metrics/adoption.jsonl` into `SkillInvocationRecord[]`
  - `aggregator.ts` — Aggregates records by skill (`aggregateBySkill`) and by day (`aggregateByDay`); exports `DailyAdoption` type

- **state** (`packages/core/src/state/`): Session state and learnings lifecycle management.
  - `session-sections.ts` — Loader for session-state.json managing accumulative sections (terminology, decisions, constraints, risks, openQuestions, evidence)
  - `session-archive.ts` — Archives completed sessions by moving directory to `.harness/archive/sessions/<slug>-<date>`
  - `learnings-loader.ts` — Mtime-based cache loader for learnings files; leaf module preventing circular dependencies
  - `learnings-lifecycle.ts` — Archive/prune/promotion/counting operations on learnings with pattern analysis
  - `learnings-content.ts` — Content deduplication via normalization, content hashing, and hash index management

- **code-nav** (`packages/core/src/code-nav/`): Tree-sitter-based code navigation and symbol extraction.
  - `outline.ts` — Extracts top-level code symbols (functions, classes, interfaces, types) with locations
  - `unfold.ts` — Extracts specific symbol implementations or line ranges from source files
  - `parser.ts` — Web-tree-sitter parser wrapper with language detection and grammar caching for TS/JS/Python

- **review** (`packages/core/src/review/`): Code review evidence validation.
  - `evidence-gate.ts` — Parses file:line references from evidence entries and validates coverage against changed files

- **roadmap** (`packages/core/src/roadmap/`): Roadmap parsing, sync, and pilot selection (see also Project Roadmap section).
  - `tracker-sync.ts` — Abstract interface for syncing roadmap features with external trackers
  - `sync-engine.ts` — Bidirectional roadmap-to-external-tracker sync with title dedup and status rank protection
  - `status-rank.ts` — Status rank ordering (backlog < planned/blocked < in-progress < done) for directional sync protection
  - `pilot-scoring.ts` — Pilot selection algorithm scoring candidates by position, dependents, and affinity within priority tiers
  - `adapters/github-issues.ts` — GitHub Issues sync adapter with label-based status disambiguation

## Development Workflow

### Prerequisites

Ensure you have these tools installed:

- **Node.js 22+** - Download from [nodejs.org](https://nodejs.org/)
- **pnpm 8+** - Install with: `npm install -g pnpm`
- **Git** - Required for version control

Verify your setup:

```bash
node --version    # Should be 22.x or higher
pnpm --version    # Should be 8.x or higher
git --version     # Any recent version
```

### Setting Up the Project

```bash
# 1. Clone the repository
git clone https://github.com/Intense-Visions/harness-engineering.git
cd harness-engineering

# 2. Install all dependencies
pnpm install

# 3. Verify the setup by building
pnpm build

# 4. Run tests to ensure everything works
pnpm test
```

### Common Development Tasks

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Watch mode for development
pnpm dev

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests for a specific package
pnpm test --filter=@harness-engineering/core

# Lint all code
pnpm lint

# Format code (TypeScript, JavaScript, Markdown, JSON)
pnpm format

# Check formatting without making changes
pnpm format:check

# Type checking
pnpm typecheck

# Start documentation server
pnpm docs:dev

# Build documentation
pnpm docs:build

# Preview built documentation
pnpm docs:preview

# Clean build artifacts
pnpm clean
```

### Git Workflow and Commit Conventions

We use **Conventional Commits** for clear, machine-readable commit messages:

```
type(scope): brief description

Optional longer explanation of the change and why it was made.
```

**Commit Types:**

- `feat:` - New feature or functionality
- `fix:` - Bug fix
- `docs:` - Documentation changes (no code changes)
- `style:` - Code style changes (formatting, semicolons, etc.)
- `refactor:` - Code changes without new features or fixes
- `test:` - Test additions or modifications
- `chore:` - Dependency updates, tooling, etc.

**Example Commits:**

```
feat(core): add Result type for error handling
fix(types): correct generic constraints on Handler interface
docs: update AGENTS.md with architecture overview
refactor(core): simplify validation logic
test(core): add tests for Result type
```

## Key Concepts

### Result<T, E> Pattern

We use a Result type (similar to Rust) for explicit error handling:

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

This provides:

- **Explicit error handling** - No surprise errors
- **Type-safe operations** - Compiler enforces error handling
- **Clear intent** - Functions signal they may fail
- **Composability** - Easy to chain operations

### TypeScript Project References

We use `tsconfig.json` project references for:

- **Proper compilation order** - Dependencies compile first
- **Incremental builds** - Only rebuild what changed
- **Dependency validation** - Prevent circular dependencies
- **Clear boundaries** - Explicit package dependencies

Configuration example:

```json
{
  "references": [{ "path": "./packages/types" }, { "path": "./packages/core" }]
}
```

### CLI Subsystems

**Commands** (`packages/cli/src/commands/`):

- `usage.ts` — Loads and prices usage records from cost data and Claude sessions
- `traceability.ts` — Checks requirement-to-code-to-test traceability for specs with confidence levels
- `taint.ts` — Manages session taint state to block destructive operations after injection detection
- `scan-config.ts` — Scans configuration files for injection patterns and security violations
- `recommend.ts` — Recommends skills based on codebase health snapshot with urgency markers
- `predict.ts` — Predicts architectural constraint violations using decay trends and roadmap features
- `doctor.ts` — Runs system health checks (Node version, MCP config, integrations)
- `dashboard.ts` — Launches the web dashboard server on configurable ports
- `integrations/dismiss.ts` — Dismisses integrations by adding them to the dismissed list in config
- `_registry.ts` — Auto-generated barrel export aggregating all command constructors
- `adoption.ts` — View skill adoption telemetry (subcommands: skills, recent, skill)
- `cleanup-sessions.ts` — Removes stale session directories from `.harness/sessions/` older than 24 hours
- `telemetry/index.ts` — Parent command group for telemetry management (identify + status)
- `telemetry/identify.ts` — Sets or clears identity fields in `.harness/telemetry.json`
- `telemetry/status.ts` — Displays current consent state, install ID, identity, and env overrides

**Hooks** (`packages/cli/src/hooks/`): Claude Code lifecycle hooks for security and quality enforcement.

- `sentinel-pre.js` — PreToolUse hook that blocks destructive bash operations during tainted sessions
- `sentinel-post.js` — PostToolUse hook that scans outputs for injection patterns and sets taint
- `quality-gate.js` — PostToolUse hook that runs formatter/linter checks after edits
- `protect-config.js` — PreToolUse hook that blocks modifications to linter and formatter config files
- `pre-compact-state.js` — PreCompact hook that saves a compact session summary before context compaction
- `cost-tracker.js` — Stop hook that appends token usage to `.harness/metrics/costs.jsonl`
- `block-no-verify.js` — PreToolUse hook that blocks git commands using `--no-verify` flag
- `adoption-tracker.js` — Stop hook that reads Claude Code events.jsonl, extracts skill invocations, and appends SkillInvocationRecords to `.harness/metrics/adoption.jsonl`
- `telemetry-reporter.js` — Stop hook that reads adoption.jsonl, resolves consent, sends anonymous events to PostHog, and shows first-run privacy notice
- `profiles.ts` — Defines hook profile tiers (minimal/standard/strict) with event matchers

**MCP Tools** (`packages/cli/src/mcp/tools/`):

- `traceability.ts` — MCP tool for checking requirement-to-code-to-test traceability
- `recommend-skills.ts` — MCP tool that recommends skills based on codebase health with caching
- `predict-failures.ts` — MCP tool that forecasts architectural constraint violations using decay trends
- `dispatch-skills.ts` — MCP tool that recommends optimal skill sequences based on git diffs
- `decay-trends.ts` — MCP tool that analyzes architecture decay trends over timeline snapshots
- `code-nav.ts` — MCP tool that extracts structural skeletons and searches symbols from code files
- `graph/compute-blast-radius.ts` — MCP tool that simulates cascading failure propagation using probability-weighted BFS
- `middleware/injection-guard.ts` — Wraps MCP tool handlers with pre/post injection scanning for tainted session enforcement

**Skill Dispatch** (`packages/cli/src/skill/`): Intelligent skill recommendation and dispatch.

- `recommendation-engine.ts` — Three-layer system combining hard rules, health scoring, and topological sequencing
- `recommendation-types.ts` — Standardized health signal identifiers and recommendation result types
- `recommendation-rules.ts` — Fallback address rules for bundled skills without declared addresses
- `health-snapshot.ts` — Captures and caches codebase health state with checks, metrics, and freshness validation
- `dispatch-types.ts` — Types for enriched dispatch context combining snapshots with change-type and domain signals
- `dispatch-session.ts` — Session-start dispatch integration that detects HEAD delta and returns skill recommendations
- `dispatch-engine.ts` — Enriches health snapshots with change-type and domain signals for recommendation engine

**Other CLI modules:**

- `templates/post-write.ts` — Persists tooling and framework metadata to `harness.config.json` after template init
- `templates/agents-append.ts` — Appends framework-specific conventions to AGENTS.md during project setup
- `utils/node-version.ts` — Validates Node.js version meets minimum requirement (>=22.0.0)
- `utils/first-run.ts` — Detects and marks first run of harness via `~/.harness/.setup-complete` marker
- `slash-commands/sync-codex.ts` — Syncs skill YAML/MD files to Codex output directory with add/update/remove tracking
- `slash-commands/render-cursor.ts` — Renders cursor-compatible YAML frontmatter with globs and alwaysApply config
- `slash-commands/render-codex.ts` — Renders Codex-compatible markdown and YAML files for skill distribution
- `integrations/toml.ts` — Writes MCP server entries to TOML config files with atomic pattern preservation

### Telemetry Subsystem

Anonymous product analytics collection implemented across `packages/types`, `packages/core`, and `packages/cli`. Zero vendor SDK dependencies -- uses Node's built-in `fetch()` to POST events to PostHog's HTTP batch API.

**Architecture:**

- **Types** (`packages/types/src/telemetry.ts`): `TelemetryConfig`, `TelemetryIdentity`, `ConsentState`, `TelemetryEvent`
- **Core** (`packages/core/src/telemetry/`):
  - `consent.ts` -- Merges env vars (`DO_NOT_TRACK`, `HARNESS_TELEMETRY_OPTOUT`), config (`telemetry.enabled`), and `.harness/telemetry.json` identity into a `ConsentState`
  - `install-id.ts` -- Creates/reads a persistent anonymous UUIDv4 at `.harness/.install-id`
  - `collector.ts` -- Reads `adoption.jsonl` and formats `TelemetryEvent` payloads
  - `transport.ts` -- HTTP POST to PostHog `/batch` with 3 retries, 5s timeout, silent failure
- **CLI** (`packages/cli/src/commands/telemetry/`): `identify` (set/clear `.harness/telemetry.json`), `status` (display consent state, install ID, identity, env overrides)
- **Hook** (`packages/cli/src/hooks/telemetry-reporter.js`): Stop hook that runs the full pipeline (consent check, collect, send, first-run notice)

**Consent priority:** `DO_NOT_TRACK=1` > `HARNESS_TELEMETRY_OPTOUT=1` > `harness.config.json telemetry.enabled` > default (enabled)

**Data sent (when enabled):** install ID, OS, Node version, harness version, skill name, duration, outcome. Identity fields (project, team, alias) only when explicitly set in `.harness/telemetry.json`.

**Data NOT sent:** file paths, file contents, code, prompts, or any PII unless user opts in via identity fields.

### Dashboard Package

`packages/dashboard/` is a React + Hono full-stack app providing a web-based project health dashboard.

**Client** (`src/client/`): React SPA with 10 pages (Overview, Roadmap, Health, Graph, Impact, Adoption, Analyze, Attention, Chat, Orchestrator), reusable components (KpiCard, GanttChart, DependencyGraph, BlastRadiusGraph, ProgressChart, ActionButton, StaleIndicator, Layout), and SSE-based live data hooks (`useSSE`, `useApi`).

**Server** (`src/server/`): Hono HTTP server with SSE connection manager running a shared polling loop. Routes: overview, health, impact, ci, actions, sse, health-check. Data gatherers: health, ci, blast-radius, arch, anomalies.

### Graph Subsystems

In addition to the core graph store and ContextQL engine:

- `query/Traceability.ts` — Traces requirement-to-code/test coverage with confidence levels and EARS pattern detection
- `ingest/RequirementIngestor.ts` — Ingests requirements from spec markdown sections (Observable Truths, Success Criteria, Acceptance Criteria)
- `blast-radius/CascadeSimulator.ts` — Probability-weighted BFS simulating cascading failure propagation from a source node
- `blast-radius/CompositeProbabilityStrategy.ts` — Blends edge type weight (50%), change frequency (30%), and coupling strength (20%) for failure propagation probability
- `benchmarks/queries.bench.ts` — Vitest benchmarks for graph queries with medium (100-node) synthetic fixtures

### Types Package Detail

Beyond the core Result, Config, and ValidationError types:

- `workflow.ts` — Types for multi-skill workflows with step dependencies, gates, and outcomes
- `usage.ts` — UsageRecord composition of TokenUsage with cache tokens, model, and cost tracking
- `tracker-sync.ts` — ExternalTicket/ExternalTicketState types for bidirectional tracker integration
- `session-state.ts` — SessionSectionName union type and session entry lifecycle
- `ci.ts` — CICheckName, CICheckStatus, and CICheckIssue types for CI check reporting

### Unified Knowledge Graph

The `packages/graph` package provides a graph-based context system that unifies code structure, organizational knowledge, and external data into a single queryable model. It powers context assembly, entropy detection, constraint enforcement, and skill execution across the entire toolkit. Key components: LokiJS graph store, ContextQL query engine, FusionLayer (keyword + semantic search), code/git/knowledge ingestion pipelines, CascadeSimulator (probabilistic failure propagation via `compute_blast_radius` MCP tool), and 4 external connectors (Jira, Slack, Confluence, CI).

### Skill Tier System

Skills are classified into three tiers to preserve context. Only Tier 1 and Tier 2 skills are registered as slash commands; Tier 3 skills are discoverable via the `search_skills` MCP tool.

- **Tier 1 (Workflow, 11 skills):** Always-loaded slash commands for core workflow — brainstorming, planning, execution, autopilot, tdd, debugging, refactoring, skill-authoring, onboarding, initialize-project, add-component.
- **Tier 2 (Maintenance, 21 skills):** Always-loaded slash commands for project health — integrity, verify, code-review, release-readiness, docs-pipeline, codebase-cleanup, enforce-architecture, detect-doc-drift, cleanup-dead-code, dependency-health, hotspot-detector, security-scan, perf, impact-analysis, test-advisor, soundness-review, architecture-advisor, roadmap, verification, supply-chain-audit, roadmap-pilot.
- **Tier 3 (Catalog, 43 skills):** Discoverable on demand via `search_skills`. Includes domain skills (API design, database, deployment, containerization, etc.), design skills, i18n, and specialized testing.
- **Internal (6 skills):** Dependency-only, never surfaced. Invoked by other skills as part of pipelines.

The `search_skills` MCP tool (`packages/cli/src/mcp/tools/search-skills.ts`) queries a merged index of bundled + community skills. The index uses hash-based staleness detection. An intelligent dispatcher (`packages/cli/src/skill/dispatcher.ts`) suggests relevant Tier 3 skills when Tier 1 workflow skills start. Stack profile detection (`packages/cli/src/skill/stack-profile.ts`) identifies project technologies to bias suggestions. Configuration overrides in `harness.config.json` support `skills.alwaysSuggest`, `skills.neverSuggest`, and `skills.tierOverrides`.

### Community Skill Registry

The `@harness-skills/*` npm namespace enables publishing, discovering, and installing community skills. Key commands: `harness install`, `harness uninstall`, `harness skill search`, `harness skill create`, `harness skill publish`. Supports local installs (`--from ./path`), private registries (`--registry <url>`), and `.npmrc` auth tokens. Skills are pure content packages (no runtime code). Discovery priority: project-local > community > bundled.

Implementation in `packages/cli/src/registry/` and `packages/cli/src/commands/skill/`. See the [Skill Marketplace Guide](./docs/guides/skill-marketplace.md) for full usage, architecture, and examples.

### Project Roadmap

The project roadmap lives at `docs/roadmap.md` and tracks features across milestones with statuses (`backlog`, `planned`, `in-progress`, `done`, `blocked`). Core implementation in `packages/core/src/roadmap/` provides `parseRoadmap`, `serializeRoadmap`, and `syncRoadmap`. The `manage_roadmap` MCP tool (`packages/cli/src/mcp/tools/roadmap.ts`) exposes CRUD operations: `show`, `add`, `update`, `remove`, `query`, `sync`. The `harness-roadmap` skill provides interactive workflows: `--create`, `--add`, `--sync`, `--edit`, `--query`. Roadmap sync respects a "human-always-wins" rule — manually edited statuses are preserved unless `force_sync` is set. The orchestrator adapter (`packages/orchestrator/src/tracker/adapters/roadmap.ts`) maps roadmap features to the internal Issue model for agent orchestration.

**External tracker sync** — Bidirectional sync between `roadmap.md` and GitHub Issues via `TrackerSyncAdapter` (`packages/core/src/roadmap/tracker-sync.ts`). The `GitHubIssuesSyncAdapter` (`packages/core/src/roadmap/adapters/github-issues.ts`) uses label-based status disambiguation for the open/closed limitation. The sync engine (`packages/core/src/roadmap/sync-engine.ts`) provides `syncToExternal` (push planning fields), `syncFromExternal` (pull execution fields with directional guard via `status-rank.ts`), and `fullSync` (mutex-serialized read-push-pull-write cycle). Configuration via `roadmap.tracker` in `harness.config.json` (validated by `TrackerConfigSchema` in `packages/cli/src/config/schema.ts`). Auto-sync fires on 6 state transitions via `triggerExternalSync` in `packages/cli/src/mcp/tools/roadmap-auto-sync.ts`.

**Auto-pick pilot** — The `harness-roadmap-pilot` skill (`agents/skills/claude-code/harness-roadmap-pilot/`) selects the next highest-impact unblocked item using a two-tier sort: explicit priority first (P0–P3), then weighted score (position 0.5, dependents 0.3, affinity 0.2). Scoring algorithm and `assignFeature` function in `packages/core/src/roadmap/pilot-scoring.ts`. Routes to `harness:brainstorming` (no spec) or `harness:autopilot` (spec exists). Assignment updates the feature's `Assignee` field, appends to the `## Assignment History` section, and syncs to the external tracker.

### Monorepo Structure Benefits

- **Shared Dependencies** - One pnpm-lock.yaml ensures consistency
- **Unified Tooling** - Same linting, formatting, and test configuration
- **Coordinated Changes** - Easy to update multiple packages together
- **Turborepo Caching** - Faster builds with smart caching

### Documentation-First Approach

All architectural decisions must be documented:

1. **Design Documents** - Explain the "why" before implementing
2. **Architecture Decisions** - Record key choices in `/docs/standard/`
3. **Implementation Plans** - Track execution in `/docs/plans/`
4. **Specifications** - Detailed technical specs in `/docs/changes/`
5. **Guides** - How-to documentation for common tasks

This creates a permanent record that AI agents can access and understand.

## Where to Find Things

### Documentation Structure

- **[docs/standard/](./docs/standard/)** - Core Harness Engineering standard and principles
  - `index.md` - Overview of the standard
  - `principles.md` - Deep dive into the 7 core principles
  - `implementation.md` - Step-by-step adoption guide
  - `kpis.md` - Metrics for measuring success

- **[docs/guides/](./docs/guides/)** - How-to guides and tutorials
  - `getting-started.md` - Quick start guide for new projects
  - `best-practices.md` - Recommended patterns and practices
  - Additional guides for specific topics

- **[docs/reference/](./docs/reference/)** - Technical reference documentation
  - Configuration reference
  - CLI documentation
  - API reference

- **[docs/api/](./docs/api/)** - API documentation for all packages

- **[docs/changes/](./docs/changes/)** - Detailed technical specifications for features
- **[docs/plans/](./docs/plans/)** - Implementation and execution plans

### Key Documentation

When working on this project, agents should prioritize reading:

1. **First**: [Harness Engineering Standard](./docs/standard/index.md) - Understanding the vision
2. **Second**: [Seven Core Principles](./docs/standard/principles.md) - Understanding how it works
3. **Third**: [Getting Started Guide](./docs/guides/getting-started.md) - Practical setup
4. **Reference**: [Implementation Guide](./docs/standard/implementation.md) - Detailed guidance
5. **Context**: This file (AGENTS.md) - Navigation and quick reference

## Conventions

### Code Style

- **TypeScript Strict Mode** - All code compiles with `strict: true`
- **ESLint** - Configured in `eslint.config.js` for code quality rules
- **Prettier** - Auto-formatting with rules in `.prettierrc.json`
  - 2-space indentation
  - Single quotes for strings
  - Trailing commas where valid
  - Line length: 100 characters (practical limit)

### Code Organization

- **Barrel Exports** - Each package has `src/index.ts` that re-exports public API
- **Type-Safe Code** - No `any` types unless absolutely necessary with `// @ts-ignore` comments
- **Clear Imports** - Explicit imports from package exports, not internal paths

### Commit Message Format

Follow **Conventional Commits** (see Git Workflow section above):

```
type(scope): brief description under 50 chars

Optional longer body explaining the "why" and "what" of the change.
Keep lines under 72 characters for readability.

Closes #123  # Optional reference to related issues
```

### Documentation Standards

When writing documentation:

1. **Be Specific** - Explain decisions, not just facts
2. **Include Examples** - Code examples for technical decisions
3. **Link References** - Link to related docs
4. **Update AGENTS.md** - Add new docs to the navigation
5. **Explain the Why** - Focus on reasoning, not just implementation

Example documentation template:

```markdown
# Feature Name

## Overview

One-sentence description of what this is and why it exists.

## Design

Detailed explanation of the design and key decisions.

## Implementation

How it works technically with code examples.

## Examples

Real-world usage examples.

## Related

Links to related documentation.
```

### Testing Approach

- **Unit Tests** - Test individual functions and classes
- **Integration Tests** - Test package interactions
- **Test Coverage** - Aim for high coverage of critical paths
- **Descriptive Names** - Test names explain what is being tested

Test file locations:

- Core code: `src/module.ts`
- Tests: `tests/module.test.ts`

## Common Tasks for Agents

### Adding a New Package

1. **Create directory structure**:

   ```bash
   mkdir -p packages/my-package/src
   ```

2. **Create package.json** with name `@harness-engineering/my-package`

3. **Add TypeScript configuration** (`tsconfig.json`)

4. **Export from src/index.ts** (barrel export)

5. **Add to root tsconfig.json** references

6. **Add to pnpm-workspace.yaml** if not auto-detected

### Updating Documentation

1. **Create or edit markdown file** in appropriate `/docs/` subdirectory

2. **Follow documentation standards** (see Conventions section)

3. **Update navigation** - Add links to AGENTS.md or VitePress config if needed

4. **Link to related docs** - Help agents navigate to context

5. **Update AGENTS.md** if creating new major sections

### Running Tests

```bash
# Run all tests
pnpm test

# Watch mode for development
pnpm test:watch

# Test specific package
pnpm test --filter=@harness-engineering/core

# Run with coverage
pnpm test -- --coverage
```

### Building the Project

```bash
# Build all packages
pnpm build

# Build specific package
pnpm build --filter=@harness-engineering/core

# Development mode (watch)
pnpm dev

# Clean build (remove artifacts)
pnpm clean && pnpm build
```

## Context for AI Agents

### Our Approach to AI Development

This project is **specifically designed** for AI agents to work on it effectively:

1. **Documentation is Law** - Decisions are recorded, not assumed
2. **Explicit Over Implicit** - Clear patterns and constraints guide work
3. **Mechanical Validation** - Rules are enforced by code, not hope
4. **Self-Verification** - Agents can run tests and validate their work
5. **Context-Dense** - All information needed is in the repository

### Principles to Follow

When working on this project, AI agents should:

1. **Read AGENTS.md First** - Understand the project context
2. **Check Related Documentation** - Follow links to understand decisions
3. **Follow Conventions Strictly** - Code style, commit messages, structure
4. **Write Tests** - Verify new code before committing
5. **Update Documentation** - Keep docs in sync with code changes
6. **Self-Review** - Run tests, check formatting, verify types before submitting
7. **Be Specific in PRs** - Explain the why, not just the what
8. **Respect Boundaries** - Stay within architectural constraints

### Harness Engineering Principles

The project embodies these core principles:

1. **Context Engineering** - All knowledge lives in git (this AGENTS.md, architectural docs, specs)
2. **Architectural Rigidity** - Layered architecture with mechanical constraints prevents bad patterns
3. **Agent Feedback Loop** - Self-review, peer review, testing all happen before human review
4. **Entropy Management** - Documentation must stay in sync with code
5. **Depth-First Implementation** - Complete features fully before starting new ones
6. **Measurable Success** - Track metrics: agent autonomy, harness coverage, context density

### Error Handling Pattern

Always use Result types for operations that may fail:

```typescript
import type { Result, ValidationError } from '@harness-engineering/core';
import { createError } from '@harness-engineering/core';

export function validateConfig(data: unknown): Result<Config, ValidationError> {
  if (!isValidConfig(data)) {
    return {
      ok: false,
      error: createError<ValidationError>('VALIDATION_FAILED', 'Invalid config'),
    };
  }
  return { ok: true, value: data as Config };
}
```

This makes error handling explicit and type-safe.

## Quick Reference

### File Locations by Task

| Task                 | Location                                 |
| -------------------- | ---------------------------------------- |
| Add a new feature    | `packages/core/src/newfeature.ts`        |
| Write tests          | `packages/core/tests/newfeature.test.ts` |
| Update standard      | `docs/standard/`                         |
| Create a guide       | `docs/guides/`                           |
| API reference        | `docs/api/`                              |
| Technical specs      | `docs/changes/`                          |
| Implementation plans | `docs/plans/`                            |

### Important Configuration Files

| File                  | Purpose                                               |
| --------------------- | ----------------------------------------------------- |
| `package.json`        | Root project metadata and scripts                     |
| `pnpm-workspace.yaml` | Monorepo workspace definition                         |
| `tsconfig.json`       | Root TypeScript configuration with project references |
| `turbo.json`          | Turborepo build orchestration                         |
| `eslint.config.js`    | ESLint configuration (flat config format)             |
| `.prettierrc.json`    | Code formatting rules                                 |

### Development Commands Cheat Sheet

```bash
# Setup
pnpm install

# Development
pnpm dev              # Watch mode
pnpm test:watch       # Tests in watch mode
pnpm format           # Auto-format code

# Validation
pnpm test             # Run tests
pnpm lint             # Check linting
pnpm typecheck        # Check types
pnpm format:check     # Check formatting

# Building
pnpm build            # Build all packages
pnpm docs:dev         # Dev docs server

# Cleanup
pnpm clean            # Remove all build artifacts
```

## Additional Resources

- **Project Repository**: https://github.com/Intense-Visions/harness-engineering
- **Main Documentation**: See `/docs/` directory
- **Standard Specification**: `/docs/standard/`
- **Implementation Plans**: `/docs/plans/`

## Updating This Document

AGENTS.md should be kept up-to-date as the project evolves. When making significant changes:

1. Update relevant sections in this file
2. Add new sections for new major features
3. Keep links current
4. Verify all paths are correct
5. Commit with `docs: update AGENTS.md` message

This is the living documentation of our project - keep it accurate and comprehensive.

---

**Last Updated**: 2026-04-24
**Version**: 1.2
**Maintained By**: AI Agents and Engineering Team
