# Design Spec: Day-to-Day Workflow Tutorial

## Overview

A walkthrough tutorial that follows a greenfield project (a bookmark API) from `harness init` through to a merged PR. The tutorial targets both framework adopters using the CLI directly and AI agent operators using harness skills, showing them working together as a single narrative.

**Location:** `docs/guides/day-to-day-workflow.md`

## Goals

- Show the complete harness development lifecycle through a concrete example
- Demonstrate when and why to use each tool, not just what they do
- Serve as the practical companion to the existing getting-started guide

## Non-Goals

- Not an API/CLI reference (defer to `docs/reference/`)
- Not a conceptual overview of harness principles (defer to `docs/standard/`)
- Not a migration guide for existing projects

## Running Example

A **bookmark API** with a 3-layer architecture: `types → services → api`. Small enough to not distract from the workflow, complex enough to exercise layer enforcement, TDD, verification, and review.

## Document Structure

### Chapter 1: Initialize (~15%)

Walk through creating a new harness project from scratch.

- Run `harness init --name bookmark-api --level intermediate`
- Explain the generated `harness.config.json` (verify actual output — may be `harness.yaml`): layers, forbidden imports, phase gates
- Show the generated AGENTS.md and what to customize (project overview, conventions, key commands)
- Run `harness validate` to confirm a clean starting state
- Run `harness check-deps` to verify layer definitions

### Chapter 2: Design (~15%)

Explore the problem space and produce a spec.

- Invoke the `/harness:brainstorming` skill with the feature idea ("CRUD API for bookmarks with tagging")
- Show the clarifying question/answer flow and approach selection
- Spec gets written to `docs/specs/`
- Spec review loop: automated reviewer checks, then human approval gate
- Output: an approved spec document

### Chapter 3: Plan (~15%)

Decompose the approved design into executable tasks.

- Invoke the `/harness:planning` skill against the approved spec
- Show task decomposition output: atomic tasks (2-5 min each), dependency ordering
- Explain `.harness/handoff.json` — how it bridges design into implementation context
- Plan written to `docs/plans/`
- Output: a plan document and populated `.harness/handoff.json`

### Chapter 4: Implement (~25%)

Execute the plan with TDD and state tracking. Largest section.

- Invoke the `/harness:execution` skill, which loads the plan and handoff
- Note: the `/harness:tdd` skill is available for teams that want a dedicated TDD-focused workflow; `/harness:execution` incorporates TDD as part of its broader task execution
- Walk through one task in full detail:
  - Write a failing test (red)
  - Implement until it passes (green)
  - Refactor if needed
  - Run `harness validate`, `harness check-deps`, and `harness check-phase-gate`
  - Atomic commit (mention `/harness:pre-commit-review` as available quality gate)
- Show `.harness/state.json` updates after task completion
- Show a `.harness/learnings.md` entry being recorded
- Note: the `/harness:state-management` skill provides dedicated state inspection and management
- Demonstrate a `[checkpoint:human-verify]` pause point
- Show the quick gate (`/harness:verification` quick mode) running between tasks: tests + lint + typecheck + harness validate
- Briefly cover remaining tasks (summarize, don't repeat the full cycle)

### Chapter 5: Verify (~10%)

Validate that what was built matches what was planned.

- Invoke the `/harness:verification` skill (deep audit mode)
- Note: the `harness-integrity` skill provides a combined gate that chains verification with AI review (invoked via `harness skill run harness-integrity`, no slash command registered)
- Walk through the 3 verification tiers with concrete bookmark API examples:
  - **EXISTS:** File exists, has content, correct location
  - **SUBSTANTIVE:** Real implementation (no TODOs, stubs, empty handlers)
  - **WIRED:** Imported by other modules, tests pass, routes reachable
- Show what a PASS report looks like
- Show what a FAIL report looks like (e.g., a route defined but not wired to the router)

### Chapter 6: Review (~10%)

Run a structured code review before shipping.

- Invoke the `/harness:code-review` skill
- Show context assembly: diff size measurement, gathering imports/tests/specs/types
- Walk through the change-type-specific checklist
- Show the evidence-based report output (no "seems to" — concrete findings)

### Chapter 7: Ship (~5%)

Merge and create a PR.

- Recap the atomic commit strategy used during implementation
- Mention `/harness:pre-commit-review` for final pre-merge check
- Squash-merge to main (or create PR branch)
- Create PR with `gh pr create` showing the summary derived from the plan

### Chapter 8: Appendix — Maintenance (~5%)

Brief overview of ongoing maintenance tools.

- `/harness:detect-doc-drift` — find documentation that's fallen out of sync
- `/harness:cleanup-dead-code` — remove unused imports, functions, files
- `/harness:align-documentation` — auto-fix doc drift
- `/harness:enforce-architecture` — periodic architecture checks
- `/harness:diagnostics` — classify errors into taxonomy categories and route to resolution strategies
- `harness validate` + `harness check-deps` + `harness check-phase-gate` — project health check (run as a set)
- When to run: after shipping, before starting new work, on a schedule

### Quick Reference Table

Summary table mapping each workflow stage to its commands and skills.

| Stage      | CLI Commands                                                         | Skills                                                                                                                                             | Key Artifacts                                  |
| ---------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Initialize | `harness init`, `harness validate`, `harness check-deps`             | `/harness:initialize-project`                                                                                                                      | `harness.config.json`, `AGENTS.md`             |
| Design     | —                                                                    | `/harness:brainstorming`                                                                                                                           | `docs/specs/*.md`                              |
| Plan       | —                                                                    | `/harness:planning`                                                                                                                                | `docs/plans/*.md`, `.harness/handoff.json`     |
| Implement  | `harness validate`, `harness check-deps`, `harness check-phase-gate` | `/harness:execution`, `/harness:tdd`                                                                                                               | `.harness/state.json`, `.harness/learnings.md` |
| Verify     | `harness validate`                                                   | `/harness:verification`, `harness-integrity` (skill)                                                                                               | Verification report                            |
| Review     | —                                                                    | `/harness:code-review`, `/harness:pre-commit-review`                                                                                               | Review report                                  |
| Ship       | `gh pr create`                                                       | `/harness:git-workflow`                                                                                                                            | PR                                             |
| Maintain   | `harness validate`, `harness check-deps`                             | `/harness:detect-doc-drift`, `/harness:cleanup-dead-code`, `/harness:align-documentation`, `/harness:enforce-architecture`, `/harness:diagnostics` | —                                              |

## Tone and Conventions

- **Tone:** Practical, direct, second person ("you")
- **Code blocks** for all CLI commands and skill invocations
- **"What you'll see"** blocks after commands showing representative output (abbreviated)
- **Callout boxes** (`>` blockquotes) for tips and warnings
- **Cross-links** to existing reference docs rather than duplicating content
- Every sentence either teaches a concept or shows a command — no filler

## Dependencies

- Existing docs: `docs/reference/cli.md`, `docs/reference/configuration.md`, `docs/guides/getting-started.md`
- Existing examples: `examples/task-api/` (referenced as "further reading" for intermediate adoption)
- Skills referenced (by directory name): `initialize-harness-project`, `harness-brainstorming`, `harness-planning`, `harness-execution`, `harness-tdd`, `harness-verification`, `harness-integrity`, `harness-code-review`, `harness-pre-commit-review`, `harness-git-workflow`, `harness-state-management`, `detect-doc-drift`, `cleanup-dead-code`, `align-documentation`, `enforce-architecture`, `harness-diagnostics`
