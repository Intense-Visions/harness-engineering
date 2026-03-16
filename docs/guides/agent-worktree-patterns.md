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
