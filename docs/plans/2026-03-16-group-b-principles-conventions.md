# Group B: Principles & Conventions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish foundational principles and conventions that all subsequent groups (A, E, C, D) build on. Add the 7th principle (Deterministic-vs-LLM Split), define the checkpoint handoff schema, define the anti-pattern log convention, and create branchless worktree guidance.

**Architecture:** All four items are documentation-only changes. No code, no tests. Three items modify existing files; one creates a new guide.

**Tech Stack:** Markdown

**Spec:** `docs/specs/2026-03-16-research-roadmap-design.md` (Group B section)

---

## Chunk 1: B1 — Formalize Deterministic-vs-LLM Split as 7th Principle

### Task 1: Add Principle 7 to principles.md

**Files:**
- Modify: `docs/standard/principles.md`

- [ ] **Step 1: Insert Principle 7 before the Summary section**

In `docs/standard/principles.md`, insert the following content between the `---` that ends Principle 6 (after line 1089, the `---` following the KPIs section) and the `## Summary` heading (line 1091):

```markdown
## 7. Deterministic-vs-LLM Responsibility Split

### What It Is

**The Deterministic-vs-LLM Split** is a decision framework for choosing whether an operation should be handled by mechanical tooling (linters, scripts, type checkers) or by LLM judgment. The core rule is simple:

> **If an operation can be expressed as if-else logic, it MUST be enforced mechanically — not delegated to LLM judgment.**

This principle extends [Principle 2 (Architectural Rigidity)](#2-architectural-rigidity--mechanical-constraints) from *what to enforce* to *how to decide what to enforce*. Principle 2 says "use mechanical constraints." This principle says "here is the line between what the machine handles and what the LLM handles."

### Why It Matters

LLMs are probabilistic. Given the same input twice, they may produce different outputs. This is a strength for creative tasks (code generation, architectural reasoning) but a liability for deterministic tasks (formatting, import ordering, naming validation).

Without a clear split:

- LLMs waste tokens re-checking formatting that a linter handles in milliseconds
- Teams argue about whether a rule "should be a linter rule" or "agent guidance"
- Agents hallucinate compliance — they claim they followed a convention without mechanical verification
- Quality depends on prompt engineering rather than toolchain engineering

With a clear split:

- Deterministic checks run first, fast, and reliably — every time
- LLM effort focuses on tasks that genuinely require reasoning
- Agent output quality is mechanically verified, not self-reported
- Teams have a simple heuristic for where to invest enforcement effort

### Key Concepts

#### The Responsibility Matrix

| Responsibility | Owner | Examples |
|---------------|-------|----------|
| Intent understanding | LLM | "What does the user want to build?" |
| Architectural reasoning | LLM | "Should this be a service or a utility?" |
| Code generation | LLM | Writing implementation code |
| Debugging decisions | LLM | "What's causing this failure?" |
| Ambiguous trade-offs | LLM | "Should we optimize for speed or readability?" |
| Formatting | Mechanical | Prettier, Black, gofmt |
| Import ordering | Mechanical | ESLint import-order rules |
| Naming conventions | Mechanical | Linter rules for file/variable naming |
| File structure validation | Mechanical | Structural tests, directory layout checks |
| Test execution | Mechanical | Test runners, CI pipelines |
| Type checking | Mechanical | TypeScript compiler, mypy, rustc |
| Dependency direction | Mechanical | Custom linter rules (see Principle 2) |

#### The Decision Heuristic

When adding a new rule or convention, apply this test:

1. **Can you write it as an if-else statement?** → Mechanical enforcement
2. **Does it require understanding context or intent?** → LLM judgment
3. **Is it ambiguous or situation-dependent?** → LLM judgment with documented guidelines
4. **Does the same input always produce the same correct output?** → Mechanical enforcement

Examples of applying the heuristic:

- "Functions must be under 50 lines" → if-else → **Mechanical** (linter rule)
- "Functions should have a single responsibility" → requires judgment → **LLM** (review guidance)
- "Imports must be sorted alphabetically" → if-else → **Mechanical** (auto-formatter)
- "This abstraction is at the wrong level" → requires reasoning → **LLM** (architectural review)

#### Deterministic-First Execution

When a skill or workflow produces code, it should follow this sequence:

```
1. LLM generates code (creative phase)
2. Mechanical checks run (deterministic phase)
   - Format (prettier, black)
   - Lint (eslint, ruff)
   - Type-check (tsc, mypy)
   - Test (vitest, pytest)
3. If mechanical checks fail → LLM fixes (targeted creative phase)
4. Repeat until mechanical checks pass
5. LLM self-review (creative phase — only after deterministic checks pass)
```

This sequence ensures LLM effort is never spent on issues that mechanical tools catch faster and more reliably.

#### Skill Template: Deterministic Checks Section

Every skill that produces or modifies code should include a `## Deterministic Checks` section listing what the skill enforces mechanically before and after LLM invocation:

```markdown
## Deterministic Checks

### Pre-Execution
- [ ] Target files exist and are readable
- [ ] Required tools are available (e.g., `tsc`, `eslint`)

### Post-Execution
- [ ] Linter passes on all modified files
- [ ] Type checker passes
- [ ] Tests pass (existing + new)
- [ ] File naming conventions followed
- [ ] No unresolved merge conflicts
```

Skills that only read or analyze (e.g., review, planning) may have lighter deterministic checks (e.g., "target files exist"). Skills that write code must include the full post-execution checks.

### Examples

#### Example 1: Deciding Where to Enforce a New Rule

Scenario: Team decides "all API endpoints must return a standard error envelope."

Apply the heuristic:

- Can you write it as if-else? → **Yes**: check if response type matches `{ error: { code, message } }` schema
- Same input → same output? → **Yes**: a response either matches the schema or it doesn't

Decision: **Mechanical enforcement**

```typescript
// Structural test: verify all endpoint handlers return ErrorEnvelope
const endpoints = findAllEndpoints('src/api/');
for (const endpoint of endpoints) {
  const returnType = getReturnType(endpoint);
  expect(returnType).toMatch(/ErrorEnvelope/);
}
```

Not: "Ask the LLM to check if error handling looks right."

#### Example 2: Deciding Where NOT to Mechanically Enforce

Scenario: Team wants to ensure "services use appropriate abstractions."

Apply the heuristic:

- Can you write it as if-else? → **No**: "appropriate" depends on domain context
- Same input → same output? → **No**: what's appropriate varies by situation

Decision: **LLM judgment** (documented as review guidance)

```markdown
## Review Guidance: Abstraction Quality

When reviewing service code, consider:
- Does each service have a single domain concept?
- Are there signs of a god object (>5 public methods)?
- Could any method be extracted to a shared utility?

Flag for human review if uncertain.
```

#### Example 3: Mixed Responsibility

Scenario: Code review for a new feature.

- **Mechanical** (run first): lint, typecheck, test execution, import ordering, naming conventions
- **LLM** (run after mechanical passes): logic correctness, edge case coverage, architectural fit, documentation quality

The LLM reviewer never comments on formatting or import order — those are already verified mechanically. It focuses on what only reasoning can evaluate.

### Connection to Other Principles

- **Principle 2 (Architectural Rigidity)**: Defines the constraints. This principle defines which constraints are mechanical vs. guidance.
- **Principle 3 (Agent Feedback Loop)**: The feedback loop should run deterministic checks first, then LLM review — never the reverse.
- **Principle 4 (Entropy Management)**: Cleanup agents should prioritize mechanically detectable drift (schema mismatches, dead code) over judgment-dependent drift (abstraction quality).
- **Principle 6 (KPIs)**: Harness Coverage (% of rules enforced mechanically) directly measures how well teams apply this split.

### Implementation Checklist

- [ ] Audit existing conventions: which are deterministic? which require judgment?
- [ ] Convert all deterministic conventions to linter rules or structural tests
- [ ] Document remaining LLM-judgment conventions as review guidance
- [ ] Add `## Deterministic Checks` section to all code-producing skills
- [ ] Ensure skill execution follows deterministic-first sequence
- [ ] Measure: track the ratio of mechanical rules to total rules (Harness Coverage KPI)
```

- [ ] **Step 2: Update the Summary section to include Principle 7**

In `docs/standard/principles.md`, replace the existing Summary section with:

```markdown
## Summary

These seven principles work together to create a system where:

1. **Context Engineering** ensures agents have the information they need
2. **Mechanical Constraints** prevent bad decisions automatically
3. **Agent Feedback Loop** lets agents self-correct before human review
4. **Entropy Management** keeps technical debt bounded
5. **Depth-First Implementation** builds clear examples and patterns
6. **KPIs** measure progress toward agent autonomy
7. **Deterministic-vs-LLM Split** draws a clear line between what machines enforce and what LLMs reason about

Adopt them progressively:

- **Level 1**: Context Engineering + Documentation
- **Level 2**: Add Mechanical Constraints + Linters + Deterministic-vs-LLM Split
- **Level 3**: Add Agent Feedback Loop + Entropy Management

[← Back to Overview](./index.md) | [Implementation Guide →](./implementation.md) | [KPIs & Metrics →](./kpis.md)
```

- [ ] **Step 3: Update the document title**

In `docs/standard/principles.md`, change the title from:

```markdown
# The Six Core Principles of Harness Engineering
```

to:

```markdown
# The Seven Core Principles of Harness Engineering
```

- [ ] **Step 4: Update the last-updated date**

In `docs/standard/principles.md`, change:

```markdown
_Last Updated: 2026-03-11_
```

to:

```markdown
_Last Updated: 2026-03-16_
```

- [ ] **Step 5: Commit B1 principles.md changes**

```bash
git add docs/standard/principles.md
git commit -m "docs(principles): add Principle 7 — Deterministic-vs-LLM Responsibility Split"
```

### Task 2: Update index.md to reference Principle 7

**Files:**
- Modify: `docs/standard/index.md`

- [ ] **Step 6: Add Principle 7 summary to index.md**

In `docs/standard/index.md`, after the `### 6. Key Performance Indicators` section (ending with the `---` before `## How to Get Started`), insert:

```markdown
### 7. Deterministic-vs-LLM Responsibility Split

**Clear Boundaries**: If an operation can be expressed as if-else logic, it must be enforced mechanically — not delegated to LLM judgment.

LLMs handle intent understanding, architectural reasoning, code generation, and ambiguous trade-offs. Mechanical tooling handles formatting, import ordering, naming conventions, file structure validation, test execution, and type checking.

**Key aspects**:

- Decision heuristic: can you write it as if-else? → mechanical
- Deterministic-first execution sequence in all skills
- Extends Principle 2 from "what to enforce" to "how to decide what to enforce"

[Read more about the Deterministic-vs-LLM Split →](./principles.md#7-deterministic-vs-llm-responsibility-split)

---
```

- [ ] **Step 7: Update principle references in index.md**

In `docs/standard/index.md`, update all references from "Six" to "Seven":

- Change `## The Six Core Principles` to `## The Seven Core Principles`
- In the "The Solution" list, add item 7: `7. **Deterministic-vs-LLM split** - If it can be if-else logic, enforce it mechanically`

- [ ] **Step 8: Update the numbered items in "The Solution" section**

In `docs/standard/index.md`, in the `### The Solution` section, add after item 6:

```markdown
7. **Deterministic-vs-LLM split** - If it can be expressed as if-else logic, enforce it mechanically, not via LLM judgment
```

- [ ] **Step 9: Update last-updated date in index.md**

Change `_Last Updated: 2026-03-11_` to `_Last Updated: 2026-03-16_`.

- [ ] **Step 10: Commit index.md changes**

```bash
git add docs/standard/index.md
git commit -m "docs(standard): update index.md to reference 7th principle"
```

---

## Chunk 2: B2 — Checkpoint-Based Context Handoff Schema

### Task 3: Add handoff schema convention to implementation.md

**Files:**
- Modify: `docs/standard/implementation.md`

- [ ] **Step 11: Insert Conventions & Standards section before Measuring Success**

In `docs/standard/implementation.md`, insert the following content immediately before the `## Measuring Success` heading (which is at line 1022):

```markdown
## Conventions & Standards

These conventions are referenced by skills and workflows. They are not mechanically enforced yet — they are documented standards that agents follow by convention. Future workflow gates (see the research roadmap) may add mechanical enforcement.

### Checkpoint-Based Context Handoff

**Convention:** At phase boundaries (between skills, between milestones, between agent sessions), write a structured handoff document to `.harness/handoff.md`.

**Purpose:** When one skill/phase completes and another begins, context is lost. The handoff file preserves what was done, what was discovered, what's blocked, and what should happen next. Subsequent skills read this file as input context.

**Schema:**

```markdown
# Handoff: [phase/skill name]

## Completed
- [what was done, with file paths]
- Example: Created `src/services/auth.ts` with JWT validation logic
- Example: Updated `docs/guides/authentication.md` with new flow diagram

## Discovered
- [unexpected findings, edge cases, dependencies found]
- Example: The existing UserService has a circular dependency with AuthService
- Example: Rate limiting is not implemented on the /login endpoint

## Blocked
- [what couldn't be completed and why]
- Example: Cannot add Redis caching — redis client package not in dependencies
- Example: Integration test requires database seed data that doesn't exist yet

## Test Results
- [pass/fail summary with command output]
- Example: 14/14 unit tests passing
- Example: 2/3 integration tests passing — `test-login-rate-limit` skipped (see Blocked)

## Next Steps
- [what the next skill/phase should do]
- Example: Run `harness-code-review` on the auth service changes
- Example: Address the circular dependency before adding caching
```

**When to write a handoff:**

- After completing a skill invocation that produces artifacts (code, docs, config)
- After a long-running agent session that spans multiple tasks
- When pausing work that another agent or session will resume
- After debugging sessions that discovered unexpected state

**How skills use it:**

- Skills that produce output **write** `.harness/handoff.md` as their final step
- Skills that consume context **read** `.harness/handoff.md` as their first step (if it exists)
- Each handoff overwrites the previous one — it captures the current state, not history
- For historical context, the anti-pattern log (below) and git history serve as the record

```

- [ ] **Step 12: Commit handoff schema addition**

```bash
git add docs/standard/implementation.md
git commit -m "docs(implementation): add checkpoint-based context handoff schema convention"
```

---

## Chunk 3: B3 — Anti-Pattern Log Convention

### Task 4: Add anti-pattern log convention to implementation.md

**Files:**
- Modify: `docs/standard/implementation.md`

- [ ] **Step 13: Insert anti-pattern log convention after the handoff schema section**

In `docs/standard/implementation.md`, immediately after the handoff schema section added in Step 11 (and still before `## Measuring Success`), insert:

```markdown
### Anti-Pattern Log

**Convention:** Maintain an append-only log at `.harness/anti-patterns.md` that records failed approaches, dead ends, and lessons learned during agent work.

**Purpose:** Agents exploring solutions (debugging, refactoring, architectural decisions) often try approaches that fail. Without a record, the same dead-end gets explored repeatedly — across sessions, across agents, across team members. The anti-pattern log prevents this waste.

**Schema:**

```markdown
## [YYYY-MM-DD] [skill name]: [brief description]

**Tried:** [what was attempted]
**Failed because:** [why it didn't work]
**What worked instead:** [the successful approach]
```

**Example entries:**

```markdown
## 2026-03-15 harness-debugging: Fix circular dependency in auth module

**Tried:** Moved shared types into a `common/` directory and re-exported from both services.
**Failed because:** The re-export created an implicit dependency cycle that TypeScript caught at compile time — `common/` imported a type that transitively depended on `auth/`.
**What worked instead:** Extracted the shared interface into `src/types/auth-types.ts` (Types layer) with zero upward dependencies. Both services import from the Types layer, following the dependency model.

## 2026-03-14 harness-execution: Add Redis caching to user service

**Tried:** Used `ioredis` with default connection pooling.
**Failed because:** The test environment doesn't have Redis running, and the `ioredis` mock library doesn't support the `pipeline()` method we needed.
**What worked instead:** Created a `CachePort` interface in the Repository layer and a `RedisCacheAdapter` that implements it. Tests use an `InMemoryCacheAdapter`. The adapter pattern lets us swap implementations without changing service code.
```

**Rules:**

- **Append-only**: Never delete entries. The history is the value.
- **Skills read at start**: Before exploring a solution, check if a similar approach was already tried and failed.
- **Skills append at end**: After recovering from a failed approach, record what happened.
- **Keep entries brief**: 3-5 sentences per entry. Link to relevant files instead of pasting code.
- **Date and skill name are required**: These make it searchable and attributable.

**What belongs in the anti-pattern log:**

- Failed debugging approaches
- Architectural dead ends
- Library/tool incompatibilities discovered
- Configuration mistakes and their fixes
- Performance optimizations that didn't work

**What does NOT belong:**

- Successful approaches (those go in handoff docs and git history)
- General best practices (those go in `docs/guides/best-practices.md`)
- Opinions or preferences (those go in ADRs)

```

- [ ] **Step 14: Update last-updated date in implementation.md**

Change `_Last Updated: 2026-03-11_` to `_Last Updated: 2026-03-16_`.

- [ ] **Step 15: Commit anti-pattern log addition**

```bash
git add docs/standard/implementation.md
git commit -m "docs(implementation): add anti-pattern log convention"
```

---

## Chunk 4: B4 — Branchless Worktree Guidance

### Task 5: Create agent-worktree-patterns.md

**Files:**
- Create: `docs/guides/agent-worktree-patterns.md`

- [ ] **Step 16: Create the worktree patterns guide**

Create `docs/guides/agent-worktree-patterns.md`:

```markdown
# Agent Worktree Patterns

This guide covers the recommended git workflow for agent-driven development: **worktree-per-milestone on a single branch**, with sequential commits and squash-merge to main.

---

## The Problem with Branch-per-Task

Traditional human workflows often use one branch per task or feature. This works when humans manage merge conflicts manually and have mental context about what each branch contains. For agent-driven work, branch-per-task creates problems that grow super-linearly with the number of tasks:

**Merge complexity explodes.** Each concurrent branch can conflict with every other branch. With N branches, you have up to N(N-1)/2 potential conflicts. Agents are poor at resolving merge conflicts because they lack the intent context that produced the conflicting changes.

**Conflict resolution code bloats the toolchain.** The GSD v2 framework (an agent orchestration system) initially used branch-per-task and accumulated 582+ lines of merge management code — rebasing, conflict detection, resolution strategies, retry logic. When they switched to a branchless model, all of that code was eliminated.

**Context fragmentation.** Each branch has a different view of the codebase. An agent working on branch-feature-B doesn't see the changes from branch-feature-A until merge. This means agents make decisions based on stale state.

**Review bottleneck.** Multiple branches queue up for review independently. Reviewers lose the sequential narrative of how the codebase evolved.

---

## The Recommended Pattern: Worktree-per-Milestone

### How It Works

1. **Create a single feature branch** for a milestone (a group of related tasks)
2. **Create a git worktree** for that branch — a separate checkout directory
3. **Commit sequentially** on that branch as tasks complete
4. **Squash-merge to main** when the milestone is done

```
main ─────────────────────────────●── (squash merge)
                                  │
feature/milestone-1 ──●──●──●──●─┘
                      │  │  │  │
                    task task task task
                     1    2   3   4
```

Each task gets its own commit (or commits), but they all land on the same branch in sequence. No concurrent branches means no merge conflicts between tasks.

### Why Worktrees?

A git worktree lets you have multiple checkouts of the same repository at different paths on disk, without cloning the repo multiple times. This is useful for agent workflows because:

- **Isolation**: The agent works in a separate directory without disturbing your main checkout
- **Speed**: No clone overhead — worktrees share the `.git` directory
- **Clean context**: Each worktree has its own working tree state, index, and HEAD

### Practical How-To

#### Creating a Worktree

```bash
# From your main repo checkout
cd /path/to/your-project

# Create a feature branch (if it doesn't exist)
git branch feature/milestone-1

# Create a worktree for that branch in a sibling directory
git worktree add ../your-project-milestone-1 feature/milestone-1
```

Now you have:
```
/path/to/your-project                  ← main checkout (your normal work)
/path/to/your-project-milestone-1      ← worktree (agent works here)
```

#### Working in the Worktree

```bash
# Agent operates in the worktree directory
cd /path/to/your-project-milestone-1

# Sequential commits as tasks complete
git add -A && git commit -m "feat: implement user authentication"
git add -A && git commit -m "feat: add rate limiting to auth endpoints"
git add -A && git commit -m "test: add integration tests for auth flow"
```

#### Completing the Milestone

```bash
# When all tasks are done, switch to main and squash-merge
cd /path/to/your-project
git checkout main
git merge --squash feature/milestone-1
git commit -m "feat: user authentication with rate limiting (#42)"

# Clean up the worktree
git worktree remove ../your-project-milestone-1
git branch -d feature/milestone-1
```

#### When to Squash-Merge vs. Regular Merge

- **Squash-merge** (recommended for most agent work): Collapses all task commits into a single commit on main. Keeps main history clean. Use when the individual task commits are implementation steps, not independently meaningful changes.
- **Regular merge** (for large milestones): Preserves the full commit history. Use when individual commits represent distinct, reviewable units of work that future readers would benefit from seeing.

---

## When to Use Worktrees

| Situation | Recommendation |
|-----------|----------------|
| Agent implementing a milestone (3-10 tasks) | Worktree on a feature branch |
| Agent doing a single small task | Direct commit on feature branch (no worktree needed) |
| Multiple agents working in parallel | One worktree per agent, each on its own branch, coordinate via handoff docs |
| Hotfix while milestone in progress | Worktree on main or hotfix branch |

---

## Anti-Pattern: Branch-per-Task

Do not create a separate branch for each individual task within a milestone:

```
# ANTI-PATTERN — do not do this
main
├── feature/task-1-auth-service
├── feature/task-2-rate-limiting
├── feature/task-3-integration-tests
└── feature/task-4-docs-update
```

Problems:
- Task 2 (rate limiting) needs the auth service from Task 1, but it's on a different branch
- Merging Task 1 before starting Task 2 creates a sequential bottleneck with branch management overhead
- If Task 3 tests discover a bug in Task 1, fixing it means cherry-picking or rebasing across branches
- The GSD v2 framework found that this pattern required 582+ lines of merge orchestration code — code that added no product value

Instead:

```
# RECOMMENDED — all tasks on one branch, sequential commits
main
└── feature/milestone-1
    ├── commit: "feat: implement auth service"
    ├── commit: "feat: add rate limiting"
    ├── commit: "test: integration tests for auth"
    └── commit: "docs: update auth guide"
```

---

## Parallel Agent Work

When multiple agents must work simultaneously on different milestones:

1. **Each agent gets its own branch and worktree** — no shared branches
2. **Milestones should be scoped to minimize overlap** — different directories, different services
3. **Use handoff docs** (`.harness/handoff.md`) to communicate between agents
4. **Merge milestones to main sequentially** — first-done merges first, second rebases onto updated main

This keeps the merge surface small: instead of N tasks creating N(N-1)/2 potential conflicts, you have M milestones (where M << N) with well-scoped boundaries.

---

## Connection to Harness Engineering Principles

- **Principle 2 (Mechanical Constraints)**: The single-branch model eliminates an entire class of mechanical problems (merge conflicts) rather than trying to solve them with tooling.
- **Principle 5 (Depth-First)**: Sequential commits on one branch mirror the depth-first approach — complete one task before starting the next.
- **Principle 7 (Deterministic-vs-LLM Split)**: Merge conflict resolution is a task that requires judgment (LLM territory). By eliminating conflicts through workflow design, we remove the need for LLM-driven merge resolution entirely.

---

_Last Updated: 2026-03-16_
```

- [ ] **Step 17: Commit worktree guide**

```bash
git add docs/guides/agent-worktree-patterns.md
git commit -m "docs(guides): add branchless worktree guidance for agent workflows"
```

### Task 6: Update guides index

**Files:**
- Modify: `docs/guides/index.md`

- [ ] **Step 18: Add worktree guide to the guides index**

In `docs/guides/index.md`, after the `### [Best Practices](./best-practices.md)` section (ending before `## How to Use These Guides`), insert:

```markdown
### [Agent Worktree Patterns](./agent-worktree-patterns.md)

Git workflow guidance for agent-driven development:

- Why branch-per-task is an anti-pattern for agent work
- The worktree-per-milestone pattern
- Practical how-to for creating and managing worktrees
- When to squash-merge vs. regular merge

**Best for:** Teams using agents to implement multi-task milestones
```

- [ ] **Step 19: Update last-updated date in index.md**

Change `_Last Updated: 2026-03-11_` to `_Last Updated: 2026-03-16_`.

- [ ] **Step 20: Commit guides index update**

```bash
git add docs/guides/index.md
git commit -m "docs(guides): add agent-worktree-patterns to guides index"
```

---

## Chunk 5: Final Verification

### Task 7: Cross-reference check

- [ ] **Step 21: Verify all file paths are correct**

Confirm these files exist and have been modified:
- `docs/standard/principles.md` — now has 7 principles
- `docs/standard/index.md` — references 7 principles
- `docs/standard/implementation.md` — has Conventions & Standards section with handoff schema and anti-pattern log
- `docs/guides/agent-worktree-patterns.md` — new file
- `docs/guides/index.md` — lists the new guide

- [ ] **Step 22: Verify internal links resolve**

Check that these cross-references in the new content point to existing anchors:
- `principles.md#2-architectural-rigidity--mechanical-constraints` (referenced in Principle 7)
- `./principles.md#7-deterministic-vs-llm-responsibility-split` (referenced in index.md)
- `docs/guides/best-practices.md` (referenced in anti-pattern log section)

- [ ] **Step 23: Final commit if any fixes needed**

If any corrections were needed in Steps 21-22:

```bash
git add -A
git commit -m "docs: fix cross-references in Group B documentation"
```
