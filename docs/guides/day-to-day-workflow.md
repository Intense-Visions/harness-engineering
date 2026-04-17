# Day-to-Day Workflow: Building a Project with Harness

This tutorial walks you through the complete harness development lifecycle — from initializing a new project to shipping a PR. You'll build a **bookmark API** with a 3-layer architecture (`types → services → api`) and use harness tools at every stage.

By the end, you'll know when and why to use each harness command and skill, not just what they do.

> **Prerequisites:** Node.js 22+, pnpm 8+, Git. See the [Getting Started guide](./getting-started.md) for installation.
>
> **Convention:** This guide uses slash commands (e.g., `/harness:verify`) for interactive agent sessions — the recommended way to work day-to-day. CLI equivalents (e.g., `harness validate`) are noted where useful for CI pipelines and shell scripts.

## Quick Start

If you already have a project and just want to get going, here's the 5-step flow:

### Step 1: Initialize your project

```
/harness:initialize-project
```

This walks you through setup interactively — project name, adoption level, framework. It generates `harness.config.json`, `AGENTS.md`, directory structure, and MCP configuration.

### Step 2: Create a roadmap

```
/harness:roadmap --create
```

Build a roadmap of the changes you plan to make. It's fine to start with an empty roadmap — harness can discover what's already been done and build from there. The roadmap updates automatically as you work.

### Step 3: Pick up work

**If you have a roadmap**, let harness pick the next highest-impact task:

```
/harness:roadmap-pilot
```

**If you want to work on something specific**, describe it directly:

```
/harness:brainstorming Add test cases for the authentication module
```

Either way, harness asks clarifying questions, explores the problem space, and writes a spec for your approval. Once approved, the roadmap updates and you're ready for execution.

### Step 4: Execute

```
/harness:autopilot
```

This chains planning → execution → verification → code review automatically, pausing only at human decision points (plan approval, complex design choices, unrecoverable failures). If you prefer more control, you can run each phase individually — see the [detailed walkthrough](#contents) below.

### Step 5: Iterate

Go back to Step 3. The roadmap tracks your progress, and `/harness:roadmap-pilot` always knows what's next.

---

## Contents

0. [Quick Start](#quick-start) — 5-step onboarding flow
1. [Initialize](#1-initialize)
2. [Design](#2-design)
3. [Plan](#3-plan)
4. [Implement](#4-implement)
5. [Verify](#5-verify)
6. [Review](#6-review)
7. [Ship](#7-ship)
8. [Appendix: Maintenance](#appendix-maintenance)
9. [Quick Reference](#quick-reference)

---

## 1. Initialize

Create a new harness-managed project and confirm everything validates.

### Scaffold the project

```
/harness:initialize-project
```

The initialization skill walks you through project setup interactively — name, adoption level, framework overlay — and scaffolds everything in one pass. It generates:

- `harness.config.json` — project configuration with layers, forbidden imports, and phase gates
- `AGENTS.md` — knowledge map for AI agents working in the project
- `src/types/`, `src/services/`, `src/api/` — directory structure matching layer definitions
- `.harness/` — state directory for tracking progress across sessions
- `.mcp.json` / `.gemini/settings.json` — MCP server configuration for AI clients

> **CLI alternative:** `harness init --name bookmark-api --level intermediate` — use this in scripts or CI, not interactive sessions.

### Understand the configuration

Open `harness.config.json`. The most important sections are layers, forbidden imports, and phase gates.

**Layers** define your architecture and enforce one-way dependencies:

```json
{
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "services", "pattern": "src/services/**", "allowedDependencies": ["types"] },
    { "name": "api", "pattern": "src/api/**", "allowedDependencies": ["types", "services"] }
  ]
}
```

`types` can't import from anything. `services` can import from `types`. `api` can import from both. This is enforced mechanically — not by convention.

**Forbidden imports** prevent specific layers from pulling in heavy runtime dependencies:

```json
{
  "forbiddenImports": [
    {
      "from": "src/types/**",
      "disallow": ["express"],
      "message": "Types layer must not depend on runtime libraries"
    }
  ]
}
```

This keeps your types layer framework-agnostic.

**Phase gates** enforce that implementation files have matching spec documents:

```json
{
  "phaseGates": {
    "enabled": true,
    "severity": "warning",
    "mappings": [
      { "implPattern": "src/**/*.ts", "specPattern": "docs/changes/{feature}/proposal.md" }
    ]
  }
}
```

You'll create the spec in the next chapter before writing any implementation code.

> See [Configuration Reference](../reference/configuration.md) for the full schema.

### Customize AGENTS.md

`AGENTS.md` is the knowledge map that AI agents read to understand your project. Update the generated file with:

- **Project overview** — what the bookmark API does, what stack it uses
- **Conventions** — naming patterns, testing approach, error handling style
- **Key commands** — how to build, test, and lint the project

### Validate

Run a quick verification to confirm a clean starting state:

```
/harness:verify
```

This runs all mechanical checks in one pass — configuration validation, dependency boundaries, lint, typecheck, and tests — and returns a binary pass/fail result:

```
✓ Configuration valid
✓ AGENTS.md found
✓ Layer definitions valid
✓ No forbidden import violations
✓ No dependency violations

All checks passed.
```

> **Tip:** Run `/harness:verify` frequently — it's fast and catches configuration drift early. Think of it like `npm test` for your project structure.
>
> **CLI alternative:** `harness validate && harness check-deps` — use this in CI pipelines or shell scripts.

---

## 2. Design

Before writing code, explore the problem space and produce a spec. Harness enforces spec-first development via phase gates, so you need a spec before implementation files will pass validation.

### Start brainstorming

```
/harness:brainstorming
```

Describe what you want to build: "CRUD API for bookmarks with tagging and search."

The brainstorming skill guides you through the problem space by asking clarifying questions one at a time:

- **"What data does a bookmark contain?"** → URL, title, description, tags, created/updated timestamps
- **"What operations do you need?"** → Create, read, update, delete, search by tag
- **"Any constraints?"** → Tags are strings, max 10 per bookmark, URLs must be unique

### Select an approach

The skill proposes 2-3 approaches with trade-offs. For a simple CRUD API, the approaches might differ in storage strategy (in-memory vs. database) or API style (REST vs. GraphQL). You pick one, and the skill proceeds with the design.

### Spec output

The skill writes a spec to `docs/changes/`. Here's what the beginning of a spec looks like:

```markdown
# Bookmark API Spec

## Overview

CRUD API for managing bookmarks with tagging and search.

## Data Model

- Bookmark: id, url, title, description?, tags[], createdAt, updatedAt
- URLs must be unique across all bookmarks
- Maximum 10 tags per bookmark
```

### Spec review

After writing the spec, an automated reviewer checks it for completeness and consistency. You then review and approve the spec yourself before moving on. This is your last chance to change the design before implementation begins.

**Output:** An approved spec document in `docs/changes/`.

---

## 3. Plan

Decompose the approved design into executable tasks.

### Generate the plan

```
/harness:planning
```

The planning skill reads your approved spec and breaks it into atomic tasks — each scoped to 2-5 minutes of work, with explicit file paths:

```
Task 1: Define Bookmark type (src/types/bookmark.ts)
Task 2: Implement BookmarkService (src/services/bookmark-service.ts)
Task 3: Add bookmark routes (src/api/routes/bookmarks.ts)
Task 4: Wire routes to Express app (src/api/app.ts)
Task 5: Integration tests (tests/api/bookmarks.test.ts)
```

Tasks are ordered by dependency: types before services, services before API.

### Handoff context

The planning skill writes `.harness/handoff.json` to transfer context to the execution phase:

```json
{
  "fromSkill": "harness-planning",
  "phase": "EXECUTE",
  "pending": ["Task 1", "Task 2", "Task 3", "Task 4", "Task 5"],
  "concerns": ["Unique URL constraint needs DB-level enforcement"],
  "contextKeywords": ["bookmark", "CRUD", "tagging"]
}
```

This file ensures the next skill picks up where planning left off — it carries forward decisions, concerns, and the task list.

The full plan is also written to `docs/plans/` for human reference.

**Output:** A plan document in `docs/plans/` and a populated `.harness/handoff.json`.

---

## 4. Implement

Execute the plan with TDD and state tracking. This is the longest phase.

### Start execution

```
/harness:execution
```

The execution skill loads the plan and `.harness/handoff.json`, then works through tasks sequentially.

> **Note:** The `/harness:tdd` skill is available for teams that want a dedicated TDD-focused workflow. `/harness:execution` incorporates TDD as part of its broader task execution.

### Walkthrough: Task 1 — Define Bookmark type

Here's the full cycle for one task.

**Red — write a failing test:**

```typescript
// tests/types/bookmark.test.ts
import { Bookmark } from '../../src/types/bookmark';

describe('Bookmark type', () => {
  it('should have required fields', () => {
    const bookmark: Bookmark = {
      id: '1',
      url: 'https://example.com',
      title: 'Example',
      tags: ['test'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(bookmark.url).toBe('https://example.com');
  });
});
```

**Green — implement the type:**

```typescript
// src/types/bookmark.ts
export interface Bookmark {
  id: string;
  url: string;
  title: string;
  description?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

**Validate — run the mechanical gate:**

```
/harness:verify
```

This runs tests, lint, typecheck, and all harness checks (`validate`, `check-deps`, `check-phase-gate`) in a single pass.

> **CLI alternative:** `npm test && npm run lint && npx tsc --noEmit && harness validate && harness check-deps && harness check-phase-gate`

**Commit:**

```bash
git add src/types/bookmark.ts tests/types/bookmark.test.ts
git commit -m "feat: define Bookmark type with required fields"
```

### State tracking

After each task completes, the execution skill updates `.harness/state.json`:

```json
{
  "position": { "phase": "execute", "task": "Task 2" },
  "progress": { "Task 1": "complete" }
}
```

It also records insights in `.harness/learnings.md`:

```
- **2026-03-17 [skill:harness-execution] [outcome:success]:** Bookmark type
  needs optional description field — not all bookmarks have descriptions.
```

> **Tip:** The `/harness:state-management` skill provides dedicated commands for inspecting and managing state between sessions.

### Checkpoints

At certain points, the execution skill pauses with a `[checkpoint:human-verify]` and shows you what it's built so far. You review the output and confirm before it continues. This prevents the agent from going down a wrong path for too long.

### Quick gate between tasks

Between tasks, `/harness:verify` runs a quick pass/fail gate — tests, lint, typecheck, and all harness checks in one shot. This catches regressions immediately after each task.

> `/harness:verify` is the between-task quick gate. `/harness:verification` (Chapter 5) is the deep audit you run at milestone boundaries. Different tools for different moments.

### Remaining tasks

Tasks 2-5 follow the same red-green-validate-commit cycle. The execution skill tracks progress in `.harness/state.json` after each task and runs `/harness:verify` between tasks.

> **Tip:** `/harness:pre-commit-review` is available as a quality gate before each commit — useful if you want an extra check before the atomic commit.

---

## 5. Verify

After all tasks are complete, run a deep verification to confirm that what was built matches what was planned.

### Run the deep audit

```
/harness:verification
```

The verification skill checks your implementation at three tiers.

**EXISTS — does the file exist with real content?**

```
✓ src/types/bookmark.ts — exists, 15 lines
✓ src/services/bookmark-service.ts — exists, 45 lines
✓ src/api/routes/bookmarks.ts — exists, 60 lines
```

**SUBSTANTIVE — is it a real implementation, not a stub?**

```
✓ src/types/bookmark.ts — real type definition, no TODOs
✓ src/services/bookmark-service.ts — 5 methods implemented, no stubs
✗ src/api/routes/bookmarks.ts — line 42: empty catch block (stub)
```

**WIRED — is it connected to the rest of the system?**

```
✓ Bookmark type imported by bookmark-service.ts, bookmarks.ts
✓ BookmarkService imported by bookmarks.ts
✗ DELETE /bookmarks/:id route defined but not registered in app.ts
```

The WIRED tier catches things tests might miss — a route that exists but isn't reachable because it's not registered in the router.

> **Combined gate:** `/harness:integrity` chains verification with AI review in a single pass — use it at milestone boundaries for the deepest check.

---

## 6. Review

Run a structured code review before shipping.

### Start the review

```
/harness:code-review
```

### Context assembly

The skill measures the diff size and gathers context at a 1:1 ratio. For a 200-line diff, it reads ~200 lines of context from imports, test files, specs, and type definitions. This ensures the review has enough surrounding information to catch real issues.

### Change-type detection

The skill classifies the change (feature, bugfix, refactor, etc.) and runs a checklist specific to that type. A feature gets checked for test coverage and input validation. A refactor gets checked for behavior preservation.

### Report

```
Change type: feature (new API endpoints)

✓ Types defined before use
✓ Service layer has unit tests
✓ API routes have integration tests
✗ Missing input validation on POST /bookmarks body
✗ No error handling for duplicate URL constraint
```

Findings are evidence-based — the skill points to specific lines, not vague suggestions like "consider adding validation."

---

## 7. Ship

### Atomic commits

If you followed the execution skill, you already have one commit per task. Each commit is small, focused, and passes all checks independently.

### Final check

Run `/harness:pre-commit-review` for a final quality gate before merging.

### Create a PR

Use `/harness:git-workflow` to handle branch creation, push, and PR creation with harness validation baked in. It ensures all checks pass before the PR is opened.

Alternatively, do it manually:

```bash
git checkout -b feature/bookmark-api
git push -u origin feature/bookmark-api
gh pr create --title "feat: bookmark API with CRUD and tagging" --body "$(cat <<'EOF'
## Summary
Implements bookmark CRUD API per spec in docs/changes/bookmark-api/proposal.md
EOF
)"
```

Squash-merging to main keeps the history clean while preserving the detailed per-task commits in the PR for future reference.

---

## Appendix: Maintenance

After shipping, use these skills to keep your project healthy.

| Skill                           | What it does                                            |
| ------------------------------- | ------------------------------------------------------- |
| `/harness:detect-doc-drift`     | Finds documentation that's fallen out of sync with code |
| `/harness:cleanup-dead-code`    | Removes unused imports, functions, files                |
| `/harness:align-documentation`  | Auto-fixes documentation drift                          |
| `/harness:enforce-architecture` | Runs periodic architecture validation                   |
| `/harness:diagnostics`          | Classifies errors and routes to resolution strategies   |

For a quick project health check:

```
/harness:verify
```

This runs all mechanical checks (config, deps, phase gates, lint, typecheck, tests) in one pass.

> Run `/harness:verify` after shipping a feature, before starting new work, or on a regular schedule. Many teams also add `harness ci check` to their CI pipeline for the same checks in a non-interactive context.

---

## Quick Reference

| Stage      | Slash Command (interactive)                                                                                                                   | CLI Alternative (CI/scripts)                                         | Key Artifacts                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| Initialize | `/harness:initialize-project`                                                                                                                 | `harness init --name <name> --level <level>`                         | `harness.config.json`, `AGENTS.md`             |
| Design     | `/harness:brainstorming`                                                                                                                      | —                                                                    | `docs/changes/*/proposal.md`                   |
| Plan       | `/harness:planning`                                                                                                                           | —                                                                    | `docs/plans/*.md`, `.harness/handoff.json`     |
| Implement  | `/harness:execution`, `/harness:tdd`, `/harness:verify`                                                                                       | `harness validate && harness check-deps && harness check-phase-gate` | `.harness/state.json`, `.harness/learnings.md` |
| Verify     | `/harness:verification`, `/harness:integrity`                                                                                                 | `harness validate`                                                   | Verification report                            |
| Review     | `/harness:code-review`, `/harness:pre-commit-review`                                                                                          | `harness agent review`                                               | Review report                                  |
| Ship       | `/harness:git-workflow`                                                                                                                       | `gh pr create`                                                       | PR                                             |
| Maintain   | `/harness:verify`, `/harness:detect-doc-drift`, `/harness:cleanup-dead-code`, `/harness:align-documentation`, `/harness:enforce-architecture` | `harness ci check`                                                   | —                                              |

> **Tip:** For multi-phase projects, `/harness:autopilot` automates the Plan → Implement → Verify → Review cycle across all phases. It chains the skills above, pausing only at human decision points (plan approval, complex design, unrecoverable failures). Use it when your spec has 2+ implementation phases.

## Further Reading

- [Getting Started](./getting-started.md) — installation, examples, adoption levels
- [CLI Reference](../reference/cli.md) — complete command reference
- [Configuration Reference](../reference/configuration.md) — `harness.config.json` schema
- [The Standard](../standard/index.md) — harness engineering principles
- [Task API Example](../../examples/task-api/README.md) — intermediate example with exercises
