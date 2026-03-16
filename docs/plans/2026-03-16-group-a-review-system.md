# Group A: Review System Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the code review skill into a context-rich, change-aware, feedback-calibrated review system. Add context assembly with 1:1 ratio, commit history awareness, review learnings calibration, change-type-aware checklists, a pre-commit review hook skill, and a stub for the unified integrity gate.

**Architecture:** Modifications to `harness-code-review/SKILL.md` (A1-A4), convention addition to `docs/standard/implementation.md` (A3), two new skills: `harness-pre-commit-review` (A5) and `harness-integrity` (A6 stub).

**Tech Stack:** Markdown (SKILL.md files), YAML (skill.yaml files), Git (commit history commands)

**Spec:** `docs/specs/2026-03-16-research-roadmap-design.md` (Group A section)

---

## Chunk 1: Context Assembly — 1:1 Ratio (A1)

### Task 1: Add Context Assembly section to SKILL.md

**Files:**

- Modify: `agents/skills/claude-code/harness-code-review/SKILL.md`

- [ ] **Step 1: Insert the Context Assembly section before the Process section**

In `agents/skills/claude-code/harness-code-review/SKILL.md`, insert the following section between `## When to Use` (ends around line 13) and `## Process` (line 14). The new section goes immediately before `## Process`:

````markdown
## Context Assembly

Before beginning any review phase, assemble context proportional to the change size.

### 1:1 Context Ratio Rule

For every N lines of diff, gather approximately N lines of surrounding context. This ensures the reviewer understands the ecosystem around the change, not just the change itself.

- **Small diffs (<20 lines):** Gather proportionally more context — aim for 3:1 context-to-diff. Small changes often have outsized impact and need more surrounding understanding.
- **Medium diffs (20-200 lines):** Target 1:1 ratio. Read the full files containing changes, plus immediate dependencies.
- **Large diffs (>200 lines):** 1:1 ratio is the floor, but prioritize ruthlessly using the priority order below. Flag large diffs as a review concern — they are harder to review correctly.

### Context Gathering Priority Order

Gather context in this order until the ratio is met:

1. **Files directly imported/referenced by changed files** — read the modules that the changed code calls or depends on. Without this, you cannot evaluate correctness.
2. **Corresponding test files** — find tests for the changed code. If tests exist, read them to understand expected behavior. If tests are missing, note this as a finding.
3. **Spec/design docs mentioning changed components** — search `docs/specs/`, `docs/design-docs/`, and `docs/plans/` for references to the changed files or features. The spec defines "correct."
4. **Type definitions used by changed code** — read interfaces, types, and schemas that the changed code consumes or produces. Type mismatches are high-severity bugs.
5. **Recent commits touching the same files** — see Commit History below (A2).

### Context Assembly Commands

```bash
# 1. Get the diff and measure its size
git diff --stat HEAD~1          # or the relevant commit range
git diff HEAD~1 -- <file>       # per-file diff

# 2. Find imports/references in changed files
grep -n "import\|require\|from " <changed-file>

# 3. Find corresponding test files
find . -name "*<module-name>*test*" -o -name "*<module-name>*spec*"

# 4. Search for spec/design references
grep -rl "<component-name>" docs/specs/ docs/design-docs/ docs/plans/

# 5. Find type definitions
grep -rn "interface\|type\|schema" <changed-file> | head -20
```
````

````

- [ ] **Step 2: Verify the section is correctly placed**

Read the file and confirm `## Context Assembly` appears after `## When to Use` and before `## Process`.

- [ ] **Step 3: Commit**

```bash
git add agents/skills/claude-code/harness-code-review/SKILL.md
git commit -m "feat(review): add Context Assembly section with 1:1 context ratio rule (A1)"
````

---

## Chunk 2: Commit History in Review Context (A2)

### Task 2: Add commit history gathering to Context Assembly

**Files:**

- Modify: `agents/skills/claude-code/harness-code-review/SKILL.md`

- [ ] **Step 1: Add commit history subsection to Context Assembly**

In `agents/skills/claude-code/harness-code-review/SKILL.md`, append the following immediately after the `### Context Assembly Commands` code block (end of the Context Assembly section), before `## Process`:

````markdown
### Commit History Context

As part of context assembly (priority item #5), retrieve recent commit history for every affected file:

```bash
# Recent commits touching affected files (5 per file)
git log --oneline -5 -- <affected-file>

# For all affected files at once
git log --oneline -5 -- <file1> <file2> <file3>
```
````

Use commit history to answer:

- **Is this a hotspot?** If the file has been changed 3+ times in the last 5 commits, it is volatile. Pay extra attention — frequent changes suggest instability or ongoing refactoring.
- **Was this recently refactored?** If recent commits include "refactor" or "restructure," check whether the current change aligns with or contradicts the refactoring direction.
- **Who has been working here?** If multiple authors touched the file recently, there may be conflicting assumptions. Look for consistency.
- **What was the last change?** The most recent commit gives context on the file's trajectory. A bugfix followed by another change to the same area is a yellow flag.

````

- [ ] **Step 2: Verify the addition**

Read the Context Assembly section and confirm the Commit History Context subsection is present and correctly positioned.

- [ ] **Step 3: Commit**

```bash
git add agents/skills/claude-code/harness-code-review/SKILL.md
git commit -m "feat(review): add commit history context gathering to Context Assembly (A2)"
````

---

## Chunk 3: Review Feedback Learnings Convention (A3)

### Task 3a: Add review learnings convention to implementation.md

**Files:**

- Modify: `docs/standard/implementation.md`

- [ ] **Step 1: Add the review learnings convention to implementation.md**

In `docs/standard/implementation.md`, add the following section before the `## Next Steps` section (around line 1082). Insert it after the `## Common Challenges & Solutions` section:

````markdown
## Project Conventions: Harness Files

The following files live in the `.harness/` directory at the project root. They are optional but recommended — skills that support them will read and use them automatically.

### `.harness/review-learnings.md`

A calibration file for code review. Records what review findings are valuable versus noisy for this specific project. The review skill reads this file (if present) and adjusts its focus areas accordingly.

**Schema:**

```markdown
# Review Learnings

## Useful Findings

- [category]: [example] — [why this was valuable]

## Noise / False Positives

- [category]: [example] — [why this wasn't helpful]

## Calibration Notes

- [specific guidance for this project]
```
````

**Example:**

```markdown
# Review Learnings

## Useful Findings

- error-handling: Missing catch in async pipeline — caused silent failures in production
- type-safety: Implicit any in service boundaries — led to runtime type mismatches
- test-coverage: Untested error paths in payment flow — caught a real bug

## Noise / False Positives

- naming: Flagging single-letter variables in test helpers — these are conventional (e.g., `t`, `e`)
- error-handling: Missing error handling in CLI scripts — these exit on error by design
- docs: Missing JSDoc on internal utility functions — we document at module level, not function level

## Calibration Notes

- This project uses Result types everywhere — do not flag missing try/catch in functions that return Result<T, E>
- Test helpers intentionally use loose types for ergonomics — do not flag missing type annotations in test/
- The CLI package uses process.exit() intentionally — do not flag as an anti-pattern
```

**Maintenance:** Append new entries after each review cycle. Periodically prune entries that are no longer relevant (e.g., after a major refactor changes the codebase patterns).

````

- [ ] **Step 2: Commit implementation.md changes**

```bash
git add docs/standard/implementation.md
git commit -m "docs(standard): add .harness/review-learnings.md convention to implementation guide (A3)"
````

### Task 3b: Add review learnings integration to SKILL.md

**Files:**

- Modify: `agents/skills/claude-code/harness-code-review/SKILL.md`

- [ ] **Step 3: Add review learnings integration to Context Assembly**

In `agents/skills/claude-code/harness-code-review/SKILL.md`, append the following at the end of the Context Assembly section (after the Commit History Context subsection), before `## Process`:

````markdown
### Review Learnings Calibration

Before starting the review, check for a project-specific calibration file:

```bash
# Check if review learnings file exists
cat .harness/review-learnings.md 2>/dev/null
```
````

If `.harness/review-learnings.md` exists:

1. **Read the Useful Findings section.** Prioritize these categories during review — they have historically caught real issues in this project.
2. **Read the Noise / False Positives section.** De-prioritize or skip these categories — flagging them wastes the author's time and erodes trust in the review process.
3. **Read the Calibration Notes section.** Apply these project-specific overrides to your review judgment. These represent deliberate team decisions, not oversights.

If the file does not exist, proceed with default review focus areas. After completing the review, consider suggesting that the team create `.harness/review-learnings.md` if you notice patterns that would benefit from calibration.

````

- [ ] **Step 4: Verify both files are updated**

Read the relevant sections in both `docs/standard/implementation.md` and `agents/skills/claude-code/harness-code-review/SKILL.md` to confirm the additions.

- [ ] **Step 5: Commit SKILL.md changes**

```bash
git add agents/skills/claude-code/harness-code-review/SKILL.md
git commit -m "feat(review): integrate .harness/review-learnings.md into Context Assembly (A3)"
````

---

## Chunk 4: Change-Type-Aware Review Workflows (A4)

### Task 4: Add change-type detection and per-type checklists

**Files:**

- Modify: `agents/skills/claude-code/harness-code-review/SKILL.md`

- [ ] **Step 1: Add Change-Type Detection section after Context Assembly**

In `agents/skills/claude-code/harness-code-review/SKILL.md`, insert the following section after `## Context Assembly` (and all its subsections) and before `## Process`:

````markdown
## Change-Type Detection

After assembling context, determine the change type. This shapes which checklist to apply during review.

### Detection Method

1. **Explicit argument:** If the review was invoked with a change type (e.g., `--type feature`), use it.
2. **Commit message prefix:** Parse the most recent commit message for conventional commit prefixes:
   - `feat:` or `feature:` → **feature**
   - `fix:` or `bugfix:` → **bugfix**
   - `refactor:` → **refactor**
   - `docs:` or `doc:` → **docs**
3. **Diff pattern heuristic:** If no prefix is found, examine the diff:
   - New files added + tests added → likely **feature**
   - Small changes to existing files + test added → likely **bugfix**
   - File renames, moves, or restructuring with no behavior change → likely **refactor**
   - Only `.md` files or comments changed → likely **docs**
4. **Default:** If detection is ambiguous, treat as **feature** (the most thorough checklist).

```bash
# Parse commit message prefix
git log --oneline -1 | head -1

# Check for new files
git diff --name-status HEAD~1 | grep "^A"

# Check if only docs changed
git diff --name-only HEAD~1 | grep -v "\.md$" | wc -l  # 0 means docs-only
```
````

### Per-Type Review Checklists

Apply the checklist matching the detected change type. These replace the generic review — do not apply all checklists to every change.

#### Feature Checklist

- [ ] **Spec alignment:** Does the implementation match the spec/design doc? Are all specified behaviors present?
- [ ] **Edge cases:** Are boundary conditions handled (empty input, max values, null, concurrent access)?
- [ ] **Test coverage:** Are there tests for happy path, error paths, and edge cases? Is coverage meaningful, not just present?
- [ ] **API surface:** Are new public interfaces minimal and well-named? Could any new export be kept internal?
- [ ] **Backward compatibility:** Does this break existing callers? If so, is the migration path documented?

#### Bugfix Checklist

- [ ] **Root cause identified:** Does the fix address the root cause, not just the symptom? Is the original issue referenced?
- [ ] **Regression test added:** Is there a test that would have caught this bug before the fix? Does it fail without the fix and pass with it?
- [ ] **No collateral changes:** Does the fix change only what is necessary? Unrelated changes in a bugfix PR are a red flag.
- [ ] **Original issue referenced:** Does the commit or PR reference the bug report or issue number?

#### Refactor Checklist

- [ ] **Behavioral equivalence:** Do all existing tests still pass without modification? If tests changed, justify why.
- [ ] **No functionality changes:** Does the refactor introduce any new behavior, even subtly? New behavior belongs in a feature PR.
- [ ] **Performance preserved:** Could the restructuring introduce performance regressions (e.g., extra allocations, changed query patterns)?
- [ ] **Improved clarity:** Is the code demonstrably clearer after the refactor? If not, the refactor may not be justified.

#### Docs Checklist

- [ ] **Accuracy vs. current code:** Do the documented behaviors match what the code actually does? Run the examples if possible.
- [ ] **Completeness:** Are all public interfaces documented? Are there undocumented parameters, return values, or error conditions?
- [ ] **Consistency:** Does the new documentation follow the same style, terminology, and structure as existing docs?
- [ ] **Links valid:** Do all internal links resolve? Are external links still live?

````

- [ ] **Step 2: Verify the section placement and content**

Read the file and confirm the Change-Type Detection section appears after Context Assembly and before Process.

- [ ] **Step 3: Commit**

```bash
git add agents/skills/claude-code/harness-code-review/SKILL.md
git commit -m "feat(review): add change-type detection with per-type review checklists (A4)"
````

---

## Chunk 5: Pre-Commit Review Hook Skill (A5)

### Task 5a: Create skill.yaml

**Files:**

- Create: `agents/skills/claude-code/harness-pre-commit-review/skill.yaml`

- [ ] **Step 1: Create the skill directory and skill.yaml**

Create `agents/skills/claude-code/harness-pre-commit-review/skill.yaml`:

```yaml
name: harness-pre-commit-review
version: '1.0.0'
description: Lightweight pre-commit quality gate combining mechanical checks and AI review
triggers: [manual, on_commit]
platforms: [claude-code, gemini-cli]
tools: [Bash, Read, Glob, Grep]
cli:
  command: harness skill run harness-pre-commit-review
  args:
    - name: path
      description: Project root path
      required: false
mcp:
  tool: run_skill
  input:
    skill: harness-pre-commit-review
    path: string
type: rigid
phases:
  - name: mechanical-checks
    description: Run deterministic checks (lint, typecheck, tests)
    required: true
  - name: classify-changes
    description: Determine if AI review is needed based on change type
    required: true
  - name: ai-review
    description: Lightweight AI review of staged changes (skipped for docs/config-only)
    required: false
state:
  persistent: false
  files: []
depends_on:
  - harness-code-review
```

- [ ] **Step 2: Commit skill.yaml**

```bash
git add agents/skills/claude-code/harness-pre-commit-review/skill.yaml
git commit -m "feat(skills): create harness-pre-commit-review skill.yaml (A5)"
```

### Task 5b: Create SKILL.md

**Files:**

- Create: `agents/skills/claude-code/harness-pre-commit-review/SKILL.md`

- [ ] **Step 3: Create the SKILL.md**

Create `agents/skills/claude-code/harness-pre-commit-review/SKILL.md`:

````markdown
# Harness Pre-Commit Review

> Lightweight pre-commit quality gate — mechanical checks first, AI review second. Fast feedback before code leaves your machine.

## When to Use

- Before committing code (manual invocation or git pre-commit hook)
- As a quick sanity check before pushing to a branch
- When you want fast feedback without a full code review cycle
- NOT as a replacement for full peer review (use `harness-code-review` for that)
- NOT for commits that only update documentation or configuration (fast path skips AI review)

## Principle: Deterministic First

This skill follows the Deterministic-vs-LLM Responsibility Split principle. Mechanical checks run first and must pass before any AI review occurs. If a linter or type checker can catch the problem, the LLM should not be the one finding it.

## Process

### Phase 1: Mechanical Checks

Run all deterministic checks against staged changes. These are binary pass/fail — no judgment required.

#### 1. Detect Available Check Commands

```bash
# Check for project-specific commands
cat package.json 2>/dev/null | grep -E '"(lint|typecheck|test)"'
cat Makefile 2>/dev/null | grep -E '^(lint|typecheck|test):'
```
````

#### 2. Run Checks in Order

Run whichever of these are available in the project:

```bash
# Lint (fastest — run first)
pnpm lint 2>&1 || npm run lint 2>&1 || make lint 2>&1

# Type check
pnpm typecheck 2>&1 || npx tsc --noEmit 2>&1 || make typecheck 2>&1

# Tests (slowest — run last)
pnpm test 2>&1 || npm test 2>&1 || make test 2>&1
```

#### 3. Gate Decision

- **Any check fails:** STOP. Report the failure. Do not proceed to AI review. The author must fix mechanical issues first.
- **All checks pass:** Proceed to Phase 2.

**Output format for failures:**

```
Pre-Commit Check: FAIL

Mechanical Checks:
- Lint: FAIL — 3 errors (see output above)
- Types: PASS
- Tests: NOT RUN (blocked by lint failure)

Action: Fix lint errors before committing.
```

### Phase 2: Classify Changes

Determine whether AI review is needed based on what changed.

```bash
# Get list of staged files
git diff --cached --name-only

# Check if only docs/config files changed
git diff --cached --name-only | grep -v -E '\.(md|yml|yaml|json|toml|ini|cfg|conf|env|env\..*)$' | wc -l
```

#### Fast Path: Skip AI Review

If ALL staged files match these patterns, skip AI review and approve:

- `*.md` (documentation)
- `*.yml`, `*.yaml` (configuration)
- `*.json` (configuration — unless in `src/`)
- `*.toml`, `*.ini`, `*.cfg` (configuration)
- `.env*` (environment — but warn about secrets)
- `LICENSE`, `CODEOWNERS`, `.gitignore`

**Output for fast path:**

```
Pre-Commit Check: PASS (fast path)

Mechanical Checks:
- Lint: PASS
- Types: PASS
- Tests: PASS (12/12)

AI Review: SKIPPED (docs/config only)
```

#### Standard Path: Proceed to AI Review

If any staged file contains code changes, proceed to Phase 3.

### Phase 3: AI Review (Lightweight)

Perform a focused, lightweight review of staged changes. This is NOT a full code review — it catches obvious issues only.

#### 1. Get the Staged Diff

```bash
git diff --cached
```

#### 2. Quick Review Checklist

Review the staged diff for these high-signal issues only:

- **Obvious bugs:** null dereference, infinite loops, off-by-one errors, resource leaks
- **Security issues:** hardcoded secrets, SQL injection, path traversal, unvalidated input
- **Broken imports:** references to files/modules that do not exist
- **Debug artifacts:** console.log, debugger statements, TODO/FIXME without issue reference
- **Type mismatches:** function called with wrong argument types (if visible in diff)

Do NOT review for:

- Style (that is the linter's job)
- Architecture (that is the full review's job)
- Test completeness (that is the full review's job)
- Naming preferences (subjective and noisy at this stage)

#### 3. Report

**If no issues found:**

```
Pre-Commit Check: PASS

Mechanical Checks:
- Lint: PASS
- Types: PASS
- Tests: PASS (12/12)

AI Review: PASS (no issues found)
```

**If issues found:**

```
Pre-Commit Check: WARN

Mechanical Checks:
- Lint: PASS
- Types: PASS
- Tests: PASS (12/12)

AI Review: 2 observations
1. [file:line] Possible null dereference — `user.email` accessed without null check after `findUser()` which can return null.
2. [file:line] Debug artifact — `console.log('debug:', payload)` appears to be left from debugging.

Action: Review observations above. Commit anyway if intentional, or fix first.
```

## Git Hook Installation

To use as an automatic pre-commit hook, add to `.git/hooks/pre-commit` or configure via your git hooks manager (husky, lefthook, etc.):

```bash
#!/bin/bash
# .git/hooks/pre-commit
harness skill run harness-pre-commit-review
exit_code=$?
if [ $exit_code -ne 0 ]; then
  echo "Pre-commit review failed. Fix issues before committing."
  exit 1
fi
```

**Note:** AI review observations (WARN) do not block the commit — only mechanical check failures (FAIL) block. The author decides whether to address AI observations.

## Escalation

- **Mechanical checks fail:** Fix the issues. Do not bypass the hook.
- **AI review finds a potential issue you disagree with:** Commit anyway — AI review observations are advisory, not blocking. If the observation is consistently wrong, add it to `.harness/review-learnings.md` under Noise / False Positives.
- **Hook is too slow:** If the full test suite is slow, configure the project to run only affected tests in pre-commit. The full suite runs in CI.

````

- [ ] **Step 4: Verify both files exist and are well-formed**

Read both `skill.yaml` and `SKILL.md` in the new directory.

- [ ] **Step 5: Commit SKILL.md**

```bash
git add agents/skills/claude-code/harness-pre-commit-review/SKILL.md
git commit -m "feat(skills): create harness-pre-commit-review SKILL.md with full process (A5)"
````

---

## Chunk 6: Unified Integrity Gate — Stub (A6)

### Task 6a: Create skill.yaml

**Files:**

- Create: `agents/skills/claude-code/harness-integrity/skill.yaml`

- [ ] **Step 1: Create the skill directory and skill.yaml**

Create `agents/skills/claude-code/harness-integrity/skill.yaml`:

```yaml
name: harness-integrity
version: '0.1.0'
description: 'Unified integrity gate — chains test, lint, typecheck, and AI review into a single pass/fail report (STUB: awaiting harness-verify from Group E)'
triggers: [manual]
platforms: [claude-code, gemini-cli]
tools: [Bash, Read, Glob, Grep]
cli:
  command: harness skill run harness-integrity
  args:
    - name: path
      description: Project root path
      required: false
mcp:
  tool: run_skill
  input:
    skill: harness-integrity
    path: string
type: rigid
phases:
  - name: verify
    description: Run mechanical verification (delegated to harness-verify)
    required: true
  - name: review
    description: Run change-type-aware AI review (delegated to harness-code-review)
    required: true
  - name: report
    description: Produce unified integrity report
    required: true
state:
  persistent: false
  files: []
depends_on:
  - harness-code-review
  # - harness-verify  # Uncomment when Group E delivers E1
```

- [ ] **Step 2: Commit skill.yaml**

```bash
git add agents/skills/claude-code/harness-integrity/skill.yaml
git commit -m "feat(skills): create harness-integrity skill.yaml stub (A6)"
```

### Task 6b: Create SKILL.md stub

**Files:**

- Create: `agents/skills/claude-code/harness-integrity/SKILL.md`

- [ ] **Step 3: Create the SKILL.md skeleton**

Create `agents/skills/claude-code/harness-integrity/SKILL.md`:

```markdown
# Harness Integrity Gate

> Unified integrity gate — single invocation runs the full quality pipeline and produces a consolidated pass/fail report.

**Status:** STUB — Full implementation requires `harness-verify` skill from Group E (E1). This skeleton defines the intended interface and report format. The full process will be implemented after Group E delivers E1.

## When to Use

- As a final check before merging a PR
- As a CI gate that combines all quality signals
- When you want a single pass/fail answer for "is this code ready?"
- NOT for in-progress work (use `harness-pre-commit-review` for quick checks)

## Intended Pipeline

When fully implemented, this skill will chain the following in order:

1. **Test execution** — run project test suite (via `harness-verify`)
2. **Lint** — run project linter (via `harness-verify`)
3. **Type check** — run type checker (via `harness-verify`)
4. **AI review** — run change-type-aware review (via `harness-code-review` with A4 checklists)
5. **Unified report** — aggregate all results into a single report

## Intended Report Format
```

Integrity Check: [PASS/FAIL]

- Tests: [PASS/FAIL] ([count] passed, [count] failed)
- Lint: [PASS/FAIL] ([count] warnings, [count] errors)
- Types: [PASS/FAIL]
- Review: [count] suggestions ([count] blocking)

Overall: [PASS if all pass and 0 blocking review items, FAIL otherwise]

```

## Dependencies

- `harness-verify` (Group E, E1) — provides mechanical verification (tests, lint, typecheck). **Not yet available.**
- `harness-code-review` (Group A, A1-A4) — provides change-type-aware AI review. **Available after A4.**

## Implementation Notes

When implementing the full skill after E1 is delivered:

1. Invoke `harness-verify` first. If it fails, still run AI review but mark the integrity check as FAIL.
2. Invoke `harness-code-review` with the detected change type.
3. Aggregate results: any mechanical failure or any blocking review finding means FAIL.
4. Write the unified report to stdout and optionally to `.harness/integrity-report.md`.
5. Exit with code 0 (PASS) or 1 (FAIL) for CI integration.
```

- [ ] **Step 4: Verify both files exist**

Read both `skill.yaml` and `SKILL.md` in the new directory.

- [ ] **Step 5: Commit SKILL.md stub**

```bash
git add agents/skills/claude-code/harness-integrity/SKILL.md
git commit -m "feat(skills): create harness-integrity SKILL.md stub — awaiting Group E (A6)"
```

---

## Chunk 7: Final Verification

- [ ] **Step 1: Verify harness-code-review SKILL.md structure**

Read `agents/skills/claude-code/harness-code-review/SKILL.md` end-to-end. Confirm the section order is:

1. `# Harness Code Review` (title + description)
2. `## When to Use`
3. `## Context Assembly` (new — A1)
   - `### 1:1 Context Ratio Rule`
   - `### Context Gathering Priority Order`
   - `### Context Assembly Commands`
   - `### Commit History Context` (A2)
   - `### Review Learnings Calibration` (A3)
4. `## Change-Type Detection` (new — A4)
   - `### Detection Method`
   - `### Per-Type Review Checklists`
5. `## Process` (original, unchanged)
6. Everything else (original, unchanged)

- [ ] **Step 2: Verify new skill directories**

```bash
ls -la agents/skills/claude-code/harness-pre-commit-review/
ls -la agents/skills/claude-code/harness-integrity/
```

Confirm each directory contains `skill.yaml` and `SKILL.md`.

- [ ] **Step 3: Verify implementation.md has the new convention**

Read `docs/standard/implementation.md` and confirm the `.harness/review-learnings.md` convention is present.

- [ ] **Step 4: Final commit log check**

```bash
git log --oneline -7
```

Confirm 7 commits from this plan, in order:

1. A1 — Context Assembly with 1:1 ratio
2. A2 — Commit history context
3. A3 — Review learnings convention in implementation.md
4. A3 — Review learnings integration in SKILL.md
5. A4 — Change-type detection with checklists
6. A5 — Pre-commit review skill (skill.yaml + SKILL.md)
7. A6 — Integrity gate stub (skill.yaml + SKILL.md)
