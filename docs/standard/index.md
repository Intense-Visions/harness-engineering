# Harness Engineering Standard

Welcome to the Harness Engineering Standard - the manifesto that defines how teams transition from manual coding to **agent-first development**.

## What is Harness Engineering?

Harness Engineering is a systematic approach to software development where **human engineers architect and validate**, while **AI agents execute and maintain** the codebase. Instead of manually writing every line of code, teams design constraints and feedback loops that enable AI agents to work reliably and autonomously.

This represents a fundamental shift in the human-AI partnership:

- **Human Role**: Architect intent, design constraints, validate results
- **AI Role**: Execute, implement, maintain code, and operate within engineered constraints

## Why It Matters

### The Problem

Traditional software development doesn't scale with AI agents:

- Agents lack context about architectural decisions and constraints
- Without mechanical guardrails, agents drift from intended patterns
- Knowledge lives in Slack, Jira, and human heads - inaccessible to AI
- Each agent-generated PR requires extensive human review and rework

### The Solution

Harness Engineering codifies the practices that make agent-driven development viable:

1. **Documentation as truth** - All architectural decisions live in git, version-controlled and accessible
2. **Mechanical constraints** - Architectural rules are enforced by code, not hope
3. **Feedback loops** - Agents review their own work before humans see it
4. **Entropy management** - Systematic cleanup prevents technical debt accumulation
5. **Depth-first implementation** - Build complete features rather than breadth-first scaffolding
6. **Measurable success** - Track agent autonomy, harness coverage, and context density
7. **Deterministic-vs-LLM split** - If it can be expressed as if-else logic, enforce it mechanically, not via LLM judgment

## The Seven Core Principles

### 1. Context Engineering

**Single Source of Truth**: AI agents are only as effective as the context they can access.

All architectural decisions, product specs, and execution plans must be checked into the repository as version-controlled documentation. No knowledge in Slack, Jira, or human heads.

**Key aspects**:

- Repository-as-Documentation pattern
- AGENTS.md knowledge map for navigation
- Comprehensive architecture docs, design docs, and execution plans

[Read more about Context Engineering →](./principles.md#1-context-engineering)

---

### 2. Architectural Rigidity & Mechanical Constraints

**Productivity Multipliers**: Constraints prevent agents from exploring dead ends and wasting compute.

Define strict, one-way dependency flows (Types → Config → Repository → Service → UI) and enforce them mechanically through linters, structural tests, and automated validation.

**Key aspects**:

- Layered dependency model with one-way flows
- Mechanical enforcement via custom linters
- Boundary parsing with schema validation (Zod, Pydantic, etc.)

[Read more about Architectural Constraints →](./principles.md#2-architectural-rigidity--mechanical-constraints)

---

### 3. The Agent Feedback Loop

**Self-Correction**: Agents must operate in a self-correcting cycle of execution and peer review.

Before human review, agents describe their work, run tests, open PRs, review their own changes, and request peer reviews from specialized agents. This reduces human review burden and catches issues early.

**Key aspects**:

- Agent-led PRs with self-review
- Peer review from specialized agents
- Observability integration for telemetry access

[Read more about the Agent Feedback Loop →](./principles.md#3-the-agent-feedback-loop)

---

### 4. Entropy Management (Garbage Collection)

**Continuous Cleanup**: AI-generated codebases can accumulate technical debt rapidly without systematic management.

Schedule periodic cleanup agents to detect and fix documentation drift, enforce patterns, remove dead code, and align implementation with design.

**Key aspects**:

- Periodic cleanup agents running on schedule
- Documentation alignment checks
- Pattern enforcement and dead code removal

[Read more about Entropy Management →](./principles.md#4-entropy-management-garbage-collection)

---

### 5. Implementation Strategy (Depth-First)

**Complete Over Breadth**: Avoid starting many features shallowly; instead, take features to 100% completion before starting the next.

Design → Implementation → Testing → Deployment in a single vertical slice. Use learnings from each complete feature to inform the next iteration.

**Key aspects**:

- One story at a time to completion
- Build abstractions from concrete implementations
- Validate before scaling to the next feature

[Read more about Implementation Strategy →](./principles.md#5-implementation-strategy-depth-first)

---

### 6. Key Performance Indicators

**Measurable Success**: Harness Engineering is characterized by three core metrics.

- **Agent Autonomy**: % of PRs merged without human code intervention
- **Harness Coverage**: % of architectural rules enforced mechanically
- **Context Density**: Ratio of documentation to code

[Read more about KPIs →](./kpis.md)

---

### 7. Deterministic-vs-LLM Responsibility Split

**Clear Boundaries**: If an operation can be expressed as if-else logic, it must be enforced mechanically — not delegated to LLM judgment.

LLMs handle intent understanding, architectural reasoning, code generation, and ambiguous trade-offs. Mechanical tooling handles formatting, import ordering, naming conventions, file structure validation, test execution, and type checking.

**Key aspects**:

- Decision heuristic: can you write it as if-else? → mechanical
- Deterministic-first execution sequence in all skills
- Extends Principle 2 from "what to enforce" to "how to decide what to enforce"

[Read more about the Deterministic-vs-LLM Split →](./principles.md#7-deterministic-vs-llm-responsibility-split)

---

## How to Get Started

### Understanding the Standard

1. **Start here**: Read the [Seven Principles](./principles.md) for detailed explanations
2. **Learn implementation**: Read the [Implementation Guide](./implementation.md) for practical setup
3. **Measure success**: Review [KPIs & Metrics](./kpis.md) to understand success criteria

### Adopting Harness Engineering

Harness Engineering adoption happens in phases:

- **Level 1 (Basic)**: AGENTS.md knowledge map + basic documentation structure
- **Level 2 (Intermediate)**: Add architectural constraints and linters
- **Level 3 (Advanced)**: Full agent feedback loop and entropy management

Start with Level 1 and progress based on team readiness and tooling availability.

---

## Key Concepts

### AGENTS.md

A top-level knowledge map (~100 lines) that tells AI agents where to find domain knowledge in your repository. Lists core principles, implementation guides, agent resources, and project management documents.

### Repository-as-Documentation

All architectural decisions, designs, and execution plans live in version-controlled markdown files in `/docs/`. This becomes the single source of truth that agents can access and understand.

### Mechanical Constraints

Rather than relying on code review to catch architectural violations, constraints are enforced automatically through:

- Custom ESLint/linter rules
- Structural tests in CI/CD
- Runtime boundary validation
- Automated architectural checks

### Agent Skills

Reusable capabilities that AI agents can use:

- `validate-context-engineering` - Check AGENTS.md and documentation
- `enforce-architecture` - Validate dependencies and constraints
- `detect-doc-drift` - Find outdated documentation
- `cleanup-dead-code` - Remove unused code

### The Harness Engineering Library

The open-source toolkit that implements these principles:

- **Core Runtime Library** - APIs for validation, constraint enforcement, and metrics
- **CLI Tool** - Commands for scaffolding, validation, and agent orchestration
- **Linter Generator** - Code-generate custom linters from YAML rules
- **Agent Skills** - Pre-built agent skills for common tasks
- **Templates & Examples** - Reference implementations and project templates

---

## Next Steps

1. **Understand the principles** - Read [Context Engineering](./principles.md#1-context-engineering) and others
2. **Plan implementation** - Review the [Implementation Guide](./implementation.md)
3. **Set up your project** - Follow the setup checklist
4. **Define metrics** - Establish KPI baselines before starting
5. **Deploy agents** - Use agent skills to validate and maintain your codebase

---

## Resources

- **[Principles](./principles.md)** - Deep dive into all 7 principles
- **[Implementation Guide](./implementation.md)** - Step-by-step adoption guide
- **[KPIs & Metrics](./kpis.md)** - How to measure success
- **[Harness Engineering Library](../../README.md)** - Main project documentation
- **[AGENTS.md](../../AGENTS.md)** - Knowledge map for this project

---

_Last Updated: 2026-03-16_
