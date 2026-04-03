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
- Setting up `WORKFLOW.md`
- Monitoring via TUI and HTTP API
- Graceful shutdown and lifecycle management

**Best for:** Operators managing multiple concurrent agents

### [Constraint Sharing](./constraint-sharing.md)

Share architectural and security constraints across projects as portable bundles:

- Creating constraint manifests and exporting bundles
- Manual installation and private registry workflows
- Merge semantics, conflict resolution, and upgrade flows
- Lockfile provenance and uninstall

**Best for:** Teams enforcing consistent architecture across multiple repositories

### [Roadmap Sync & Auto-Pick](./roadmap-sync.md)

Bidirectional sync between your project roadmap and GitHub Issues, plus AI-assisted next-item selection:

- Configuring GitHub Issues as the sync adapter
- Status mapping with label-based disambiguation
- Assignment history and affinity-based routing
- Auto-pick pilot for selecting the next work item

**Best for:** Teams using roadmap.md who want GitHub Issues integration and automated task selection

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

_Last Updated: 2026-03-16_
