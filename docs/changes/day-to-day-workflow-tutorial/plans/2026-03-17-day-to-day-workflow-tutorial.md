# Day-to-Day Workflow Tutorial — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write a walkthrough tutorial (`docs/guides/day-to-day-workflow.md`) that follows a greenfield bookmark API project through the complete harness development lifecycle.

**Architecture:** Single markdown document, ~8 chapters, each covering one stage of the harness workflow. Uses a running example (bookmark API with 3-layer architecture) to demonstrate CLI commands and skill invocations together.

**Tech Stack:** Markdown documentation only. References existing harness CLI commands, skills, and configuration.

**Spec:** `docs/changes/day-to-day-workflow-tutorial/proposal.md`

---

## File Structure

- **Create:** `docs/guides/day-to-day-workflow.md` — the tutorial document

**Reference files (read-only):**

- `docs/reference/cli.md` — CLI command syntax and options
- `docs/reference/configuration.md` — `harness.config.json` schema
- `docs/guides/getting-started.md` — existing getting-started guide (avoid overlap)
- `examples/task-api/` — intermediate example for reference patterns

---

## Chunk 1: Document skeleton and Chapter 1 (Initialize)

### Task 1: Create document with front matter and Chapter 1

**Files:**

- Create: `docs/guides/day-to-day-workflow.md`

- [ ] **Step 1: Write the document title, introduction, and table of contents**

Write the opening of `docs/guides/day-to-day-workflow.md`:

```markdown
# Day-to-Day Workflow: Building a Project with Harness

This tutorial walks you through the complete harness development lifecycle — from initializing a new project to shipping a PR. You'll build a **bookmark API** with a 3-layer architecture (`types → services → api`) and use harness tools at every stage.

By the end, you'll know when and why to use each harness command and skill, not just what they do.

> **Prerequisites:** Node.js 22+, pnpm 8+, Git. See the [Getting Started guide](./getting-started.md) for installation.

## Contents

1. [Initialize](#1-initialize)
2. [Design](#2-design)
3. [Plan](#3-plan)
4. [Implement](#4-implement)
5. [Verify](#5-verify)
6. [Review](#6-review)
7. [Ship](#7-ship)
8. [Appendix: Maintenance](#appendix-maintenance)
9. [Quick Reference](#quick-reference)
```

- [ ] **Step 2: Write Chapter 1 — Initialize**

Continue the file with the Initialize chapter. Cover:

1. Running `harness init --name bookmark-api --level intermediate`
2. Showing representative output of what gets generated
3. Walking through `harness.config.json` — explain the `layers` array (types → services → api), `forbiddenImports`, and `phaseGates` fields. Reference `docs/reference/configuration.md` for the full schema.
4. Explaining the generated `AGENTS.md` — what to customize (project overview, conventions section, key commands)
5. Running `harness validate` and `harness check-deps` to confirm a clean start
6. Showing representative output for both commands

Use this structure for the config walkthrough:

```markdown
### What got generated

`harness init` created:

- `harness.config.json` — project configuration with layers, forbidden imports, and phase gates
- `AGENTS.md` — knowledge map for AI agents working in the project
- `src/types/`, `src/services/`, `src/api/` — directory structure matching layer definitions
- `.harness/` — state directory for tracking progress across sessions
```

Show the layer configuration from `harness.config.json`:

```json
{
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "services", "pattern": "src/services/**", "allowedDependencies": ["types"] },
    { "name": "api", "pattern": "src/api/**", "allowedDependencies": ["types", "services"] }
  ]
}
```

Explain: types can't import anything, services can import types, api can import both. This is enforced mechanically — not by convention.

Also show the `forbiddenImports` and `phaseGates` fields with brief JSON snippets:

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

Explain: this prevents the types layer from importing Express, keeping it framework-agnostic.

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

Explain: phase gates enforce that implementation files have matching spec documents. You'll create the spec in Chapter 2 before writing any implementation code.

Show `harness validate` output:

```
✓ Configuration valid
✓ AGENTS.md found
✓ Layer definitions valid
✓ No forbidden import violations

All checks passed.
```

Show `harness check-deps` output:

```
Checking dependency layers...
✓ types: 0 violations
✓ services: 0 violations
✓ api: 0 violations

No dependency violations found.
```

End the chapter with a callout:

```markdown
> **Tip:** Run `harness validate` frequently — it's fast and catches configuration drift early. Think of it like `npm test` for your project structure.
```

- [ ] **Step 3: Review Chapter 1 content**

Read the written chapter and verify:

- All CLI commands match `docs/reference/cli.md` syntax
- Config JSON matches `docs/reference/configuration.md` schema
- No overlap with content already in `docs/guides/getting-started.md`
- Tone is direct, second-person, no filler

- [ ] **Step 4: Commit**

```bash
git add docs/guides/day-to-day-workflow.md
git commit -m "docs: add day-to-day workflow tutorial — Chapter 1 (Initialize)"
```

---

## Chunk 2: Chapters 2 and 3 (Design and Plan)

### Task 2: Write Chapter 2 — Design

**Files:**

- Modify: `docs/guides/day-to-day-workflow.md`

- [ ] **Step 1: Write Chapter 2 — Design**

Append Chapter 2 to the document. Cover:

1. **Why design first** — one sentence: harness enforces spec-first development via phase gates, so you need a spec before you write code.

2. **Invoking the brainstorming skill** — show:

   ```
   /harness:brainstorming
   ```

   Explain: this skill guides you through exploring the problem space. You describe what you want to build ("CRUD API for bookmarks with tagging and search"), and the skill asks clarifying questions one at a time.

3. **The question/answer flow** — show 2-3 representative questions the skill would ask:
   - "What data does a bookmark contain?" → URL, title, description, tags, created/updated timestamps
   - "What operations do you need?" → Create, read, update, delete, search by tag
   - "Any constraints?" → Tags are strings, max 10 per bookmark, URLs must be unique

4. **Approach selection** — the skill proposes 2-3 approaches. Show a brief example of the recommended approach being selected.

5. **Spec output** — the skill writes a spec to `docs/changes/`. Show the file path and a brief excerpt (3-5 lines) of what a spec looks like — not the full spec.

6. **Spec review** — explain the automated review loop (reviewer checks the spec) and the human approval gate. One paragraph.

7. **Output** — end with what you now have: an approved spec document in `docs/changes/`.

- [ ] **Step 2: Review Chapter 2**

Verify the skill invocation syntax matches the registered slash command. Verify the description of the brainstorming workflow is accurate to the skill's actual behavior.

### Task 3: Write Chapter 3 — Plan

- [ ] **Step 3: Write Chapter 3 — Plan**

Append Chapter 3 to the document. Cover:

1. **Invoking the planning skill:**

   ```
   /harness:planning
   ```

   Explain: this skill reads your approved spec and decomposes it into atomic tasks.

2. **Task decomposition output** — show a representative task list (abbreviated, 4-5 tasks):

   ```
   Task 1: Define Bookmark type (src/types/bookmark.ts)
   Task 2: Implement BookmarkService (src/services/bookmark-service.ts)
   Task 3: Add bookmark routes (src/api/routes/bookmarks.ts)
   Task 4: Wire routes to Express app (src/api/app.ts)
   Task 5: Integration tests (tests/api/bookmarks.test.ts)
   ```

   Note: each task is 2-5 minutes, single context window, with explicit file paths.

3. **Dependency ordering** — explain that tasks are ordered by dependency (types before services before API). One sentence.

4. **Handoff context** — explain `.harness/handoff.json`:

   ```json
   {
     "fromSkill": "harness-planning",
     "phase": "EXECUTE",
     "pending": ["Task 1", "Task 2", "Task 3", "Task 4", "Task 5"],
     "concerns": ["Unique URL constraint needs DB-level enforcement"],
     "contextKeywords": ["bookmark", "CRUD", "tagging"]
   }
   ```

   Explain: this file transfers context from planning to execution so the next skill picks up where planning left off.

5. **Plan document** — note that the full plan is also written to `docs/plans/` for human reference.

- [ ] **Step 4: Commit**

```bash
git add docs/guides/day-to-day-workflow.md
git commit -m "docs: add workflow tutorial — Chapters 2-3 (Design, Plan)"
```

---

## Chunk 3: Chapter 4 (Implement)

### Task 4: Write Chapter 4 — Implement

**Files:**

- Modify: `docs/guides/day-to-day-workflow.md`

- [ ] **Step 1: Write the chapter opening and skill invocation**

Start Chapter 4. Cover:

1. **Invoking the execution skill:**

   ```
   /harness:execution
   ```

   Explain: this skill loads the plan and `.harness/handoff.json`, then works through tasks sequentially.

2. **TDD note** — mention that `/harness:tdd` is available as a dedicated TDD skill for teams that want it; `/harness:execution` incorporates TDD as part of its workflow.

- [ ] **Step 2: Write the detailed task walkthrough**

Walk through **Task 1** (Define Bookmark type) in full detail, showing the TDD cycle:

1. **Red** — write a failing test:

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

2. **Green** — implement the type:

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

3. **Validate** — run the mechanical gate:

   ```bash
   npm test
   npm run lint
   npx tsc --noEmit
   harness validate
   harness check-deps
   ```

4. **Commit:**
   ```bash
   git add src/types/bookmark.ts tests/types/bookmark.test.ts
   git commit -m "feat: define Bookmark type with required fields"
   ```

- [ ] **Step 3: Write state tracking and checkpoints**

After the detailed walkthrough, cover:

1. **State updates** — show `.harness/state.json` after Task 1 completes:

   ```json
   {
     "position": { "phase": "execute", "task": "Task 2" },
     "progress": { "Task 1": "complete" }
   }
   ```

2. **Learnings** — show a `.harness/learnings.md` entry:

   ```
   - **2026-03-17 [skill:harness-execution] [outcome:success]:** Bookmark type
     needs optional description field — not all bookmarks have descriptions.
   ```

   Note: the `/harness:state-management` skill provides dedicated commands for inspecting and managing state.

3. **Checkpoint** — explain `[checkpoint:human-verify]`:

   > At certain points, the execution skill pauses and shows you what it's built so far. You review the output and confirm before it continues. This prevents the agent from going down a wrong path for too long.

4. **Quick gate between tasks** — explain that `/harness:verify` runs a quick pass/fail gate between tasks (tests + lint + typecheck + `harness validate`). This is distinct from the deep audit in Chapter 5 (`/harness:verification`):

   > `/harness:verify` is the between-task quick gate — it runs after every task to catch regressions immediately. `/harness:verification` (Chapter 5) is the deep audit you run at milestone boundaries to check EXISTS → SUBSTANTIVE → WIRED.

5. **Remaining tasks** — briefly note that Tasks 2-5 follow the same cycle. Don't repeat the full walkthrough. Instead, summarize:

   > Tasks 2-5 follow the same red-green-validate-commit cycle. The execution skill tracks progress in `.harness/state.json` after each task and runs `/harness:verify` between tasks.

6. **Pre-commit review** — mention that `/harness:pre-commit-review` is available as a quality gate before each commit.

- [ ] **Step 4: Commit**

```bash
git add docs/guides/day-to-day-workflow.md
git commit -m "docs: add workflow tutorial — Chapter 4 (Implement)"
```

---

## Chunk 4: Chapters 5-7 (Verify, Review, Ship)

### Task 5: Write Chapter 5 — Verify

**Files:**

- Modify: `docs/guides/day-to-day-workflow.md`

- [ ] **Step 1: Write Chapter 5 — Verify**

Cover:

1. **Invoking verification:**

   ```
   /harness:verification
   ```

2. **Three verification tiers** with bookmark API examples:

   **EXISTS:**

   ```
   ✓ src/types/bookmark.ts — exists, 15 lines
   ✓ src/services/bookmark-service.ts — exists, 45 lines
   ✓ src/api/routes/bookmarks.ts — exists, 60 lines
   ```

   **SUBSTANTIVE:**

   ```
   ✓ src/types/bookmark.ts — real type definition, no TODOs
   ✓ src/services/bookmark-service.ts — 5 methods implemented, no stubs
   ✗ src/api/routes/bookmarks.ts — line 42: empty catch block (stub)
   ```

   **WIRED:**

   ```
   ✓ Bookmark type imported by bookmark-service.ts, bookmarks.ts
   ✓ BookmarkService imported by bookmarks.ts
   ✗ DELETE /bookmarks/:id route defined but not registered in app.ts
   ```

3. **PASS vs FAIL** — the WIRED example above shows a failure. Explain: the verification skill catches things tests might miss — a route that exists but isn't actually reachable because it's not wired to the router.

4. **Integrity skill** — note that `harness-integrity` (invoked via `harness skill run harness-integrity`) provides a combined gate that chains verification with AI review in a single pass.

### Task 6: Write Chapter 6 — Review

- [ ] **Step 2: Write Chapter 6 — Review**

Cover:

1. **Invoking code review:**

   ```
   /harness:code-review
   ```

2. **Context assembly** — explain: the skill measures the diff size, then gathers context at a 1:1 ratio. For a 200-line diff, it reads ~200 lines of context from imports, test files, specs, and type definitions.

3. **Change-type detection** — the skill classifies the change (feature, bugfix, refactor, etc.) and runs a checklist specific to that type.

4. **Report output** — show an abbreviated example:

   ```
   Change type: feature (new API endpoints)

   ✓ Types defined before use
   ✓ Service layer has unit tests
   ✓ API routes have integration tests
   ✗ Missing input validation on POST /bookmarks body
   ✗ No error handling for duplicate URL constraint
   ```

   Note: findings are evidence-based — the skill points to specific lines, not vague suggestions.

### Task 7: Write Chapter 7 — Ship

- [ ] **Step 3: Write Chapter 7 — Ship**

Cover:

1. **Atomic commits recap** — note that if you followed the execution skill, you already have one commit per task. Each commit is small, focused, and passes all checks.

2. **Pre-commit review** — mention `/harness:pre-commit-review` for a final check before merging.

3. **Creating a PR:**

   ```bash
   git checkout -b feature/bookmark-api
   git push -u origin feature/bookmark-api
   gh pr create --title "feat: bookmark API with CRUD and tagging" --body "$(cat <<'EOF'
   ## Summary
   Implements bookmark CRUD API per spec in docs/changes/bookmark-api/proposal.md
   EOF
   )"
   ```

4. **Squash-merge** — note that squash-merging to main keeps the history clean while preserving the detailed commits in the PR.

- [ ] **Step 4: Commit**

```bash
git add docs/guides/day-to-day-workflow.md
git commit -m "docs: add workflow tutorial — Chapters 5-7 (Verify, Review, Ship)"
```

---

## Chunk 5: Appendix, Quick Reference, and final review

### Task 8: Write the Appendix and Quick Reference

**Files:**

- Modify: `docs/guides/day-to-day-workflow.md`

- [ ] **Step 1: Write Appendix — Maintenance**

Brief section covering:

- `/harness:detect-doc-drift` — finds documentation that's fallen out of sync with code
- `/harness:cleanup-dead-code` — removes unused imports, functions, files
- `/harness:align-documentation` — auto-fixes doc drift
- `/harness:enforce-architecture` — runs periodic architecture checks
- `/harness:diagnostics` — classifies errors and routes to resolution strategies
- `harness validate` + `harness check-deps` + `harness check-phase-gate` — project health check (run as a set)

Add a brief note on when to run these:

> Run maintenance checks after shipping a feature, before starting new work, or on a regular schedule. Many teams add `harness validate` and `harness check-deps` to their CI pipeline.

- [ ] **Step 2: Write Quick Reference table**

Add the summary table:

```markdown
| Stage      | CLI Commands                                                         | Skills                                                                                                                                             | Key Artifacts                                  |
| ---------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Initialize | `harness init`, `harness validate`, `harness check-deps`             | `/harness:initialize-project`                                                                                                                      | `harness.config.json`, `AGENTS.md`             |
| Design     | —                                                                    | `/harness:brainstorming`                                                                                                                           | `docs/changes/*/proposal.md`                   |
| Plan       | —                                                                    | `/harness:planning`                                                                                                                                | `docs/plans/*.md`, `.harness/handoff.json`     |
| Implement  | `harness validate`, `harness check-deps`, `harness check-phase-gate` | `/harness:execution`, `/harness:tdd`, `/harness:verify`                                                                                            | `.harness/state.json`, `.harness/learnings.md` |
| Verify     | `harness validate`                                                   | `/harness:verification`                                                                                                                            | Verification report                            |
| Review     | —                                                                    | `/harness:code-review`, `/harness:pre-commit-review`                                                                                               | Review report                                  |
| Ship       | `gh pr create`                                                       | `/harness:git-workflow`                                                                                                                            | PR                                             |
| Maintain   | `harness validate`, `harness check-deps`                             | `/harness:detect-doc-drift`, `/harness:cleanup-dead-code`, `/harness:align-documentation`, `/harness:enforce-architecture`, `/harness:diagnostics` | —                                              |
```

Add cross-links at the end:

```markdown
## Further Reading

- [Getting Started](./getting-started.md) — installation, examples, adoption levels
- [CLI Reference](../reference/cli.md) — complete command reference
- [Configuration Reference](../reference/configuration.md) — `harness.config.json` schema
- [The Standard](../standard/index.md) — harness engineering principles
- [Task API Example](../../examples/task-api/README.md) — intermediate example with exercises
```

- [ ] **Step 3: Full document review**

Read the complete document end-to-end and verify:

- All CLI commands match `docs/reference/cli.md` syntax
- All skill invocations use the `/harness:*` slash command format
- All file paths use `.harness/` prefix for state files
- Tone is consistent: direct, second-person, no filler
- No content duplicated from `docs/guides/getting-started.md`
- Cross-links are valid relative paths
- Table of contents links match actual heading anchors

- [ ] **Step 4: Commit**

```bash
git add docs/guides/day-to-day-workflow.md
git commit -m "docs: complete workflow tutorial — Appendix, Quick Reference, cross-links"
```
