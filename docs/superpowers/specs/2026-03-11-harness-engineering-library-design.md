# Harness Engineering Library - Design Specification

**Date**: 2026-03-11
**Status**: Draft
**Author**: AI Harness Engineering Team

## Executive Summary

The Harness Engineering Library is a comprehensive toolkit for teams transitioning from manual coding to agent-first development. It codifies the "AI Harness Engineering" standard - a systematic approach where human engineers design constraints and feedback loops that enable AI agents to work reliably and autonomously.

This specification defines a monorepo containing documentation, runtime libraries, CLI tools, custom linters, project templates, agent skills, and reference implementations - everything needed for engineering teams and AI agents to adopt harness engineering principles.

## Vision & Core Principles

### The Harness Engineering Standard

AI Harness Engineering represents a fundamental shift from manual implementation to systemic leverage:

- **Human Role**: Architect, intent-specifier, and validator
- **AI Role**: Executor, implementer, and primary maintainer of the codebase

The standard is built on six core principles:

#### 1. Context Engineering (Single Source of Truth)
AI agents are only as effective as the context they can access. All architectural decisions, product specs, and execution plans must be checked into the repository as version-controlled documentation.

- Repository-as-Documentation: Everything in git, nothing in Slack/Jira/human heads
- Knowledge Map Structure: AGENTS.md provides a top-level map of domain knowledge
- Comprehensive docs: /docs/core-beliefs.md, /docs/design-docs/, /docs/exec-plans/

#### 2. Architectural Rigidity & Mechanical Constraints
Constraints are productivity multipliers that prevent agents from exploring dead ends.

- Layered Dependency Model: Strict one-way flow (Types → Config → Repository → Service → UI)
- Mechanical Enforcement: Custom linters, structural tests, automated validation
- Boundary Parsing: Validate data shapes at module boundaries (using Zod, etc.)

#### 3. The Agent Feedback Loop
Agents must operate in a self-correcting cycle of execution and review.

- Agent-Led PRs: Agents describe tasks, run code, open PRs
- Self-Correction: Before human review, agents review their own changes and request peer reviews
- Observability Integration: Agents access telemetry to diagnose and fix their own failures

#### 4. Entropy Management (Garbage Collection)
AI-generated codebases can accumulate technical debt rapidly.

- Periodic Cleanup Agents: Scheduled agents for documentation alignment, pattern enforcement, dead code removal
- Continuous Validation: Ensure docs match implementation, patterns remain consistent

#### 5. Implementation Strategy (Depth-First)
Avoid breadth-first scaling where many features are built shallowly.

- One story to 100% completion: Design → Implementation → Testing → Deployment
- Build abstractions from concrete: Use learnings from each vertical slice to inform the next

#### 6. Key Performance Indicators
Measure success through:

- **Agent Autonomy**: % of PRs completed without human code intervention
- **Harness Coverage**: % of architectural rules enforced mechanically
- **Context Density**: Ratio of knowledge in repository vs. external docs

---

## Target Audiences

1. **Engineering teams adopting AI agents** - Teams transitioning from manual coding to agent-first development
2. **AI agents themselves** - The library provides skills, linters, and validation tools that agents consume directly
3. **Enterprise/platform teams** - Teams building internal platforms who need standardized harness patterns

---

## Design Section 1: Project Structure & Organization

The harness-engineering project is a **unified monorepo** using pnpm workspaces and Turborepo for build orchestration.

### Repository Structure

```
harness-engineering/
├── .github/
│   ├── workflows/          # CI/CD for all packages
│   └── CODEOWNERS          # Ownership per package
├── docs/
│   ├── standard/           # The Harness Engineering Standard
│   │   ├── 00-index.md     # High-level manifesto (6 core sections)
│   │   ├── 01-context-engineering.md
│   │   ├── 02-architectural-constraints.md
│   │   ├── 03-agent-feedback-loop.md
│   │   ├── 04-entropy-management.md
│   │   ├── 05-implementation-strategy.md
│   │   └── 06-kpis.md
│   ├── guides/             # Detailed implementation guides
│   │   ├── adoption-levels.md
│   │   ├── setting-up-context-engineering.md
│   │   └── ...
│   ├── reference/          # API docs, CLI reference
│   └── architecture/       # ADRs, system diagrams
├── packages/
│   ├── core/               # @harness-engineering/core (TypeScript)
│   ├── core-python/        # harness-engineering (Python)
│   ├── cli/                # harness-cli (Rust or Go)
│   ├── linter-gen/         # @harness-engineering/linter-generator
│   ├── eslint-plugin/      # @harness-engineering/eslint-plugin
│   ├── config/             # @harness-engineering/config (shared configs)
│   └── types/              # @harness-engineering/types (shared types)
├── agents/
│   ├── skills/             # Claude Code/Gemini CLI skills
│   │   ├── validate-context-engineering/
│   │   ├── enforce-architecture/
│   │   ├── harness-tdd/
│   │   ├── harness-code-review/
│   │   ├── detect-doc-drift/
│   │   └── ...
│   ├── personas/           # Agent configuration files
│   │   ├── architecture-enforcer.json
│   │   ├── documentation-maintainer.json
│   │   ├── entropy-cleaner.json
│   │   └── ...
│   └── mcp-servers/        # MCP server implementations
│       └── harness-mcp/
├── templates/
│   ├── basic/              # Level 1 adoption
│   ├── intermediate/       # Level 2 adoption
│   ├── advanced/           # Level 3 adoption
│   └── frameworks/         # Next.js, NestJS, etc.
│       ├── nextjs/
│       ├── nestjs/
│       ├── express/
│       └── fastify/
├── examples/
│   ├── todo-app/           # Simple reference (basic patterns)
│   ├── api-service/        # API-focused example
│   ├── data-pipeline/      # Different domain example
│   └── progression/        # Shows adoption journey
│       ├── step-1-basic/
│       ├── step-2-constraints/
│       └── step-3-full-harness/
├── integrations/
│   ├── ci-cd/              # GitHub Actions, GitLab CI templates
│   ├── observability/      # OpenTelemetry, Sentry guides
│   └── build-tools/        # Turborepo, Nx integration guides
├── ROADMAP.md              # Living roadmap document
├── AGENTS.md               # Knowledge map for AI agents
├── package.json            # Root package.json
├── pnpm-workspace.yaml
└── turbo.json
```

### Key Design Decisions

1. **Monorepo from day 1**: Single source of truth, shared tooling, consistent versioning
2. **Documentation-first**: `/docs` is a top-level, first-class component
3. **Agents as peers**: `/agents` directory contains skills, personas, and MCP servers
4. **Templates vs Examples**: Templates for scaffolding, examples for reference/learning
5. **Language-agnostic tooling**: CLI and linters in Rust/Go work across languages
6. **Language-specific runtime libraries**: `core` (TypeScript), `core-python`, etc.

### Technology Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Primary language**: TypeScript (packages/core)
- **CLI/Linters**: Rust or Go (cross-platform, performant)
- **Documentation**: VitePress or Docusaurus
- **Package naming**: `@harness-engineering/*` for npm packages

---

## Design Section 2: Phase 1 - Documentation & Standard

The documentation is the foundation - it defines the principles that everything else implements.

### Three-Tier Documentation Structure

#### Tier 1: The Standard (Manifesto)

High-level document (`docs/standard/00-index.md`) presenting the 6 core principles as the canonical standard. This is prescriptive and opinionated - "This is THE way to do harness engineering."

- **Length**: ~100-150 lines, readable in 10 minutes
- **Audience**: Engineering leaders, architects, teams evaluating adoption
- **Tone**: Philosophical anchor, establishes "why" before "how"

Each principle gets its own deep-dive document:
- `01-context-engineering.md` - Repository-as-documentation, knowledge maps, AGENTS.md structure
- `02-architectural-constraints.md` - Layered dependencies, mechanical enforcement, boundary parsing
- `03-agent-feedback-loop.md` - Agent-led PRs, self-correction, observability integration
- `04-entropy-management.md` - Cleanup agents, documentation alignment, pattern enforcement
- `05-implementation-strategy.md` - Depth-first approach, validation before scaling
- `06-kpis.md` - Agent autonomy, harness coverage, context density metrics

#### Tier 2: Implementation Guides

Practical, detailed guides in `docs/guides/` showing HOW to implement each principle:

- **Adoption path**: `adoption-levels.md` defines Level 1 (basic), Level 2 (intermediate), Level 3 (full harness) with concrete checklists
- **Setup guides**: Step-by-step for each principle:
  - "Setting up Context Engineering"
  - "Creating Custom Linters"
  - "Implementing the Agent Feedback Loop"
  - "Deploying Cleanup Agents"
- **Best practices**: Patterns that work, anti-patterns to avoid
- **Migration guides**: Moving existing projects to harness engineering

#### Tier 3: Reference Architecture

Technical documentation in `docs/architecture/`:

- **ADRs** (Architecture Decision Records) - Why specific choices were made
- **System diagrams** - How components interact (Mermaid diagrams)
- **API references** - Generated from code (TypeDoc for TS, rustdoc for Rust)
- **Integration patterns** - How harness engineering works with different tech stacks

### The AGENTS.md Knowledge Map

A top-level `AGENTS.md` file (~100 lines) that tells AI agents where to find domain knowledge:

```markdown
# Harness Engineering Knowledge Map

## About This Project
Harness Engineering Library - comprehensive toolkit for agent-first development.

## Core Principles
- Standard definition: `docs/standard/00-index.md`
- Context engineering: `docs/standard/01-context-engineering.md`
- Architectural constraints: `docs/standard/02-architectural-constraints.md`
- Agent feedback loop: `docs/standard/03-agent-feedback-loop.md`
- Entropy management: `docs/standard/04-entropy-management.md`
- Implementation strategy: `docs/standard/05-implementation-strategy.md`
- KPIs: `docs/standard/06-kpis.md`

## Implementation
- Core library (TypeScript): `packages/core/README.md`
- CLI tool: `packages/cli/README.md`
- Linter generator: `packages/linter-gen/README.md`
- ESLint plugin: `packages/eslint-plugin/README.md`

## Agent Resources
- Skills directory: `agents/skills/`
- Agent personas: `agents/personas/`
- MCP server: `agents/mcp-servers/harness-mcp/`

## Examples & Templates
- Simple todo app: `examples/todo-app/`
- API service: `examples/api-service/`
- Data pipeline: `examples/data-pipeline/`
- Progression series: `examples/progression/`
- Templates: `templates/`

## Integrations
- Framework guides: `integrations/`
- CI/CD templates: `integrations/ci-cd/`

## Project Management
- Roadmap: `ROADMAP.md`
- ADRs: `docs/architecture/decisions/`
- Active work: `docs/exec-plans/`
```

### Documentation Site

Built with **VitePress** or **Docusaurus**:
- Searchable, navigable from markdown files
- Deployed to GitHub Pages or Vercel
- Versioned (different versions for each major release)
- Includes interactive examples and code playgrounds

---

## Design Section 3: Phase 1 - Core Runtime Library

The `@harness-engineering/core` TypeScript library provides runtime APIs implementing all 6 harness engineering principles.

### Package Structure

```
packages/core/
├── src/
│   ├── context/           # Context Engineering APIs
│   ├── constraints/       # Architectural Constraints
│   ├── feedback/          # Agent Feedback Loop
│   ├── entropy/           # Entropy Management
│   ├── validation/        # Cross-cutting validation
│   └── index.ts
├── tests/
├── package.json
└── README.md
```

### Module 1: Context Engineering (`context/`)

**Purpose**: Validate and enforce repository-as-documentation patterns.

**Key APIs**:

```typescript
// Validate AGENTS.md structure
validateAgentsMap(path: string): ValidationResult

// Check documentation coverage for a domain
checkDocCoverage(domain: string): CoverageReport

// Ensure knowledge map integrity (no broken links)
validateKnowledgeMap(): IntegrityReport

// Generate AGENTS.md from code structure
generateAgentsMap(config: AgentsMapConfig): string
```

**Implementation approach**:
- Parse AGENTS.md and validate against schema (Zod)
- Check all links resolve to actual files
- Analyze code structure and compare against documented knowledge map
- Generate coverage reports showing documentation gaps

### Module 2: Architectural Constraints (`constraints/`)

**Purpose**: Runtime enforcement of layered dependencies and boundary parsing.

**Key APIs**:

```typescript
// Define architectural layers
defineLayer(name: string, dependencies: string[]): Layer

// Validate dependency graph
validateDependencies(graph: DependencyGraph): ValidationResult

// Boundary parsing with Zod
createBoundarySchema<T>(schema: ZodSchema<T>): BoundaryParser<T>

// Check for circular dependencies
detectCircularDeps(modules: Module[]): CircularDependency[]
```

**Implementation approach**:
- Use AST parsing (`@typescript-eslint/parser`) to analyze import statements
- Build dependency graph and validate against defined architectural rules
- Detect circular dependencies using graph algorithms
- Provide Zod-based boundary validation for runtime type safety

### Module 3: Agent Feedback (`feedback/`)

**Purpose**: APIs for agents to self-review, request peer reviews, and access telemetry.

**Key APIs**:

```typescript
// Agent self-review workflow
createSelfReview(changes: CodeChanges): ReviewChecklist

// Request peer review from specialized agent
requestPeerReview(agent: AgentType, context: ReviewContext): Promise<Review>

// Access telemetry for debugging
getTelemetry(service: string, timeRange: TimeRange): TelemetryData

// Agent observability - log agent actions
logAgentAction(action: AgentAction): void
```

**Implementation approach**:
- Integrate with OpenTelemetry for telemetry access
- Provide structured logging for agent actions (audit trail)
- APIs to spawn review agents (via subprocess or API calls)
- Checklist generation based on harness engineering principles

### Module 4: Entropy Management (`entropy/`)

**Purpose**: Detect documentation drift, pattern violations, and dead code.

**Key APIs**:

```typescript
// Detect doc drift - docs that don't match implementation
detectDocDrift(): DriftReport

// Find pattern violations - code that deviates from standards
findPatternViolations(rules: Pattern[]): Violation[]

// Dead code detection
detectDeadCode(): DeadCodeReport

// Auto-fix common issues
autoFixEntropy(report: EntropyReport): FixResult
```

**Implementation approach**:
- Combine static analysis (AST parsing) with file system analysis
- Compare documentation to actual code structure
- Detect unused exports, imports, functions
- Auto-fix simple issues (remove unused imports, format drift, etc.)

### Module 5: Validation (`validation/`)

**Purpose**: Cross-cutting validation utilities used by all other modules.

**Key APIs**:

```typescript
// Validate file structure matches conventions
validateFileStructure(conventions: Convention[]): ValidationResult

// Type-safe config validation
validateConfig<T>(config: unknown, schema: ZodSchema<T>): T

// Validate commit messages follow standards
validateCommitMessage(message: string): ValidationResult
```

**Implementation approach**:
- File system traversal and pattern matching
- Zod schema validation for configs
- Regex/parser-based validation for commit messages
- Extensible validation framework for custom rules

### Design Principles

1. **Agent-first APIs**: Every API returns structured, JSON-serializable data that agents can parse
2. **Progressive adoption**: Core utilities work standalone - don't need to use all modules
3. **Type-safe by default**: Heavy use of TypeScript generics and Zod for runtime safety
4. **Observable**: All operations emit structured logs and metrics (OpenTelemetry)
5. **Testable**: Pure functions where possible, dependency injection for I/O

### Language Ports

Once `@harness-engineering/core` (TypeScript) is stable, create ports for other languages:

- **Python**: `harness-engineering` (PyPI)
- **Go**: `github.com/harness-engineering/core`
- **Rust**: `harness-engineering` (crates.io)

Same API surface, idioms adapted to each language (e.g., Python uses decorators, Go uses interfaces).

---

## Design Section 4: Roadmap Overview (Phases 2-4)

The roadmap follows a phased approach with parallel tracks. Each phase has clear deliverables and success criteria.

### Phase 1: Foundation (Months 1-3)

**Deliverables**:
- Documentation & Standard (all three tiers)
- Core runtime library (`@harness-engineering/core`)
- Basic project structure and tooling (monorepo setup)
- AGENTS.md knowledge map
- First reference example (todo-app)

**Success Criteria**:
- Documentation validated by 2-3 early adopters
- Core library covers all 6 principles with >80% test coverage
- Todo-app demonstrates all principles working end-to-end
- Zero broken links in documentation

---

### Phase 2: Tooling & Automation (Months 4-6)

#### Parallel Track A - CLI Tool (`harness-cli`)

Built in **Rust** for performance and cross-platform support.

**Commands**:
- **Scaffolding**: `harness init`, `harness add <component>`
- **Validation**: `harness validate`, `harness check-deps`, `harness check-docs`
- **Agent orchestration**: `harness agent run <task>`, `harness agent review`
- **Cleanup**: `harness cleanup`, `harness fix-drift`

**Features**:
- Interactive prompts for configuration
- JSON/YAML config file support
- Integration with `@harness-engineering/core` for validation
- Plugin system for extensibility

#### Parallel Track B - Linters

**Linter Generator** (`@harness-engineering/linter-gen`):
- Code-generate custom linters from config files
- Define architectural rules in YAML/JSON
- Generate ESLint rules, Rust-based linter rules, etc.

**ESLint Plugin** (`@harness-engineering/eslint-plugin`):
- Pre-built rules for common harness patterns
- TypeScript/JavaScript integration
- Rules for: layered deps, circular deps, boundary violations

**Architecture Validation Rules**:
- No imports from higher layers (enforces one-way dependencies)
- No circular dependencies between modules
- Boundary validation at module edges

#### Parallel Track C - Agent Skills

**Enforcement Skills**:
- `validate-context-engineering` - Check AGENTS.md, doc coverage
- `enforce-architecture` - Validate dependencies, detect violations
- `check-mechanical-constraints` - Run all linters and validation

**Workflow Skills**:
- `harness-tdd` - Test-driven development with harness principles
- `harness-code-review` - Review code against harness standards
- `harness-refactoring` - Refactor while maintaining constraints

**Entropy Skills**:
- `detect-doc-drift` - Find docs that don't match code
- `cleanup-dead-code` - Remove unused code
- `align-documentation` - Update docs to match implementation

**Setup Skills**:
- `initialize-harness-project` - Scaffold new harness project
- `add-harness-component` - Add component following patterns

**Success Criteria**:
- CLI can scaffold a harness-compliant project in <5 minutes
- Linters catch >90% of architectural violations automatically
- Agent skills work in Claude Code and Gemini CLI
- Second reference example (api-service) demonstrates Phase 2 tooling

---

### Phase 3: Templates & Agents (Months 7-9)

#### Track A - Project Templates

**Adoption Level Templates**:
- `basic/` - Level 1: AGENTS.md, basic docs, simple constraints
- `intermediate/` - Level 2: Full docs, linters, some agent integration
- `advanced/` - Level 3: Complete harness with agent loop, entropy management

**Architecture Templates**:
- Single service with full harness
- Multi-service (microservices) with shared harness config

**Framework-Specific Templates**:
- Next.js with harness engineering
- NestJS with harness engineering
- Express with harness engineering
- Fastify with harness engineering

#### Track B - Customized Agents

**Agent Personas** (JSON/YAML configs):
```json
{
  "name": "Architecture Enforcer",
  "role": "Validate architectural constraints",
  "skills": ["enforce-architecture", "check-mechanical-constraints"],
  "tools": ["linter", "dependency-analyzer"],
  "triggers": ["on_pr", "on_commit"]
}
```

**Claude Code Specialized Agents**:
- Architecture Enforcer - Validates dependencies and constraints
- Documentation Maintainer - Keeps docs in sync with code
- Entropy Cleaner - Runs cleanup tasks, fixes drift

**MCP Server** (`harness-mcp`):
- Provides harness tools to any MCP-compatible AI
- Tools: validate, lint, check-docs, detect-drift
- Works with Claude Desktop, Continue.dev, other MCP clients

**Agent Deployment Guides**:
- Running agents in CI/CD (GitHub Actions, GitLab CI)
- Local agent workflows
- Scheduled cleanup agents (cron jobs)

**Success Criteria**:
- Templates can scaffold production-ready projects
- Customized agents can be deployed and run autonomously
- MCP server works with multiple MCP clients
- Third reference example (data-pipeline) demonstrates different domain

---

### Phase 4: Ecosystem & References (Months 10-12)

#### Track A - Framework Integrations

**Integration Guides**:
- Next.js - App Router, Pages Router
- NestJS - Modules, providers, controllers
- Express - Middleware, routing
- Remix - Loaders, actions
- Fastify - Plugins, hooks

**Build Tool Integrations**:
- Turborepo - Integration with harness validation
- Nx - Custom generators for harness patterns
- pnpm/Yarn workspaces - Monorepo setup

**Testing Integrations**:
- Vitest - Test structure, coverage
- Jest - Configuration, custom matchers
- Playwright - E2E testing patterns
- Cypress - Component testing

#### Track B - Platform Integrations

**CI/CD Templates**:
- GitHub Actions - Workflow files for validation, linting, agent reviews
- GitLab CI - Pipeline configurations
- CircleCI - Config examples

**Observability Guides**:
- OpenTelemetry - Instrumentation setup
- Sentry - Error tracking integration
- DataDog - Metrics and APM
- Prometheus - Custom metrics

**Deployment Platforms**:
- Vercel - Deployment configuration
- Railway - Setup guides
- Fly.io - Deployment patterns
- AWS/GCP/Azure - Cloud deployment guides

#### Track C - Reference Implementations

**Complete the Progression Series** (`examples/progression/`):
- Step 1: Basic project, add AGENTS.md and docs
- Step 2: Add architectural constraints and linters
- Step 3: Full harness with agent loop and entropy management

**Polish Reference Examples**:
- All examples production-grade, fully documented
- Video walkthroughs for each example
- Blog posts explaining patterns

**Community Showcase**:
- Feature projects built with harness engineering
- Case studies and testimonials
- Contribution guidelines

**Success Criteria**:
- Integration guides cover top 10 tools/frameworks
- 3+ production projects using harness engineering
- 5+ community contributions (PRs, issues, discussions)
- Documentation site has >1000 monthly visitors

---

### Living Roadmap Document

The roadmap lives in `ROADMAP.md` as a living document:

```markdown
# Harness Engineering Roadmap

## Vision
[Elevator pitch]

## Current Status
- Phase: 1 (Foundation)
- Last Updated: 2026-03-11
- Next Milestone: Core library v0.1.0

## Phases
[High-level phase breakdown with dates]

## Detailed Breakdown
[Task-level breakdown with:
 - Dependencies
 - Assignees
 - Status (Not Started | In Progress | Completed)
 - Target dates]

## Completed Milestones
[Archive of completed work with dates and metrics]

## Future Considerations
[Ideas not yet committed to roadmap]

## Metrics Dashboard
[Link to automated metrics collection]
```

Updated monthly or after major milestones.

---

## Design Section 5: Development Workflow & Tooling

The harness-engineering project applies its own principles - "eating our own dog food."

### Monorepo Tooling

- **pnpm** (v8+) for package management
- **Turborepo** for build orchestration and caching
- **Changesets** for versioning and changelog management
- **TypeScript** (v5+) with strict mode
- **ESLint** with strict rules + Prettier for formatting

### Self-Application of Harness Principles

#### 1. Context Engineering
- Top-level `AGENTS.md` knowledge map (~100 lines)
- All ADRs in `docs/architecture/decisions/`
- Every package has comprehensive README
- Active work tracked in `docs/exec-plans/`

#### 2. Architectural Constraints
- Strict layered dependencies: `types` → `config` → `core` → `cli/linter-gen/etc.`
- No circular dependencies enforced by build-time checks
- Boundary parsing using Zod for all config/API surfaces

#### 3. Agent Feedback Loop
- Agent-led development: AI agents draft PRs, run tests, self-review
- Automated PR reviews: GitHub Action using our own agent personas
- Observability: OpenTelemetry for monitoring agent actions

#### 4. Entropy Management
- Weekly cleanup job: Automated PR checking for doc drift, dead code
- Documentation sync checks: CI fails if code/docs are out of sync
- Pattern enforcement: Monthly review for one-off patterns

#### 5. Implementation Strategy (Depth-First)
- One feature at a time to 100% completion
- No breadth-first: Don't start Phase 2 until Phase 1 is production-ready

#### 6. KPIs Tracked
- **Agent Autonomy**: % of PRs merged without human code changes
- **Harness Coverage**: % of architectural rules enforced mechanically
- **Context Density**: Lines of docs vs. lines of code ratio

### CI/CD Pipeline

**GitHub Actions workflows**:

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - Check AGENTS.md integrity
      - Validate documentation coverage
      - Run architectural linting

  test:
    runs-on: ubuntu-latest
    steps:
      - Run unit tests (all packages)
      - Run integration tests
      - Check test coverage >80%

  build:
    runs-on: ubuntu-latest
    steps:
      - Build all packages (Turborepo)
      - Type-check with tsc
      - Generate API docs

  agent-review:
    runs-on: ubuntu-latest
    steps:
      - Spawn agent-reviewer for automated code review
      - Run entropy detection
      - Check for pattern violations
```

**Release workflow**:
- Changesets for version bumps and changelog
- Automated releases to npm, crates.io, PyPI
- Deploy docs site to Vercel on release
- GitHub Releases with release notes

### Development Process

**For contributors**:
1. Read `AGENTS.md` to understand knowledge map
2. Check `ROADMAP.md` for current priorities
3. Create feature branch: `feature/phase-X-component-name`
4. Work with AI agents (use harness-engineering skills if available)
5. Agent opens PR with self-review
6. Automated agent-reviewer provides feedback
7. Human maintainer final review
8. Merge to main, automated release

**For maintainers**:
- Monthly roadmap updates
- Weekly entropy cleanup reviews
- Quarterly agent autonomy metrics analysis

### Testing Strategy

- **Unit tests**: Jest/Vitest for all packages, >80% coverage
- **Integration tests**: End-to-end tests for CLI workflows, agent interactions
- **Reference examples as tests**: Examples must build and pass tests (ensures they stay up-to-date)
- **Documentation tests**: Links and code examples must be valid

### Branching & Versioning

- **Main branch**: Always production-ready
- **Feature branches**: One feature at a time (depth-first)
- **Semantic versioning**: Major.Minor.Patch
- **Pre-releases**: Alpha/beta for early testing

---

## Design Section 6: Success Metrics & KPIs

How we measure success across different phases and audiences.

### Phase 1: Foundation (Months 1-3)

**Documentation Quality**:
- ✓ Standard validated by 3+ early adopters
- ✓ Zero broken links in knowledge map
- ✓ 100% of code examples tested and working

**Library Quality**:
- ✓ >80% test coverage
- ✓ All 6 principles have working APIs
- ✓ Type-safe (zero `any` types in public APIs)
- ✓ Performance: validation operations <100ms

**Early Validation**:
- ✓ 1-2 teams pilot the library internally
- ✓ First reference example demonstrates all principles
- ✓ Positive feedback on API ergonomics

---

### Phase 2: Tooling & Automation (Months 4-6)

**CLI Adoption**:
- 10+ projects scaffolded with `harness init`
- CLI validation completes in <5 seconds
- 100% of validation rules automated

**Linter Effectiveness**:
- >90% of architectural violations caught automatically
- <5% false positive rate
- Linter setup takes <10 minutes

**Agent Skill Usage**:
- Skills work in Claude Code and Gemini CLI
- 5+ developers using harness skills regularly
- Agent-led PRs have 50%+ autonomy rate

---

### Phase 3: Templates & Agents (Months 7-9)

**Template Adoption**:
- 20+ projects started from templates
- Templates reduce setup time from days to <1 hour
- Framework templates have >10 users each

**Agent Autonomy**:
- Customized agents complete 70%+ tasks without human intervention
- MCP server has 10+ active users
- Agent-led PRs merged with zero code changes: 40%+ rate

**Community Growth**:
- GitHub stars: 500+
- npm weekly downloads: 100+
- Discord/community: 50+ members

---

### Phase 4: Ecosystem & References (Months 10-12)

**Ecosystem Integration**:
- Integration guides for top 10 tools/frameworks
- 50+ projects using harness-engineering in production
- 3+ blog posts/articles from external authors

**Reference Quality**:
- All reference examples production-grade
- Video tutorials: 5+ with 1000+ views
- Community showcase: 10+ projects featured

**Community Maturity**:
- GitHub stars: 2000+
- npm weekly downloads: 500+
- Active contributors: 10+
- Discord/community: 200+ members

---

### Ongoing KPIs (Project-Level)

**Agent Autonomy** (Primary KPI):
- % of PRs merged without human code intervention
- **Target**: 60% by Month 6, 80% by Month 12

**Harness Coverage**:
- % of architectural rules enforced mechanically vs. manual review
- **Target**: 90% by Month 6, 95% by Month 12

**Context Density**:
- Ratio of documentation (lines in `/docs`) to code (lines in `/packages`)
- **Target**: >0.3 (e.g., 3000 lines of docs for 10,000 lines of code)

**Effectiveness Metrics** (for teams using the library):
- Time to onboard new developers (should decrease)
- Bug density (should decrease as constraints catch issues early)
- Documentation drift incidents (should approach zero)

---

### Success Definition

**Minimum Viable Success (Month 12)**:
- 3+ production teams using harness-engineering
- Agent autonomy >70% on harness-engineering repo itself
- All Phase 1-4 components delivered and stable
- Active community (100+ Discord members, 10+ contributors)

**Aspirational Success (Month 18+)**:
- 50+ production teams using harness-engineering
- Featured in major AI/engineering conferences
- Language ports (Python, Go, Rust) at feature parity with TypeScript
- Industry adoption as a standard for agent-first development

---

### Measurement & Reporting

**Monthly KPI Dashboard**:
- Automated metrics collection (GitHub API, npm stats, telemetry)
- Dashboard in `docs/metrics/` (markdown + charts)
- Reviewed in monthly maintainer sync

**Quarterly OKRs**:
- Set objectives and key results each quarter
- Published in `ROADMAP.md`
- Retrospective on what worked/what didn't

---

## Implementation Approach

This specification defines the complete vision for harness-engineering. Implementation follows the depth-first strategy:

1. **Phase 1 first**: Build documentation and core library to 100% completion before starting Phase 2
2. **One component at a time**: Within each phase, focus on one component until it's production-ready
3. **Validate before scaling**: Get early adopters using each phase before moving to the next
4. **Self-application**: Use harness-engineering principles to build harness-engineering itself

---

## Open Questions & Future Considerations

1. **Licensing**: Open-source (MIT/Apache 2.0) or dual-license (open core + enterprise)?
2. **Commercial model**: Free for all, or paid enterprise features?
3. **Governance**: BDFL, committee, foundation?
4. **Community platform**: Discord, Discourse, GitHub Discussions?
5. **Language priority for ports**: Python first, or Go/Rust?

---

## Conclusion

The Harness Engineering Library represents a fundamental shift in how software is built - from manual coding to systemic leverage through AI agents. By codifying constraints, feedback loops, and documentation practices, we enable teams to achieve higher velocity, better quality, and greater autonomy for AI agents.

This specification provides a complete roadmap from vision to implementation, with clear success criteria at each phase. The next step is to create a detailed implementation plan for Phase 1 (Documentation & Core Library) and begin execution.
