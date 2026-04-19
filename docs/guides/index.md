# Guides

Welcome to the Harness Engineering Guides section. These guides provide practical, step-by-step instructions for getting started with Harness Engineering and implementing best practices in your projects.

## Available Guides

### [Features Overview](./features-overview.md)

What can harness do? A complete map of every capability — commands, skills, personas, and tools — organized by what you're trying to accomplish. Start here if you want the full picture.

**Best for:** Understanding the full scope of what harness provides

### [Getting Started](./getting-started.md)

New to Harness Engineering? Start here. This guide walks you through:

- Prerequisites and system requirements
- Installation and setup
- Quick start example
- Next steps for deeper learning

**Time to completion:** 15-30 minutes

### [Best Practices](./best-practices.md)

Learn proven patterns and strategies for successful Harness Engineering adoption:

- Common patterns and anti-patterns to avoid
- Code organization and project structure
- Testing strategies and approaches
- Documentation guidelines
- Agent workflow optimization tips

**Best for:** Teams ready to scale beyond basic setup

### [Agent Worktree Patterns](./agent-worktree-patterns.md)

Git workflow guidance for agent-driven development:

- Why branch-per-task is an anti-pattern for agent work
- The worktree-per-milestone pattern
- Practical how-to for creating and managing worktrees
- When to squash-merge vs. regular merge

**Best for:** Teams using agents to implement multi-task milestones

### [Orchestrator Guide](./orchestrator.md)

Learn how to use the Harness Orchestrator to automate your agent workforce:

- Core concepts (Daemon, State Machine, Workflows)
- Setting up `harness.orchestrator.md`
- Monitoring via TUI and HTTP API
- Graceful shutdown and lifecycle management

**Best for:** Operators managing multiple concurrent agents

### [Docker Deployment](./docker.md)

Run and deploy harness via Docker containers:

- Quick start with Docker Compose
- Individual CLI and MCP server usage
- Orchestrator and dashboard deployment
- Agent execution modes and environment variables
- Building images from source

**Best for:** Teams deploying harness as containerized services or running without local Node.js

### [Templates and Framework Overlays](./templates-and-overlays.md)

How project scaffolding works -- the template system behind `harness init`:

- Template catalog: 19 templates across 5 languages
- Adoption levels (basic, intermediate, advanced) for TypeScript
- Language bases for Go, Python, Java, and Rust
- Framework overlays (Express, Next.js, FastAPI, Django, Gin, Axum, Spring Boot, and more)
- Template composition, merging, and customization

**Best for:** Understanding what `harness init` generates and how to choose the right template

### [Constraint Sharing](./constraint-sharing.md)

Share architectural and security constraints across projects as portable bundles:

- Creating constraint manifests and exporting bundles
- Manual installation and private registry workflows
- Merge semantics, conflict resolution, and upgrade flows
- Lockfile provenance and uninstall

**Best for:** Teams enforcing consistent architecture across multiple repositories

### [Orchestrator HTTP API and Internals](./orchestrator-api.md)

Deep reference for the Orchestrator's HTTP API, WebSocket interface, and internal subsystems:

- Complete HTTP API reference (state, interactions, chat proxy, analyze, dispatch, maintenance, sessions)
- WebSocket real-time event streaming
- Claim manager (optimistic locking, heartbeat, staleness, startup reconciliation)
- Rate limiter configuration and throttle hierarchy
- Maintenance scheduler (18 built-in tasks, cron scheduling, leader election)
- Task runner execution paths and PR lifecycle management

**Best for:** Developers integrating with the orchestrator API or operating multi-instance deployments

### [Intelligence Pipeline](./intelligence-pipeline.md)

How the LLM-powered intelligence pipeline enriches, scores, and simulates work items before dispatch:

- SEL (Spec Enrichment Layer) — LLM analysis with graph-validated system discovery
- CML (Complexity Modeling Layer) — structural, semantic, and historical complexity scoring
- PESL (Pre-Execution Simulation Layer) — graph-only and full LLM simulation modes
- Effectiveness tracking and agent specialization with temporal decay
- Tuning parameters, provider configuration, and cost considerations

**Best for:** Teams using the orchestrator's intelligence pipeline for automated routing decisions

### [Roadmap Guide](./roadmap-sync.md)

Complete guide to the harness roadmap system — structure, management, sync, and auto-pick:

- Roadmap file structure, feature fields, statuses, and milestones
- Managing features via slash commands and MCP tools
- Configuring GitHub Issues as a bidirectional sync adapter
- Assignment history, affinity scoring, and the auto-pick pilot

**Best for:** Teams using `docs/roadmap.md` for project tracking and planning

### [Graph Query Guide](./graph-queries.md)

Query the knowledge graph to understand code structure, trace dependencies, and analyze impact:

- ContextQL BFS-based traversal engine -- parameters, filtering, and bidirectional queries
- Complete reference for all 28 node types and 26 edge types
- Common query patterns: dependencies, reverse dependencies, co-changed files, impact analysis
- FusionLayer hybrid search (keyword + semantic)
- MCP tools: `ask_graph`, `query_graph`, `search_similar`, `find_context_for`, `get_relationships`, `get_impact`, `compute_blast_radius`, `detect_anomalies`
- Natural language query pipeline: intent classification, entity extraction, and resolution

**Best for:** Developers and agents querying the knowledge graph for context assembly and impact analysis

### [MCP Tool Workflows](./mcp-workflows.md)

Practical workflows showing how to combine MCP tools for common tasks:

- Starting a new feature (recommend, gather context, assess)
- Code review pipeline (quick check, self-review, full 7-phase review)
- Architecture analysis (graph query, blast radius, failure prediction, decay trends)
- Security checks (vulnerability scan, dependency validation)
- Performance analysis (complexity, baselines, critical paths)

**Best for:** AI agents and developers using harness MCP tools in combination

## How to Use These Guides

1. **Start with Getting Started** if you're new to Harness Engineering
2. **Review Best Practices** once you have a working setup
3. **Reference the Standard Documentation** for detailed principle explanations
4. **Check the Reference Docs** for CLI commands and configuration options

## Quick Links

- [Standard Documentation](/standard/) - Core principles and deep dives
- [Reference Documentation](/reference/) - CLI and configuration reference
- [Implementation Guide](/standard/implementation.md) - Detailed adoption roadmap

---

_Last Updated: 2026-04-18_
