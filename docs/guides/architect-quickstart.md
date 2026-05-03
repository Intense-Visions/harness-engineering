# Harness Engineering for Tech Leads and Architects: Quickstart Guide

**Enforce architectural decisions mechanically, not through code review comments that get ignored.**

This guide is written for tech leads, software architects, and principal engineers who want to use Harness Engineering to enforce architectural constraints, manage technical health, guide team practices, and make durable architecture decisions. It covers what harness does for architecture work, how to use it day-to-day, which tools map to which activities, and how to build a repeatable, high-confidence governance process.

---

## Table of Contents

1. [What Is Harness Engineering?](#what-is-harness-engineering)
2. [Why Architects Should Care](#why-architects-should-care)
3. [Getting Started (5 Minutes)](#getting-started-5-minutes)
4. [The Architect Toolkit at a Glance](#the-architect-toolkit-at-a-glance)
   - [Enforcement](#enforcement)
   - [Advisory](#advisory)
   - [Analysis](#analysis)
   - [Management](#management)
5. [Day-to-Day Workflows](#day-to-day-workflows)
   - [Defining Architecture Constraints for a New Project](#1-defining-architecture-constraints-for-a-new-project)
   - [Reviewing Architectural Health](#2-reviewing-architectural-health)
   - [Making an Architecture Decision](#3-making-an-architecture-decision-advisor--adr)
   - [Analyzing Impact Before a Large Refactor](#4-analyzing-impact-before-a-large-refactor)
   - [Finding and Addressing Structural Hotspots](#5-finding-and-addressing-structural-hotspots)
   - [Onboarding a New Team Member](#6-onboarding-a-new-team-member)
   - [Managing the Project Roadmap](#7-managing-the-project-roadmap)
   - [Keeping Documentation in Sync](#8-keeping-documentation-in-sync)
6. [The Knowledge Graph: Your Architecture Superpower](#the-knowledge-graph-your-architecture-superpower)
7. [Improving Over Time](#improving-over-time)
8. [Quick Reference Card](#quick-reference-card)
9. [FAQ](#faq)

---

## What Is Harness Engineering?

Harness Engineering is a toolkit that makes AI coding agents reliable through **mechanical enforcement**. Instead of relying on prompts, conventions, and hope, harness encodes your project's architectural decisions, quality standards, and structural constraints as machine-checkable rules. Every rule is validated on every change.

For architects, this means:

- **Architectural constraints that enforce themselves** -- layer boundaries, dependency rules, and forbidden imports checked on every commit
- **Structured decision-making** with an interactive advisor that produces comparison matrices and persists decisions as ADRs
- **Graph-based impact analysis** that answers "if I change X, what breaks?" with concrete numbers
- **Structural health metrics** that quantify dependency risk, coupling, churn, and complexity
- **Continuous governance** that keeps architecture, documentation, and code in sync without manual policing

Harness operates through **slash commands** (e.g., `/harness:enforce-architecture`) in your AI coding tool (Claude Code, Gemini CLI, Cursor), **CLI skills** invoked via `harness skill run <name>`, and **CLI commands** for scripts and CI pipelines.

---

## Why Architects Should Care

| Traditional Architecture Pain Point                                       | How Harness Solves It                                                                                                      |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| "Our layer boundaries exist in a wiki nobody reads"                       | `/harness:enforce-architecture` validates layer dependencies mechanically on every change -- violations block merges       |
| "I spend half my review time pointing out the same dependency violations" | `harness.config.json` encodes `allowedDependencies` and `forbiddenImports` -- the machine catches violations before review |
| "Architecture decisions get lost in Slack threads"                        | `/harness:architecture-advisor` produces structured ADRs saved to `docs/architecture/<topic>/ADR-<number>.md`              |
| "We don't know the blast radius of this refactor"                         | `/harness:impact-analysis` maps direct dependents, transitive dependents (3 levels), affected tests, and risk tier         |
| "Some modules are ticking time bombs but nobody knows which"              | `/harness:hotspot-detector` identifies high-churn files, hidden coupling, and structural outliers via co-change analysis   |
| "Dependencies form a tangled graph we can't reason about"                 | `/harness:dependency-health` scores your codebase 0-100 with hub detection, cycle detection, orphans, and deep chains      |
| "New hires violate architecture because they don't understand it"         | `/harness:onboarding` reads your constraints, maps the codebase, and produces a tailored orientation                       |
| "We have no idea if our perf-critical paths have regressed"               | `/harness:perf` enforces complexity thresholds with `@perf-critical` annotations and baselines                             |
| "Our roadmap lives in a spreadsheet disconnected from the code"           | `/harness:roadmap` bootstraps from specs and plans, syncs with execution progress                                          |

---

## Getting Started (5 Minutes)

### Prerequisites

- Node.js 22+
- An AI coding agent: Claude Code, Gemini CLI, or Cursor
- Git

### Install

```bash
npm install -g @harness-engineering/cli
harness setup
```

This installs the CLI and configures slash commands, MCP server, and agent personas for your detected AI clients. After this, `/harness:*` commands are available in every conversation.

### Verify Your Project

If your project already uses harness:

```
/harness:verify
```

This runs all mechanical checks in one pass -- configuration, dependencies, lint, typecheck, tests -- and gives you a binary pass/fail.

If your project doesn't use harness yet, initialize it:

```
/harness:initialize-project
```

This walks you through setup interactively and scaffolds everything, including the `harness.config.json` where you define your architecture constraints.

### Build the Knowledge Graph

The knowledge graph powers impact analysis, dependency health, hotspot detection, and blast radius estimation:

```bash
harness scan
```

This builds a structural graph from your code, git history, and documentation. It enables the most powerful architecture features like impact analysis and decay trend tracking.

---

## The Architect Toolkit at a Glance

### Enforcement

Tools that make architectural constraints self-enforcing.

| Command / Skill                 | What It Does                                                                | When to Use                                         |
| ------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------- |
| `/harness:enforce-architecture` | 4-phase: load constraints, check deps, analyze violations, guide resolution | Every PR, CI gates, after dependency changes        |
| `/harness:perf`                 | Structural performance checks with tier system and baselines                | Performance-critical changes, complexity regression |
| `harness ci check`              | Runs all 9 checks including arch, deps, perf, security                      | CI pipeline, pre-merge gate                         |

### Advisory

Tools that help you make and document architecture decisions.

| Command / Skill                 | What It Does                                                      | When to Use                                                  |
| ------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| `/harness:architecture-advisor` | 4-phase interactive advisor with comparison matrix and ADR output | New feature design, tech debt resolution, migration planning |
| `/harness:soundness-review`     | Deep analysis of specs and plans                                  | Before approving a spec or plan                              |
| `/harness:code-review`          | 7-phase review pipeline with architecture domain                  | Before merging PRs with structural changes                   |

### Analysis

Tools that quantify structural risk and guide refactoring decisions.

| Command / Skill              | What It Does                                                      | When to Use                                             |
| ---------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| `/harness:impact-analysis`   | "If I change X, what breaks?" with risk tiers                     | Before large refactors, API changes, module extraction  |
| `/harness:dependency-health` | Health score (0-100, A-F grade) with hub, cycle, orphan detection | Weekly health checks, sprint planning, tech debt triage |
| `/harness:hotspot-detector`  | Co-change analysis, churn analysis, coupling detection            | Identifying where to focus refactoring effort           |
| `/harness:detect-doc-drift`  | Mechanical comparison of docs vs code                             | Pre-release, regular maintenance                        |

### Management

Tools that keep the project organized and team aligned.

| Command / Skill          | What It Does                                                  | When to Use                                      |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------ |
| `/harness:roadmap`       | Create, sync, and edit project roadmaps from specs and plans  | Sprint planning, project kickoff, status updates |
| `/harness:onboarding`    | 4-phase codebase orientation tailored by audience             | New team members, cross-team knowledge sharing   |
| `/harness:docs-pipeline` | Detect drift, auto-fix, validate knowledge map, generate docs | Documentation maintenance cycles                 |

---

## Day-to-Day Workflows

### 1. Defining Architecture Constraints for a New Project

**The old way:** Write a design doc. Hope developers read it. Spend months pointing out violations in code review.

**The harness way:**

Define your layer architecture in `harness.config.json`:

```json
{
  "architecture": {
    "layers": [
      {
        "name": "presentation",
        "paths": ["src/ui/**", "src/pages/**", "src/components/**"],
        "allowedDependencies": ["application", "domain"],
        "forbiddenImports": ["src/infrastructure/**", "src/database/**"]
      },
      {
        "name": "application",
        "paths": ["src/services/**", "src/use-cases/**"],
        "allowedDependencies": ["domain"],
        "forbiddenImports": ["src/ui/**", "src/pages/**"]
      },
      {
        "name": "domain",
        "paths": ["src/models/**", "src/entities/**"],
        "allowedDependencies": [],
        "forbiddenImports": ["src/services/**", "src/infrastructure/**", "src/ui/**"]
      },
      {
        "name": "infrastructure",
        "paths": ["src/infrastructure/**", "src/database/**"],
        "allowedDependencies": ["domain"],
        "forbiddenImports": ["src/ui/**", "src/pages/**"]
      }
    ]
  }
}
```

Then enforce it:

```
/harness:enforce-architecture
```

This runs a **4-phase pipeline**:

1. **LOAD** -- Reads constraint definitions from `harness.config.json`
2. **CHECK** -- Scans all imports and module dependencies against the layer rules
3. **ANALYZE** -- Classifies every violation by type:

| Violation Type        | What It Means                             | Example                                                          |
| --------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| **Upward dependency** | Lower layer importing from a higher layer | `domain/User.ts` imports from `services/AuthService.ts`          |
| **Skip-layer**        | Jumping over an intermediate layer        | `presentation/Dashboard.tsx` imports from `infrastructure/db.ts` |
| **Circular**          | Two modules depend on each other          | `services/auth.ts` <-> `services/user.ts`                        |
| **Forbidden import**  | Explicitly banned import path             | `ui/Login.tsx` imports `database/connection.ts`                  |
| **Design constraint** | Violates a documented design rule         | Mutable state in a domain entity                                 |

4. **RESOLVE** -- Applies auto-fixes where safe, guides manual resolution otherwise:

| Auto-Fix Type                | Safety                   | What It Does                                                          |
| ---------------------------- | ------------------------ | --------------------------------------------------------------------- |
| Import ordering              | Safe (always applied)    | Reorders imports to match layer convention                            |
| Forbidden import replacement | Safe (with alternatives) | Replaces forbidden import with an allowed alternative when one exists |
| Design token substitution    | Safe (with alternatives) | Swaps a banned pattern for the sanctioned equivalent                  |

For violations that cannot be auto-fixed, harness provides specific guidance: which file, which line, what the violation is, and what the correct dependency direction should be.

---

### 2. Reviewing Architectural Health

**The old way:** Schedule a quarterly architecture review. Spend two days manually tracing dependencies. Produce a report that's outdated by the time it's shared.

**The harness way:**

```
/harness:dependency-health
```

This produces a **health score from 0-100** with a letter grade (A-F) based on five structural metrics:

| Metric               | What It Detects                                                        | Threshold                 |
| -------------------- | ---------------------------------------------------------------------- | ------------------------- |
| **Hub detection**    | Modules imported by more than 10 other files -- fragile central points | >10 importers flags a hub |
| **Orphan detection** | Files with no imports and no importers -- dead weight                  | 0 connections             |
| **Cycle detection**  | Circular dependency chains -- compilation and reasoning hazards        | Any cycle                 |
| **Deep chains**      | Import chains longer than 7 hops -- fragile transitive dependencies    | >7 hops                   |
| **Module cohesion**  | How tightly related a module's internal files are to each other        | Low cohesion score        |

Combine this with performance checks:

```
/harness:perf
```

The perf skill enforces structural thresholds with a **tier system**:

- **Cyclomatic complexity** -- How many independent paths through the code
- **Nesting depth** -- How deeply nested the control flow is
- **Fan-in / fan-out coupling** -- How many modules depend on or are depended upon by a given module

For performance-critical code paths, use `@perf-critical` annotations in your source. The perf system builds a critical path graph based on these annotations and fan-in analysis, with baselines stored in `.harness/perf/baselines.json`.

```bash
# CI commands
harness check-perf              # Full check (complexity + coupling + size budgets)
harness check-perf --structural # Complexity thresholds only
harness check-perf --coupling   # Coupling metrics only
```

---

### 3. Making an Architecture Decision (Advisor + ADR)

**The old way:** Debate in meetings. Someone writes a Google Doc. The decision gets buried. Six months later, nobody remembers why we chose option B.

**The harness way:**

```
/harness:architecture-advisor
```

This runs a **4-phase interactive process**:

1. **DISCOVER** -- Asks you targeted questions about the problem, constraints, team preferences, and non-functional requirements. Not a generic questionnaire -- it adapts based on what it learns about your codebase from the knowledge graph.

2. **ANALYZE** -- Maps relevant architectural patterns to your context: integration points with existing code, tech debt implications, affected modules, and migration complexity.

3. **PROPOSE** -- Always presents **2-3 concrete options** with a structured comparison matrix:

| Dimension       | Option A: Event Sourcing  | Option B: CQRS Only   | Option C: Simple Service Layer |
| --------------- | ------------------------- | --------------------- | ------------------------------ |
| Complexity      | High                      | Medium                | Low                            |
| Performance     | High (read-optimized)     | High (read-optimized) | Medium                         |
| Maintainability | Medium (event versioning) | High                  | High                           |
| Effort          | 6-8 weeks                 | 3-4 weeks             | 1-2 weeks                      |
| Risk            | High (team unfamiliarity) | Medium                | Low                            |

4. **DOCUMENT** -- Saves the decision as an Architecture Decision Record at `docs/architecture/<topic>/ADR-<number>.md`. The ADR includes context, options considered, decision rationale, and consequences -- all structured, all version-controlled.

ADRs accumulate over time. When a new decision contradicts or supersedes an old one, the advisor flags it. When a developer asks "why is it done this way?", the ADR provides the answer.

---

### 4. Analyzing Impact Before a Large Refactor

**The old way:** "I think this is safe to change." Merge. Production breaks. "I didn't realize that module depended on it."

**The harness way:**

```
/harness:impact-analysis
```

This answers **"if I change X, what breaks?"** with concrete data:

- **Direct dependents** -- Files that import the changed module
- **Transitive dependents** -- Files up to 3 levels deep that could be affected
- **Affected tests** -- Test files that cover the changed code and its dependents
- **Design token impact** -- If the change affects shared design tokens or constants

Results are classified into **risk tiers**:

| Risk Tier    | Dependent Count  | Recommended Action                           |
| ------------ | ---------------- | -------------------------------------------- |
| **Critical** | >50 dependents   | Requires architecture review, phased rollout |
| **High**     | 20-50 dependents | Requires thorough testing, team notification |
| **Medium**   | 5-20 dependents  | Standard review process, targeted testing    |
| **Low**      | <5 dependents    | Normal workflow                              |

**Example workflow for a large refactor:**

```
1. Run /harness:impact-analysis on the module you want to change
2. Review the risk tier and dependent list
3. If Critical or High, run /harness:architecture-advisor to explore options
4. Use /harness:test-advisor on affected files to identify test coverage
5. Plan the refactor in phases based on the dependency tree
```

For probabilistic analysis that accounts for cascading failures:

```
Use the compute_blast_radius MCP tool for probabilistic cascading failure simulation
```

---

### 5. Finding and Addressing Structural Hotspots

**The old way:** "This module feels like it breaks a lot." No data. No prioritization. Fix whatever is loudest.

**The harness way:**

```
/harness:hotspot-detector
```

This runs a **3-phase analysis**:

1. **CO-CHANGE ANALYSIS** -- Identifies files that frequently change together. When two files in distant parts of the codebase consistently change in the same commits, that signals hidden coupling that the dependency graph doesn't show.

2. **CHURN ANALYSIS** -- Identifies files with high modification frequency. A file changed 40 times in the last quarter is a structural risk regardless of its test coverage.

3. **COUPLING DETECTION** -- Combines co-change data with structural dependency data to surface:

| Hotspot Type                | What It Means                                                                                  | Action                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **High-churn files**        | Changed frequently -- unstable, likely under-designed                                          | Consider extracting stable abstractions              |
| **Distant co-change pairs** | Files with no import relationship that always change together -- hidden coupling               | Extract shared logic or make the dependency explicit |
| **Structural outliers**     | Files whose metrics (complexity, coupling, size) deviate significantly from their module peers | Investigate and refactor                             |

**Using hotspots to prioritize tech debt:**

```
1. Run /harness:hotspot-detector to get the ranked list
2. Cross-reference with /harness:dependency-health for modules with low cohesion
3. Run /harness:impact-analysis on the top hotspots to understand blast radius
4. Feed the results into /harness:architecture-advisor to design the fix
5. Track the fix in /harness:roadmap
```

---

### 6. Onboarding a New Team Member

**The old way:** "Read the README. Ask if you have questions." Three weeks later they're still confused about module boundaries.

**The harness way:**

```
/harness:onboarding
```

This runs a **4-phase orientation**:

1. **READ CONFIG** -- Loads `AGENTS.md`, `harness.config.json`, `.harness/learnings.md`, and `.harness/state.json` to understand the project's rules and current state.

2. **MAP CODEBASE** -- Traverses the source tree to build a structural map: modules, entry points, key abstractions, test locations, and dependency patterns.

3. **ORIENT** -- Tailors the output to the audience. A new junior developer gets a different orientation than a senior architect joining the team. The adoption level (how mature the harness setup is) also affects what is emphasized.

4. **SUMMARIZE** -- Produces a structured overview: project purpose, architecture overview, key constraints, development workflow, and where to find things.

The onboarding output includes the architecture constraints from `harness.config.json`, so new team members understand the layer boundaries and forbidden imports before they write their first line of code.

---

### 7. Managing the Project Roadmap

**The old way:** Spreadsheet or Jira board disconnected from the codebase. Specs and plans live in Google Docs. Status is whatever someone last updated manually.

**The harness way:**

```
/harness:roadmap
```

The roadmap skill **bootstraps from your existing artifacts**:

- **Specs** at `docs/changes/*/proposal.md` -- feature proposals with requirements
- **Plans** at `docs/plans/*.md` -- implementation plans with task breakdowns

**Key operations:**

```
/harness:roadmap                # Create a new roadmap from specs and plans
/harness:roadmap --sync         # Update roadmap from plan execution progress
/harness:roadmap --edit         # Reorder items, adjust priorities, update status
```

The `--sync` flag reads execution state from `.harness/state.json` and updates the roadmap to reflect what has actually been completed. This eliminates the manual status-update ceremony.

---

### 8. Keeping Documentation in Sync

**The old way:** Documentation is written once and never updated. The architecture diagram shows a system that existed six months ago.

**The harness way:**

```
/harness:docs-pipeline
```

This is an orchestrator that composes four documentation skills into a sequential pipeline:

1. **Detect drift** -- `/harness:detect-doc-drift` performs a mechanical comparison of documentation against code. Not AI-based opinion -- it compares function signatures, API endpoints, configuration keys, and module boundaries against what the docs claim.

2. **Auto-fix** -- Where possible, updates documentation to match code automatically.

3. **Validate knowledge map** -- Checks that documentation coverage meets thresholds and that all key modules have corresponding documentation.

4. **Generate docs** -- Produces documentation for undocumented modules.

For deeper analysis of specs and plans:

```
/harness:soundness-review
```

This performs a deep analysis that goes beyond drift detection -- it checks whether specs are internally consistent, whether plans are achievable given the codebase structure, and whether assumptions still hold.

---

## The Knowledge Graph: Your Architecture Superpower

The knowledge graph is a structural model of your codebase -- 30 node types, 25 edge types -- that powers most of the analysis tools architects rely on.

### Build It

```bash
harness scan
```

### What It Enables for Architects

| Capability                   | How to Use It                     | Architecture Value                                                                    |
| ---------------------------- | --------------------------------- | ------------------------------------------------------------------------------------- |
| **Impact analysis**          | `/harness:impact-analysis`        | "If I change this module, what breaks?" with concrete dependent counts and risk tiers |
| **Blast radius**             | `compute_blast_radius` (MCP tool) | Probabilistic cascading failure simulation across the dependency graph                |
| **Dependency health**        | `/harness:dependency-health`      | Quantified structural health -- hubs, cycles, orphans, deep chains, cohesion          |
| **Decay trends**             | `get_decay_trends` (MCP tool)     | Architecture stability over time -- are constraints holding or eroding?               |
| **Failure prediction**       | `predict_failures` (MCP tool)     | Forecast constraint breakage based on trend data (needs 3+ snapshots)                 |
| **Hotspot detection**        | `/harness:hotspot-detector`       | High-churn, high-coupling files that represent structural risk                        |
| **Natural language queries** | `ask_graph` (MCP tool)            | "What depends on the auth module?" "Show me all circular dependencies"                |
| **ContextQL traversal**      | `query_graph` (MCP tool)          | Structured graph queries for custom analysis                                          |

### MCP Tools for Advanced Analysis

These tools are available through the MCP server and can be invoked directly in your AI coding agent:

| Tool                     | What It Does                               | Example Use                                        |
| ------------------------ | ------------------------------------------ | -------------------------------------------------- |
| `ask_graph()`            | Natural language queries against the graph | "What are the most imported modules?"              |
| `get_impact()`           | Blast radius for a specific node           | "What breaks if I change UserService?"             |
| `get_decay_trends()`     | Architecture stability metrics over time   | "Is our layered architecture holding?"             |
| `predict_failures()`     | Forecast which constraints will break next | "What's likely to violate boundaries next sprint?" |
| `compute_blast_radius()` | Probabilistic cascading failure simulation | "If the auth module fails, what's the cascade?"    |
| `query_graph()`          | ContextQL traversal for custom queries     | Complex multi-hop dependency analysis              |

### Example: Pre-Refactor Risk Assessment

```
1. Run /harness:impact-analysis on the target module to get the dependency tree
2. Use compute_blast_radius for probabilistic cascade analysis
3. Run /harness:dependency-health to check if the target area has cycles or hubs
4. Use get_decay_trends to see if this area has been stable or degrading
5. Feed all findings into /harness:architecture-advisor to plan the approach
```

---

## Improving Over Time

### Week 1: Foundation

- Install harness CLI and run `harness setup`
- Run `/harness:verify` on your project to see where you stand
- Run `harness scan` to build the knowledge graph
- Define your layer architecture in `harness.config.json`
- Run `/harness:enforce-architecture` to establish a violation baseline

### Week 2: Visibility

- Run `/harness:dependency-health` to get your structural health score
- Run `/harness:hotspot-detector` to identify the riskiest areas
- Use `/harness:perf` to establish complexity and coupling baselines in `.harness/perf/baselines.json`
- Add `harness ci check` to your CI pipeline to enforce constraints on every PR

### Week 3: Decision-Making

- Use `/harness:architecture-advisor` for your next design decision
- Review the generated ADR and refine the format to fit your team's style
- Run `/harness:impact-analysis` before your next refactor
- Run `/harness:soundness-review` on your active specs and plans

### Week 4: Team Integration

- Run `/harness:onboarding` and evaluate the output -- tune your config if the orientation misses key context
- Set up `/harness:roadmap` from your existing specs and plans
- Run `/harness:docs-pipeline` to establish documentation health
- Share the dependency health score with the team and set a target grade

### Ongoing: Continuous Governance

- Run `/harness:enforce-architecture` in CI on every PR -- violations should block merges
- Track `get_decay_trends` monthly to see if architecture constraints are holding or eroding
- Use `/harness:hotspot-detector` quarterly to re-prioritize tech debt
- Run `/harness:dependency-health` at sprint boundaries to track improvement
- Use `/harness:architecture-advisor` for every significant design decision -- build the ADR library
- Sync the roadmap with `--sync` after each planning cycle
- Run `/harness:detect-doc-drift` before each release

---

## Quick Reference Card

### "I need to..." -- Use this

| I Need To...                        | Command / Skill                 | Type          |
| ----------------------------------- | ------------------------------- | ------------- |
| Enforce layer boundaries            | `/harness:enforce-architecture` | Slash command |
| Make an architecture decision       | `/harness:architecture-advisor` | Slash command |
| Check dependency health             | `/harness:dependency-health`    | Slash command |
| Analyze impact of a change          | `/harness:impact-analysis`      | Slash command |
| Find structural hotspots            | `/harness:hotspot-detector`     | Slash command |
| Enforce performance budgets         | `/harness:perf`                 | Slash command |
| Review a spec or plan               | `/harness:soundness-review`     | Slash command |
| Onboard a team member               | `/harness:onboarding`           | Slash command |
| Manage the project roadmap          | `/harness:roadmap`              | Slash command |
| Detect documentation drift          | `/harness:detect-doc-drift`     | Slash command |
| Run the full docs pipeline          | `/harness:docs-pipeline`        | Slash command |
| Review a PR for arch violations     | `/harness:code-review`          | Slash command |
| Run all checks in CI                | `harness ci check`              | CLI           |
| Build the knowledge graph           | `harness scan`                  | CLI           |
| Query the graph in natural language | `ask_graph` MCP tool            | MCP tool      |
| Get blast radius analysis           | `compute_blast_radius` MCP tool | MCP tool      |
| Track architecture stability        | `get_decay_trends` MCP tool     | MCP tool      |
| Predict constraint breakage         | `predict_failures` MCP tool     | MCP tool      |

### Exit Codes for CI

| Code | Meaning                   | Action      |
| ---- | ------------------------- | ----------- |
| `0`  | All checks passed         | Proceed     |
| `1`  | One or more checks failed | Block merge |
| `2`  | Harness internal error    | Investigate |

---

## FAQ

### Do I need to define all constraints upfront?

No. Start with the constraints you care about most -- typically layer boundaries and forbidden imports. You can add more rules incrementally. Harness will only enforce what you configure, and adding new constraints is a one-line change to `harness.config.json`.

### How does architecture enforcement differ from a linter?

Linters check syntax and style within a file. Architecture enforcement checks **relationships between files and modules** -- import directions, layer boundaries, dependency depth, and coupling. A linter will tell you a function is too long. Harness will tell you that your presentation layer is importing from your infrastructure layer.

### Can I use this without the knowledge graph?

Yes. Architecture enforcement (`/harness:enforce-architecture`), performance checks (`/harness:perf`), and the architecture advisor (`/harness:architecture-advisor`) all work without a graph. However, impact analysis, dependency health, hotspot detection, blast radius, and decay trends all require the graph. Run `harness scan` to get the full feature set.

### How does the architecture advisor compare to just writing an ADR manually?

The advisor adds three things: (1) it asks structured questions to ensure you consider constraints you might miss, (2) it generates a comparison matrix so the trade-offs are explicit, and (3) it persists the ADR in a consistent format at a predictable path. You can still edit the generated ADR -- it is a starting point, not a final document.

### What happens when someone violates an architecture constraint?

If enforcement is running in CI via `harness ci check`, the build fails with a specific error: which file, which import, which constraint it violates, and what the allowed dependency direction is. For auto-fixable violations (import ordering, forbidden import replacement with a known alternative, design token substitution), harness applies the fix automatically. For others, it provides explicit guidance on how to resolve the violation.

### How do I handle intentional exceptions to architecture rules?

Configure exceptions in `harness.config.json` for specific files or paths that need to cross layer boundaries (e.g., a bootstrap file that wires everything together). This makes exceptions explicit and version-controlled rather than invisible.

### Can I use harness with any programming language?

The core architecture enforcement, impact analysis, and dependency health work with any language that uses file-based imports. The knowledge graph supports TypeScript/JavaScript, Python, Java/Kotlin, Go, Rust, and C#. Performance checks (complexity thresholds, coupling metrics) are language-agnostic at the structural level.

### How does predict_failures work?

It requires at least 3 knowledge graph snapshots taken over time (from repeated `harness scan` runs). It analyzes the trend of constraint violations, coupling growth, and decay patterns to forecast which constraints are most likely to break in the near future. The more snapshots, the more accurate the prediction.

### How does this integrate with existing CI?

```bash
npm install -g @harness-engineering/cli
harness ci check --json
```

That's it. The exit code (0/1/2) integrates with any CI platform. Use `harness ci init --platform github|gitlab|generic` to generate a ready-to-commit config file. Architecture checks are included in the default `harness ci check` run alongside deps, security, perf, and other gates.

---

## Summary

Harness Engineering gives architects a **mechanical enforcement layer** for decisions that used to rely on tribal knowledge, code review vigilance, and hope:

1. **Encode constraints once, enforce forever** -- `/harness:enforce-architecture` with `harness.config.json` makes layer boundaries self-enforcing
2. **Decide with data, not debate** -- `/harness:architecture-advisor` structures the decision process and persists outcomes as ADRs
3. **Quantify structural risk** -- `/harness:dependency-health` and `/harness:hotspot-detector` replace gut feel with metrics
4. **Know your blast radius** -- `/harness:impact-analysis` answers "what breaks?" before you merge, not after
5. **Track architecture over time** -- `get_decay_trends` and `predict_failures` show whether constraints are holding or eroding
6. **Keep the team aligned** -- `/harness:onboarding`, `/harness:roadmap`, and `/harness:docs-pipeline` keep everyone working from the same structural truth

The goal isn't to create more architecture governance. It's to make the governance you already want **automatic, measurable, and impossible to ignore**.
