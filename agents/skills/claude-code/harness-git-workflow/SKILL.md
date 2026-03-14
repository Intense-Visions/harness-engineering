# Harness Git Workflow

> Worktree setup, dependency installation, baseline verification, and branch finishing. Clean isolation for every workstream.

## When to Use
- When starting work that should be isolated from the main branch (new feature, experiment, multi-task plan)
- When finishing a branch and deciding how to land it (merge, PR, keep, discard)
- When `on_pr` or `on_commit` triggers fire and worktree management is needed
- When the human asks to "set up a branch" or "start a new workstream"
- NOT for simple single-file changes that do not need branch isolation
- NOT when work is already in progress on the correct branch

## Process

### Part A: Worktree Creation

#### Step 1: Choose Worktree Location

1. **Check for `.worktrees/` directory** in the project root. If it exists, use it — this is the preferred location.

2. **Check CLAUDE.md or AGENTS.md** for worktree preferences. Some projects specify a custom worktree directory or naming convention. Follow those instructions.

3. **If neither exists, ask the user:** "Where should I create the worktree? Options: (A) `.worktrees/<branch-name>` in the project root, (B) a sibling directory alongside the project, (C) a custom path."

4. **If placing worktrees in the project directory,** verify that the worktree directory is gitignored. Check `.gitignore` for `.worktrees/` or the chosen directory name. If not gitignored, add it before creating the worktree.

#### Step 2: Check for Existing Worktrees

1. **Run `git worktree list`** to see active worktrees.

2. **If a worktree already exists for the target branch,** do not create a duplicate. Ask: "A worktree for branch `<name>` already exists at `<path>`. Should I use it, or create a new branch?"

3. **If the target directory already exists** (but is not a worktree), do not overwrite. Ask the user how to proceed.

#### Step 3: Create Branch and Worktree

1. **Create the branch** from the current HEAD (or from the specified base):
   ```
   git branch <branch-name> <base>
   ```

2. **Create the worktree:**
   ```
   git worktree add <path> <branch-name>
   ```

3. **Verify the worktree was created.** Check that the directory exists and contains a `.git` file (not a `.git` directory — worktrees use a file pointing to the main repo).

#### Step 4: Auto-Detect and Run Setup

Inspect the worktree for project files and run the appropriate setup:

| File Found | Action |
|---|---|
| `package.json` | `npm install` (or `yarn install` / `pnpm install` if lockfile indicates) |
| `Cargo.toml` | `cargo build` |
| `go.mod` | `go mod download` |
| `requirements.txt` | `pip install -r requirements.txt` |
| `pyproject.toml` | `pip install -e .` or `poetry install` |
| `Gemfile` | `bundle install` |
| `Makefile` (with `install` target) | `make install` |

If multiple project files exist (monorepo), install at the root level. Do not guess which subpackages to install — follow the project's documented setup or ask.

#### Step 5: Verify Clean Baseline

Before any work begins, verify the worktree is in a clean, working state:

1. **Run the test suite.** All tests must pass on the fresh branch before any changes.

2. **Run `harness validate`.** Project health must be green before starting work.

3. **If tests fail or validation fails on the fresh branch,** stop. The base branch has issues. Report: "Baseline verification failed on fresh branch: [failure details]. The base branch needs to be fixed first."

4. **Record the baseline.** Note the test count and validation result. This is the comparison point for the branch finishing phase.

---

### Part B: Branch Finishing

When work on the branch is complete, follow this protocol to land the changes.

#### Step 1: Pre-Finish Verification

1. **Run the full test suite.** All tests must pass.

2. **Run `harness validate`.** Project health must be green.

3. **Check for uncommitted changes.** Run `git status`. All changes must be committed. If there are uncommitted changes, commit or stash them before finishing.

4. **Check the branch is up to date.** If the base branch has advanced since the worktree was created:
   ```
   git fetch origin
   git log HEAD..origin/main --oneline
   ```
   If there are new commits on the base, rebase or merge before finishing:
   ```
   git rebase origin/main
   ```
   Re-run tests after rebasing.

#### Step 2: Choose Finishing Strategy

Present 4 options to the user:

1. **Merge locally.** Merge the branch into the base branch on the local machine.
   - Best for: small changes, solo work, when CI is not required
   - Command: `git checkout main && git merge <branch>`

2. **Push and create PR.** Push the branch to the remote and open a pull request.
   - Best for: team work, changes that need review, when CI must pass
   - Command: `git push -u origin <branch>` then create PR via `gh pr create`

3. **Keep as-is.** Leave the branch and worktree in place for continued work later.
   - Best for: work-in-progress, experiments, paused projects

4. **Discard.** Delete the branch and worktree. All changes are lost.
   - Best for: failed experiments, abandoned approaches
   - Safety: Confirm with the user before discarding. List the commits that will be lost.

#### Step 3: Execute Chosen Strategy

**If merge locally:**
```bash
cd <main-repo-path>
git merge <branch-name>
# Run tests on main after merge
# Run harness validate after merge
git worktree remove <worktree-path>
git branch -d <branch-name>
```

**If push and create PR:**
```bash
cd <worktree-path>
git push -u origin <branch-name>
gh pr create --title "<title>" --body "<description>"
# Report the PR URL to the user
# Leave worktree in place until PR is merged
```

**If keep as-is:**
```
No action needed. Report the worktree path and branch name for future reference.
```

**If discard:**
```bash
# Confirm with user first — list commits that will be lost
git worktree remove <worktree-path>
git branch -D <branch-name>
```

#### Step 4: Clean Up

1. **Remove the worktree** (unless keeping as-is or waiting for PR merge):
   ```
   git worktree remove <worktree-path>
   ```

2. **Prune stale worktree references:**
   ```
   git worktree prune
   ```

3. **Verify cleanup.** Run `git worktree list` and confirm the removed worktree is no longer listed.

## Harness Integration

- **`harness validate`** — Run during baseline verification (Step 5 of Part A) and pre-finish verification (Step 1 of Part B). Ensures project health is green at both boundaries.
- **Test runner** — Run fresh in the worktree, not in the main repo. Tests must pass both at baseline (before work) and at finish (after work).
- **`.gitignore`** — Verify worktree directory is gitignored if it lives inside the project tree.

## Success Criteria

- Worktree was created in the correct location (`.worktrees/` preferred, or per project convention)
- Dependencies were auto-detected and installed
- Baseline verification passed (tests green, harness validates) before any work began
- Branch finishing strategy was chosen by the user (not assumed)
- Chosen strategy was executed correctly (merge, PR, keep, or discard)
- Worktree was cleaned up after finishing (unless keeping for continued work)
- No stale worktree references remain after cleanup

## Examples

### Example: Setting Up a Worktree for a New Feature

```bash
# Check for preferred location
ls .worktrees/    # exists — use it

# Check gitignore
grep '.worktrees' .gitignore    # found — good, already gitignored

# Check existing worktrees
git worktree list
# /Users/dev/project  abc1234 [main]
# No existing worktree for this feature

# Create branch and worktree
git branch feat/notifications main
git worktree add .worktrees/notifications feat/notifications

# Auto-detect setup (found package.json)
cd .worktrees/notifications && npm install

# Verify baseline
npm test                # 142 tests, all pass
harness validate        # passes

# Ready to work. Report:
# "Worktree created at .worktrees/notifications on branch feat/notifications.
#  142 tests passing. harness validate green. Ready to start."
```

### Example: Finishing a Branch with PR

```bash
# Pre-finish verification
cd .worktrees/notifications
npm test                # 158 tests, all pass (16 new)
harness validate        # passes
git status              # clean — all committed

# Check if base has advanced
git fetch origin
git log HEAD..origin/main --oneline
# 3 new commits on main — rebase

git rebase origin/main
npm test                # still passes after rebase

# User chooses: Push and create PR
git push -u origin feat/notifications
gh pr create --title "feat(notifications): email and in-app notifications" \
  --body "Implements notification service with create, list, and expiry.
  16 new tests. All passing."

# Report: "PR created: https://github.com/org/repo/pull/42
#  Worktree at .worktrees/notifications kept until PR merges."
```

### Example: Discarding a Failed Experiment

```bash
# User says: "That approach didn't work, let's scrap it."

# Show what will be lost
git log main..HEAD --oneline
# a1b2c3d try websocket approach
# d4e5f6g add socket.io dependency
# "These 2 commits will be lost. Discard? (yes/no)"
# Human: "yes"

git worktree remove .worktrees/ws-experiment
git branch -D feat/ws-experiment
git worktree prune
git worktree list    # ws-experiment no longer listed
```
