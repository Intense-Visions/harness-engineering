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

**Complete** — All core packages (types, core, cli, eslint-plugin, linter-gen, graph, intelligence, dashboard, orchestrator), 741 skills (claude-code, gemini-cli, codex, and cursor), 12 personas, 19 templates, and 3 progressive examples are implemented. The project is in adoption and refinement mode. See `examples/` for progressive tutorials.

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
│   └── orchestrator/         # Agent orchestration daemon for dispatching coding agents to issues; supports multi-backend routing via `agent.backends` / `agent.routing`
├── agents/                    # Agent configuration
│   ├── skills/claude-code/   # 741 skills (skill.yaml + SKILL.md each)
│   ├── skills/gemini-cli/    # 741 skills (mirrored from claude-code for platform parity)
│   ├── skills/codex/         # 741 skills (mirrored from claude-code for platform parity)
│   ├── skills/cursor/        # 741 skills (mirrored from claude-code for platform parity)
│   ├── skills/templates/     # Shared discipline template (Evidence Requirements, Red Flags, Rationalizations to Reject)
│   └── personas/             # 12 personas (architecture-enforcer, code-reviewer, codebase-health-analyst, documentation-maintainer, entropy-cleaner, graph-maintainer, parallel-coordinator, performance-guardian, planner, security-reviewer, task-executor, verifier)
├── templates/                 # 19 project scaffolding templates (language bases + framework overlays: Express, NestJS, Next.js, FastAPI, Django, Gin, Axum, Spring Boot, React Vite, Vue, and more)
├── examples/                  # Progressive tutorial examples
│   ├── hello-world/          # Basic adoption level
│   ├── task-api/             # Intermediate adoption level
│   └── multi-tenant-api/     # Advanced adoption level
├── docs/                     # Complete documentation suite (VitePress site; config at docs/.vitepress/config.mts)
│   ├── standard/            # Harness Engineering principles and standard
│   ├── guides/              # How-to guides and tutorials
│   ├── reference/           # Configuration and API reference
│   ├── api/                 # Handcrafted API documentation for all packages
│   ├── architecture/        # Architecture analysis and diagrams
│   ├── changes/             # Design change proposals and technical specifications
│   ├── plans/               # Implementation and execution plans
│   ├── research/            # Framework research and analysis
│   ├── conventions/         # Format conventions (markdown interaction patterns)
│   ├── knowledge/           # ADRs and package-specific knowledge docs
│   ├── guidelines/          # Decision guides (e.g., MCP vs CLI)
│   ├── solutions/           # Solved-problem playbooks
│   └── blueprint/           # Blueprint HTML artifacts
├── design-system/            # Design tokens and DESIGN.md for the dashboard
├── scripts/                  # Build and maintenance scripts (barrel gen, coverage ratchet, doc gen, etc.)
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
- **intelligence**: Intelligence pipeline for spec enrichment, complexity modeling, and pre-execution simulation (depends on types, graph)
- **orchestrator**: Agent orchestration daemon for dispatching coding agents to issues. Modern config surface is `agent.backends` (named-map) + `agent.routing` (per-use-case). Legacy `agent.backend` / `agent.localBackend` accepted via in-memory migration shim with deprecation warning. (depends on types, core, intelligence)
- **dashboard**: Web dashboard — React + Hono full-stack app with 12 pages (Adoption, Analyze, Attention, DecayTrends, Graph, Health, Impact, Maintenance, Orchestrator, Roadmap, Streams, Traceability), SSE-based live updates, and server-side data gathering (depends on types, core, graph)
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

### Notable Intelligence Modules

- **sel** (`packages/intelligence/src/sel/`): Spec Enrichment Layer — enriches raw work items with blast radius, affected systems, and graph-validated context.
- **cml** (`packages/intelligence/src/cml/`): Complexity Modeling Layer — scores structural and semantic complexity, computes historical trends, and emits concern signals.
- **pesl** (`packages/intelligence/src/pesl/`): Pre-Execution Simulation Layer — runs graph-only constraint checks and LLM-based simulations before agent dispatch.
- **outcome** (`packages/intelligence/src/outcome/`): Execution outcome ingestion — connects actual execution results back into the intelligence pipeline for feedback.
- **effectiveness** (`packages/intelligence/src/effectiveness/`): Persona effectiveness scoring, blind spot detection, and persona recommendation for agent routing.
- **specialization** (`packages/intelligence/src/specialization/`): Persistent agent expertise tracking with temporal decay, specialization profiles, and weighted persona recommendation.
- **analysis-provider** (`packages/intelligence/src/analysis-provider/`): Pluggable LLM analysis backends (Anthropic, OpenAI-compatible, Claude CLI).
- **adapters** (`packages/intelligence/src/adapters/`): Work item adapters for Jira, GitHub, Linear, and manual input normalization.

### Additional Core Modules

- **compaction** (`packages/core/src/compaction/`): Reduces MCP tool response token consumption through structural and truncation strategies with pagination support.
- **annotations** (`packages/core/src/annotations/`): Parses and manages protected code regions marked with annotations to prevent modification.
- **blueprint** (`packages/core/src/blueprint/`): Generates HTML documentation/UI from module data using templating and content pipeline processing.
- **ci** (`packages/core/src/ci/`): Orchestrates CI checks and formatting, producing reports and notifications.
- **caching** (`packages/core/src/caching/`): Manages prompt cache adapters and stability classification for multiple LLM providers.
- **constraints** (`packages/core/src/constraints/`): Validates architectural layers, detects circular dependencies, and enforces boundary rules across modules.
- **context** (`packages/core/src/context/`): Documentation coverage analysis, knowledge map validation, and progressive skill loading with token budgets.
- **entropy** (`packages/core/src/entropy/`): Detects and remediates codebase entropy including dead code, drift, complexity violations, and coupling problems.
- **feedback** (`packages/core/src/feedback/`): Self-review, peer review, telemetry, and action tracking for code change analysis and agent feedback loops.
- **interaction** (`packages/core/src/interaction/`): Schemas and types for structured agent-to-human interactions (questions, confirmations, transitions).
- **locks** (`packages/core/src/locks/`): Compound locking mechanisms for coordinating concurrent access to shared resources.
- **performance** (`packages/core/src/performance/`): Benchmarks, tracks baselines, detects regressions, and identifies critical paths in code.
- **pipeline** (`packages/core/src/pipeline/`): Executes multiple skills sequentially or in turn-based workflows with result aggregation.
- **pulse** (`packages/core/src/pulse/`): Orchestrates data collection from multiple sources with sanitization, windowing, and headline extraction.
- **solutions** (`packages/core/src/solutions/`): Scans and validates solution documentation with frontmatter schemas for bug tracking and knowledge categories.
- **validation** (`packages/core/src/validation/`): Validates project structure, configuration, commit messages, and agent/roadmap/solutions compliance.
- **workflow** (`packages/core/src/workflow/`): Executes structured workflows with multiple steps (experimental, internal use only).

### Additional Graph Subsystems

- **nlq** (`packages/graph/src/nlq/`): Natural language query interface — translates questions about the codebase into graph operations with intent classification, entity extraction, and human-readable summaries.
- **independence** (`packages/graph/src/independence/`): Task independence analysis and conflict severity prediction by detecting file overlaps and transitive dependency conflicts.
- **constraints** (`packages/graph/src/constraints/`): Validates architectural layer boundaries and detects import violations against design constraints via the graph.
- **feedback** (`packages/graph/src/feedback/`): Computes impact data tracking affected tests and documentation when files change, with harness health checks.
- **context** (`packages/graph/src/context/`): Assembles contextual graph data filtered by development phase with token budgets and coverage reporting.
- **entropy** (`packages/graph/src/entropy/`): Detects structural anomalies including statistical outliers and articulation points in the codebase graph.
- **search** (`packages/graph/src/search/`): Hybrid search layer using keyword and semantic fusion to find relevant nodes in the knowledge graph.
- **store** (`packages/graph/src/store/`): Core graph persistence and querying layer with node/edge management, serialization, and in-memory indexing.

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

**Commands** (`packages/cli/src/commands/`): ~50 commands organized by domain.

_Project Setup:_ `init`, `install`, `uninstall`, `setup`, `setup-mcp`, `setup-types`, `migrate`, `install-constraints`, `uninstall-constraints`, `generate`

_Validation & Checks:_ `validate`, `validate-cross-check`, `check-arch`, `check-deps`, `check-docs`, `check-perf`, `check-phase-gate`, `check-security`, `audit-protected`

_Analysis & Intelligence:_ `predict`, `recommend`, `advise-skills`, `impact-preview`, `traceability`, `adoption`, `usage`, `scan-config`, `taint`, `search`, `insights`

_Maintenance:_ `cleanup`, `cleanup-sessions`, `fix-drift`, `doctor`, `update`, `sync-main`, `sync-analyses`, `publish-analyses`, `snapshot`

_Content & Generation:_ `blueprint`, `create-skill`, `generate-agent-definitions`, `generate-slash-commands`, `knowledge-pipeline`, `share`

_Dashboard & Orchestrator:_ `dashboard`, `orchestrator`, `mcp`, `perf`

_Command groups_ (subdirectories): `agent/`, `ci/`, `compound/`, `graph/`, `hooks/`, `integrations/`, `learnings/`, `linter/`, `persona/`, `pulse/`, `roadmap/`, `skill/`, `state/`, `telemetry/`

_Notable single commands:_

- `usage.ts` — Loads and prices usage records from cost data and Claude sessions
- `taint.ts` — Manages session taint state to block destructive operations after injection detection
- `doctor.ts` — Runs system health checks (Node version, MCP config, integrations)
- `dashboard.ts` — Launches the web dashboard server on configurable ports
- `search.ts` — Hermes Phase 1: FTS5 + BM25 over `.harness/sessions/` and `.harness/archive/sessions/` (`harness search "<query>" [--reindex] [--archived-only] [--json]`)
- `insights.ts` — Hermes Phase 1: composite report combining health, entropy, decay, attention, impact (`harness insights [--json] [--skip <list>]`)
- `_registry.ts` — Auto-generated barrel export aggregating all command constructors

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

**MCP Tools** (`packages/cli/src/mcp/tools/`): ~62 tools organized by domain.

_Project & Validation:_ `init`, `validate`, `assess-project`, `phase-gate`, `state`, `compact`

_Architecture & Quality:_ `architecture`, `entropy`, `stale-constraints`, `constraint-emergence`, `cross-check`, `linter`, `performance`

_Code Navigation & Search:_ `code-nav`, `search-skills`, `recommend-skills`, `advise-skills`, `dispatch-skills`, `gather-context`, `find-context-for` (graph), `search-sessions` (Hermes Phase 1), `summarize-session` (Hermes Phase 1), `insights-summary` (Hermes Phase 1)

_Documentation & Review:_ `docs`, `review-changes`, `review-pipeline`, `feedback`, `interaction`, `interaction-schemas`, `interaction-renderer`

_Roadmap & CI:_ `roadmap`, `roadmap-auto-sync`, `roadmap-file-less`, `ci`

_Security & Traceability:_ `security`, `traceability`, `predict-failures`, `decay-trends`, `task-independence`, `conflict-prediction`

_Agent & Persona:_ `agent`, `persona`, `agent-definitions`, `generate-slash-commands`, `blueprint`, `event-emitter`

_Graph tools_ (`graph/` subdir): `compute-blast-radius`, `ask-graph`, `query-graph`, `detect-anomalies`, `ingest-source`, `find-context-for`, `search-similar`, `get-relationships`, `get-impact`

_Infrastructure:_ `middleware/injection-guard.ts` — wraps tool handlers with injection scanning for tainted session enforcement

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

### Orchestrator Gateway API (Hermes Phase 0)

`packages/orchestrator/src/server/http.ts` exposes a token-scoped, versioned HTTP API. Phases 1, 2, and 3 of the Hermes proposal have landed the auth substrate, audit log, OpenAPI artifact, `/api/v1/*` route doubling with `Deprecation` headers, three bridge-primitive endpoints, an SSE event-bus stream, and HMAC-signed webhook subscriptions with in-memory fan-out. Phase 4 will add durable webhook delivery (SQLite queue, exponential-backoff retry ladder, DLQ, drain-on-shutdown); Phase 5 will add OTLP telemetry export.

**Authentication model.** Every `/api/*` request flows through `dispatchAuthedRequest`. Tokens are bearer-format: `Authorization: Bearer tok_<16-hex-id>.<base64url-secret>`. Records persist in `.harness/tokens.json` as bcryptjs-hashed secrets (cost 12) with `id`, `name`, `scopes`, `createdAt`, optional `expiresAt`, optional `tenantId`, optional `bridgeKind`. The plaintext secret is returned exactly once at creation.

**Scope vocabulary** (pinned in `packages/orchestrator/src/auth/scopes.ts`): `admin`, `trigger-job`, `read-status`, `resolve-interaction`, `subscribe-webhook`, `modify-roadmap`, `read-telemetry`. `admin` is a superset. Changes to this set require an ADR. `requiredScopeForRoute(method, path)` maps every routed path to its required scope; unmapped routes default-deny (403 after audit).

**Audit log.** `.harness/audit.log` is append-only JSONL written best-effort by `AuditLogger`. Every request produces exactly one line: `{timestamp, tokenId, tenantId?, route, method, status}`. Status is captured at `res.on('finish')` — the wire-final status, not whatever was set before an async handler resolved. Request payloads and response bodies are never recorded. Write failures degrade silently (the request handler must keep serving).

**Versioned `/api/v1/*` surface (Phase 2).** Every legacy `/api/<name>(/...)` route is reachable at `/api/v1/<name>(/...)` via a URL rewrite inside `dispatchAuthedRequest`. A twelve-slug `V1_WRAPPABLE` set in `http.ts:413-426` (interactions, plans, analyze, analyses, roadmap-actions, dispatch-actions, local-model, local-models, maintenance, streams, sessions, chat-proxy) gates the rewrite; `/api/v1/state` is handled by an inlined shortcut. Legacy `/api/*` responses carry `Deprecation: 2027-05-14` (override via `HARNESS_DEPRECATION_DATE` env-var); `/api/v1/*` responses do not. The Deprecation gating keys off the **pre-rewrite** URL — the load-bearing invariant verified in `http-v1-aliases.test.ts`.

**Bridge primitives (Phase 2).** Three operational endpoints land natively under `/api/v1/`, handlers in `packages/orchestrator/src/server/routes/v1/`:

- `POST /api/v1/jobs/maintenance` (scope `trigger-job`, body `{taskId}`) — dispatches via `Orchestrator.dispatchAdHoc`; 200/404/409.
- `POST /api/v1/interactions/{id}/resolve` (scope `resolve-interaction`) — `InteractionQueue.updateStatus(id, 'resolved')` + emits `interaction.resolved` on the event bus; 200/404/409.
- `GET /api/v1/events` (scope `read-telemetry`) — Server-Sent Events stream of the orchestrator event bus.

**SSE event bus (Phase 2, extended in Phase 3).** `GET /api/v1/events` fans **eleven** event topics out as SSE frames after Phase 3: the nine Phase 2 topics (`state_change`, `agent_event`, `interaction.created`, `interaction.resolved`, `maintenance:started`, `maintenance:completed`, `maintenance:error`, `maintenance:baseref_fallback`, `local-model:status`) plus the two webhook lifecycle topics (`webhook.subscription.created`, `webhook.subscription.deleted`). Frame format: `event: <topic>\ndata: <json>\nid: evt_<8-byte-hex>\n\n`. 15-second heartbeat comment frames; `X-Accel-Buffering: no` defeats proxy buffering; cleanup on `close`/`finish` removes every subscribed listener. `Orchestrator extends EventEmitter` and calls `this.setMaxListeners(50)` in the constructor to absorb the multi-topic subscribe-on-connect pattern (Node default is 10). `InteractionQueue.constructor(dir, emitter?)` accepts the orchestrator as the optional bus; `push()` emits `interaction.created`, `updateStatus(id, 'resolved')` emits `interaction.resolved`. WebSocket fan-out via `server.broadcastInteraction` continues to run alongside event-bus emission for legacy dashboard consumers.

**Webhook subscriptions (Phase 3).** Three new routes under `/api/v1/webhooks` (`packages/orchestrator/src/server/routes/v1/webhooks.ts`): `POST /api/v1/webhooks` creates a subscription and returns the HMAC secret **exactly once**; `DELETE /api/v1/webhooks/{id}` revokes (stops fan-out within ~200ms — synchronous filter on every emit); `GET /api/v1/webhooks` lists secret-redacted subscriptions for the bearer's tokenId. All three require the `subscribe-webhook` scope. URL validation rejects `http://` URLs with 422. The three webhook path-method pairs (plus the Phase 2 bridge primitives) live in `V1_BRIDGE_ROUTES` (`packages/orchestrator/src/server/v1-bridge-routes.ts`) — single source of truth that both `buildApiRoutes()` and `scopes.ts` consume (closes Phase 2 cycle-2 DELTA-SUG-1).

**HMAC signing (Phase 3).** `packages/orchestrator/src/gateway/webhooks/signer.ts` signs the verbatim request body with the subscription's secret. Header format: `X-Harness-Signature: sha256=<lowercase-hex>`. Every delivery carries four canonical headers: `X-Harness-Signature`, `X-Harness-Delivery-Id` (`dlv_<8-byte-hex>`), `X-Harness-Event-Type` (normalized dotted form), `X-Harness-Timestamp` (Unix millis). Bridges verify with a ~5-line stdlib snippet: `'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')` plus `timingSafeEqual`. The body-verbatim contract means bridges MUST verify against raw bytes BEFORE parsing JSON — see the integration test at `packages/orchestrator/src/server/webhooks-integration.test.ts:40-51` which is the spec exit-gate proof.

**Webhook secret storage (Phase 3).** `WebhookStore` (`packages/orchestrator/src/gateway/webhooks/store.ts`) persists subscriptions to `.harness/webhooks.json` with `fs.chmod(path, 0o600)` after every write — secrets stored **plaintext at rest** per ADR 0011 § "Webhook secret storage model (Phase 3)" (industry pattern at single-tenant scope: infrastructure-layer encryption via FDE, not application-layer; alternatives rejected with rationale). `.gitignore` excludes `**/.harness/webhooks.json` (added alongside `tokens.json` and `audit.log` so all three runtime secret artifacts share one block). Rotation is delete-and-recreate.

**Event-bus fan-out with segment-glob filter (Phase 3).** `wireWebhookFanout` (`packages/orchestrator/src/gateway/webhooks/events.ts`) subscribes to 9 orchestrator topics and normalizes colon-separated legacy topics to dotted form (`maintenance:started` → `maintenance.started`) before running the segment-glob filter (`eventMatches` in `signer.ts:43-51`). A subscription with `events: ['maintenance.*']` therefore matches all four `maintenance:*` emits. Match semantics: split on `.`, segment count must match (no `**`), each segment is literal or `*`. **Phase 3 delivery is in-memory, best-effort, 3-second timeout, no retry, no DLQ** — Phase 4 lands the durable counterpart with the same `WebhookDelivery.deliver(sub, event)` API shape (additive swap).

**Dashboard `/s/webhooks` page (Phase 3).** `packages/dashboard/src/client/pages/Webhooks.tsx` provides list / create / revoke UI. Registered as the 12th entry in `SYSTEM_PAGES` (`packages/dashboard/src/client/types/thread.ts:67`) and bound in `ThreadView.tsx:40`. Create flow renders the one-shot secret reveal panel. The page inherits the `dashboard-browser-auth-context` carry-forward from Phase 2 — Phase 4 should address or escalate.

**CLI.** `harness gateway token create --name <label> --scopes <csv>` mints a new token (one-time secret reveal in stdout). `harness gateway token list` lists records with secrets redacted. `harness gateway token revoke <id>` deletes a record.

**MCP tools (Phase 2 + Phase 3).** `trigger_maintenance_job` (tier-1, standard+) calls `POST /api/v1/jobs/maintenance`; `list_gateway_tokens` (tier-0, core+) calls `GET /api/v1/auth/tokens`. Phase 3 added `subscribe_webhook` at tier-1 (`packages/cli/src/mcp/tools/webhook-tools.ts`); tier assignments in `packages/cli/src/mcp/tool-tiers.ts` (`CORE_TOOL_NAMES` line 26 holds `list_gateway_tokens`; `STANDARD_EXTRA` holds `trigger_maintenance_job` and `subscribe_webhook` lines 57-58). Three separate test assertions across `server.test.ts`, `server-integration.test.ts`, and `setup-mcp.test.ts` pin the tool-count total so drift on additions or removals fails the test suite.

**Dashboard.** `/s/tokens` (registered via `SYSTEM_PAGES` in `packages/dashboard/src/client/types/thread.ts`) provides a list/create/revoke UI. The dashboard does NOT mount a parallel `TokenStore`; the page calls `/api/v1/auth/*` on the dashboard server, and `packages/dashboard/src/server/orchestrator-proxy.ts` proxies the `/api/v1` prefix (in `ORCHESTRATOR_PREFIXES`) through to the orchestrator, preserving `Authorization`. Single-writer invariant on `.harness/tokens.json`: only the orchestrator writes it. See "Route Ownership" in [`docs/knowledge/orchestrator/gateway-api.md`](docs/knowledge/orchestrator/gateway-api.md).

**Compatibility signals.**

- `HARNESS_API_TOKEN` env-var: still authenticates, as a synthetic admin token (backward-compat invariant).
- `X-Harness-Auth-Mode: unauth-dev` response header: present on every reply when the orchestrator is in localhost-dev fallback (tokens.json empty AND `HARNESS_API_TOKEN` unset). A one-time `console.warn` fires on the first request in this mode per process.
- `Deprecation: <ISO-date>` response header: present on every response from a legacy `/api/<name>` route (not on `/api/v1/<name>`). Default `2027-05-14`; override via `HARNESS_DEPRECATION_DATE`.

**OpenAPI artifact.** `docs/api/openapi.yaml` is generated from Zod schemas via `@asteasolutions/zod-to-openapi` (orchestrator npm script `openapi:generate`). Phase 3 extended coverage to **18 paths** (3 auth + 3 bridge + 10 documented legacy aliases + 2 webhook routes; `/api/v1/webhooks` is POST+GET on one path, `/api/v1/webhooks/{id}` is DELETE on another). Version bumped to v0.3.0. CI workflow `.github/workflows/openapi-drift-check.yml` regenerates the artifact on every PR and fails on drift; the emitter is byte-identical across re-runs.

See [`docs/knowledge/orchestrator/gateway-api.md`](docs/knowledge/orchestrator/gateway-api.md) for the gateway API contract business-process node, [`docs/knowledge/orchestrator/webhook-fanout.md`](docs/knowledge/orchestrator/webhook-fanout.md) for the Phase 3 webhook fan-out pipeline (subscription lifecycle, segment-glob filter, delivery worker, Phase 4 extension points), and [ADR 0011](docs/knowledge/decisions/0011-orchestrator-gateway-api-contract.md) (status: in-progress, promotion to `accepted` deferred to Phase 4 + Phase 5) for the contract decisions including the "Webhook secret storage model (Phase 3)" addendum.

### Dashboard Package

`packages/dashboard/` is a React + Hono full-stack app providing a web-based project health dashboard.

**Client** (`src/client/`): React SPA with 12 pages (Adoption, Analyze, Attention, DecayTrends, Graph, Health, Impact, Maintenance, Orchestrator, Roadmap, Streams, Traceability), reusable components (KpiCard, GanttChart, DependencyGraph, BlastRadiusGraph, ProgressChart, ActionButton, StaleIndicator, Layout), and SSE-based live data hooks (`useSSE`, `useApi`).

**Server** (`src/server/`): Hono HTTP server with SSE connection manager running a shared polling loop. Routes: actions, actions-claim-file-less, adoption, ci, decay-trends, graph, health, health-check, impact, overview, roadmap, sse, traceability. Data gatherers: adoption, anomalies, arch, blast-radius, ci, decay-trends, entry-points, graph, health, perf, roadmap, security, traceability.

### Orchestrator Intelligence Integration

The orchestrator depends on `@harness-engineering/intelligence` for persona-aware dispatch. The `IntelligencePipelineRunner` (`packages/orchestrator/src/intelligence/pipeline-runner.ts`) orchestrates: spec enrichment (SEL), complexity scoring (CML), pre-execution simulation (PESL), analysis archiving, and auto-publishing. It imports `weightedRecommendPersona` and `refreshProfiles` from the intelligence package to route issues to the best-fit persona based on specialization profiles. Execution outcomes feed back into effectiveness scoring to improve future routing.

### Orchestrator Maintenance Tasks

`packages/orchestrator/src/maintenance/task-registry.ts` defines 21 built-in scheduled tasks across four execution strategies:

- **mechanical-ai (7):** `arch-violations`, `dep-violations`, `doc-drift`, `security-findings`, `entropy`, `traceability`, `cross-check` — run a check command first, dispatch an AI agent only if fixable findings exist.
- **pure-ai (4):** `dead-code`, `dependency-health`, `hotspot-remediation`, `security-review` — always dispatch an AI agent on schedule.
- **report-only (7):** `perf-check`, `decay-trends`, `project-health`, `stale-constraints`, `graph-refresh`, `product-pulse`, `compound-candidates` — run a command and record metrics; never create branches or PRs. Honors a JSON status contract (`{status, candidatesFound?, error?, reason?}`) emitted by the new `--non-interactive` CLIs; legacy free-form output falls through to `success`.
  - `product-pulse` (daily 8am, gated on `pulse.enabled`) — generates `docs/pulse-reports/` via `harness pulse run --non-interactive`.
  - `compound-candidates` (Mondays 9am) — surfaces undocumented learnings into `docs/solutions/.candidates/` via `harness compound scan-candidates --non-interactive`. Scheduled at 9am rather than 6am to avoid collision with the existing Monday 6am block (cross-check, perf-check, traceability).
- **housekeeping (3):** `session-cleanup`, `perf-baselines`, `main-sync` — run a mechanical command directly, no AI, no PR.

The dashboard `Maintenance` page renders a candidate-count badge on `compound-candidates` history rows when `findings > 0`.

### Solutions and Pulse Reports

Two artifact roots support the feedback-loops feature:

- `docs/solutions/<track>/<category>/<slug>.md` — solved-problem playbooks written
  via `/harness:compound`. Tracks: `bug-track/`, `knowledge-track/`. See
  `docs/conventions/compound-vs-knowledge-pipeline.md` for category guidance.
- `docs/pulse-reports/YYYY-MM-DD_HH-MM.md` — daily single-page pulse reports
  written by the `product-pulse` maintenance task. Read these when prioritizing.

The boundary with `harness-knowledge-pipeline` is documented in
ADR-0003 (`docs/knowledge/decisions/0003-compound-vs-knowledge-pipeline-boundary.md`):
compound captures post-mortem playbooks; the pipeline extracts structural facts
from code. Both `product-pulse` and `compound-candidates` are registered as
`report-only` maintenance tasks (see the orchestrator maintenance section).

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

### Integration Phase

The integration phase (INTEGRATE) is a verification gate between Verification and Code Review in the standard workflow. It confirms that planned integration tasks -- wiring, knowledge materialization, and documentation updates -- actually completed after execution.

**Position in workflow:** `VERIFY -> INTEGRATE -> REVIEW`

**Three sub-phases:**

- **WIRE** (all tiers): Verifies barrel exports are current (`pnpm run generate:barrels:check`), `harness validate` passes, and entry points are reachable. Always runs, even for small changes.
- **MATERIALIZE** (medium + large tiers): Verifies ADRs are written for architectural decisions, knowledge graph is enriched with decision nodes, and documentation tasks are complete.
- **UPDATE** (medium + large tiers): Verifies roadmap sync, changelog entries, and spec cross-references.

**Tiered rigor model:**

| Tier       | Signal                                            | Integration Requirements                                               |
| ---------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| **small**  | Bug fix, config change, < 3 files, no new exports | WIRE only (default checks always run)                                  |
| **medium** | New feature, new exports, 3-15 files              | WIRE + project updates (roadmap, changelog, graph enrichment)          |
| **large**  | New package, new skill, architectural change      | WIRE + project updates + knowledge materialization (ADRs, doc updates) |

The tier is estimated during planning and confirmed from execution results. The effective tier is `max(planned, derived)` -- the higher tier always wins.

**Skill:** `harness-integration` (Tier 1 workflow skill). Invoked via `/harness:integration` or dispatched by autopilot at the INTEGRATE state.

**ADRs:** Architectural decisions are recorded as markdown files in `docs/knowledge/decisions/` using sequential 4-digit numbering (e.g., `0001-decision-name.md`). ADRs are ingested by the knowledge pipeline as queryable `decision` graph nodes.

### Skill Tier System

Skills are classified into three tiers to preserve context. Only Tier 1 and Tier 2 skills are registered as slash commands; Tier 3 skills are discoverable via the `search_skills` MCP tool.

- **Tier 1 (Workflow, 14 skills):** Always-loaded slash commands for core workflow — brainstorming, planning, execution, autopilot, tdd, debugging, refactoring, skill-authoring, onboarding, initialize-project, add-component, harness-integration, harness-router, initialize-test-suite-project.
- **Tier 2 (Maintenance, 24 skills):** Always-loaded slash commands for project health — integrity, verify, code-review, release-readiness, docs-pipeline, codebase-cleanup, enforce-architecture, detect-doc-drift, cleanup-dead-code, dependency-health, hotspot-detector, security-scan, perf, impact-analysis, test-advisor, soundness-review, architecture-advisor, roadmap, verification, supply-chain-audit, roadmap-pilot, harness-compound, harness-knowledge-pipeline, harness-pulse.
- **Tier 3 (Catalog, 697 skills):** Discoverable on demand via `search_skills`. Includes domain skills (API design, database, deployment, containerization, etc.), design skills, i18n, and specialized testing.
- **Internal (6 skills):** Dependency-only, never surfaced. Invoked by other skills as part of pipelines.

The `search_skills` MCP tool (`packages/cli/src/mcp/tools/search-skills.ts`) queries a merged index of bundled + community skills. The index uses hash-based staleness detection. An intelligent dispatcher (`packages/cli/src/skill/dispatcher.ts`) suggests relevant Tier 3 skills when Tier 1 workflow skills start. Stack profile detection (`packages/cli/src/skill/stack-profile.ts`) identifies project technologies to bias suggestions. Configuration overrides in `harness.config.json` support `skills.alwaysSuggest`, `skills.neverSuggest`, and `skills.tierOverrides`.

### Community Skill Registry

The `@harness-skills/*` npm namespace enables publishing, discovering, and installing community skills. Key commands: `harness install`, `harness uninstall`, `harness skill search`, `harness skill create`, `harness skill publish`. Supports local installs (`--from ./path`), private registries (`--registry <url>`), and `.npmrc` auth tokens. Skills are pure content packages (no runtime code). Discovery priority: project-local > community > bundled.

Implementation in `packages/cli/src/registry/` and `packages/cli/src/commands/skill/`. See the [Skill Marketplace Guide](./docs/guides/skill-marketplace.md) for full usage, architecture, and examples.

### Project Roadmap

The project roadmap lives at `docs/roadmap.md` and tracks features across milestones with statuses (`backlog`, `planned`, `in-progress`, `done`, `blocked`). Core implementation in `packages/core/src/roadmap/` provides `parseRoadmap`, `serializeRoadmap`, and `syncRoadmap`. The `manage_roadmap` MCP tool (`packages/cli/src/mcp/tools/roadmap.ts`) exposes CRUD operations: `show`, `add`, `update`, `remove`, `query`, `sync`. The `harness-roadmap` skill provides interactive workflows: `--create`, `--add`, `--sync`, `--edit`, `--query`. Roadmap sync respects a "human-always-wins" rule — manually edited statuses are preserved unless `force_sync` is set. The orchestrator adapter (`packages/orchestrator/src/tracker/adapters/roadmap.ts`) maps roadmap features to the internal Issue model for agent orchestration.

**External tracker sync** — Bidirectional sync between `roadmap.md` and GitHub Issues via `TrackerSyncAdapter` (`packages/core/src/roadmap/tracker-sync.ts`). The `GitHubIssuesSyncAdapter` (`packages/core/src/roadmap/adapters/github-issues.ts`) uses label-based status disambiguation for the open/closed limitation. The sync engine (`packages/core/src/roadmap/sync-engine.ts`) provides `syncToExternal` (push planning fields), `syncFromExternal` (pull execution fields with directional guard via `status-rank.ts`), and `fullSync` (mutex-serialized read-push-pull-write cycle). Configuration via `roadmap.tracker` in `harness.config.json` (validated by `TrackerConfigSchema` in `packages/cli/src/config/schema.ts`). Auto-sync fires on 6 state transitions via `triggerExternalSync` in `packages/cli/src/mcp/tools/roadmap-auto-sync.ts`.

**File-less mode (opt-in)** — Setting `roadmap.mode: "file-less"` in `harness.config.json` makes the configured GitHub Issues tracker the canonical roadmap; `docs/roadmap.md` must not exist. All consumers (CLI, dashboard, MCP `manage_roadmap`, orchestrator, `harness:roadmap-pilot`) branch on the mode flag at runtime. Migrate with `harness roadmap migrate --to=file-less`. See `docs/guides/roadmap-sync.md` §"File-less mode" and ADRs 0008–0010 for the design rationale. See [docs/changes/roadmap-tracker-only/migration.md](docs/changes/roadmap-tracker-only/migration.md) for the operator walkthrough.

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

- **[docs/api/](./docs/api/)** - Handcrafted API documentation for packages (see also `docs/reference/api/` for auto-generated source indexes)

- **[docs/changes/](./docs/changes/)** - Detailed technical specifications for features
- **[docs/plans/](./docs/plans/)** - Implementation and execution plans
- **[docs/architecture/](./docs/architecture/)** - Architecture analysis and diagrams
- **[docs/knowledge/](./docs/knowledge/)** - ADRs (`decisions/`) and package-specific knowledge docs
- **[docs/research/](./docs/research/)** - Framework research and analysis
- **[docs/conventions/](./docs/conventions/)** - Format conventions (markdown interaction patterns)
- **[docs/guidelines/](./docs/guidelines/)** - Decision guides (e.g., MCP vs CLI)
- **[docs/solutions/](./docs/solutions/)** - Solved-problem playbooks
- **[docs/blueprint/](./docs/blueprint/)** - Blueprint HTML artifacts

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

| File                      | Purpose                                                                |
| ------------------------- | ---------------------------------------------------------------------- |
| `package.json`            | Root project metadata and scripts                                      |
| `pnpm-workspace.yaml`     | Monorepo workspace definition                                          |
| `tsconfig.json`           | Root TypeScript configuration with project references                  |
| `turbo.json`              | Turborepo build orchestration                                          |
| `eslint.config.js`        | ESLint configuration (flat config format)                              |
| `.prettierrc.json`        | Code formatting rules                                                  |
| `harness.config.json`     | Harness project settings (skills, roadmap, telemetry)                  |
| `harness.orchestrator.md` | Orchestrator runtime config (tracker, polling, agent backends/routing) |

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

**Last Updated**: 2026-04-27
**Version**: 1.2
**Maintained By**: AI Agents and Engineering Team
