# Harness Repo Hygiene

> Fleet-wide branch and worktree pruning. Sync first, classify every ref against PR state and containment, prove nothing unpushed will be lost, then prune — and report the resulting ref state, not a delete count.

## When to Use

- When a repo has accumulated dozens of local branches and worktrees and you want the dead ones gone
- When agent-driven work has left `worktree-agent-*` / `.claude/worktrees/*` debris behind
- When cross-worktree tool caching (turbo, nx, bazel) is contaminating a build or bisect and you need a single-tree checkout
- When a reviewer requires branches to be up to date and you are preparing a queue for review
- NOT for creating a worktree or finishing a single branch — that is `harness-git-workflow`
- NOT for deleting remote branches; this skill only prunes local refs and worktrees
- NOT as a pre-commit or CI step — this is an interactive maintenance sweep with human confirmation points

## Process

### Iron Law

**Never delete a ref you have not proven exists somewhere else.**

Every deletion in this skill is justified by evidence gathered in Phase 2 and verified in Phase 3 — a merged PR, containment in `main`, containment in an open PR branch, or an explicit human decision. A branch whose commits exist nowhere but this disk is not prunable, no matter how old or how oddly named. "Looks abandoned" is not evidence.

---

### Phase 1: SYNC — Refresh Before Reading Anything

Local refs are stale until proven otherwise. Every classification in Phase 2 is computed against these refs, so a stale fetch silently corrupts every downstream decision.

1. **Fetch and prune remote-tracking refs:**

   ```bash
   git fetch origin --prune --tags
   ```

2. **Land the working tree on the default branch and fast-forward it:**

   ```bash
   git checkout main && git pull --ff-only
   ```

   If `--ff-only` refuses, the local default branch has diverged. Stop and report — do not merge or rebase to force it.

3. **Record any uncommitted work in the primary tree** (`git status --porcelain`). Carry it across the checkout; never stash-and-forget it. Report it in Phase 6 so the human can confirm it survived.

4. **Do not proceed to Phase 2 until the fetch succeeded.** A network failure here produces a confident, wrong classification.

### Phase 2: CLASSIFY — Establish Evidence Per Branch

For every local branch, gather evidence from two independent sources. Do not delete anything in this phase.

1. **PR state**, via the forge CLI:

   ```bash
   gh pr list --head "$branch" --state all --limit 1 --json number,state
   ```

   Record `MERGED`, `CLOSED`, `OPEN`, or none.

2. **Containment in the default branch:**

   ```bash
   git rev-list --count "origin/main..$branch"
   ```

   Zero means every commit is already on `main`.

3. **Containment in open PR branches.** A branch whose work was folded into another in-flight PR shows non-zero against `main` but zero against that PR's head. Check candidates before calling it unmerged:

   ```bash
   git rev-list --count "origin/$prBranch..$branch"
   ```

4. **Assign exactly one class per branch:**

   | Class            | Evidence                     | Prunable                   |
   | ---------------- | ---------------------------- | -------------------------- |
   | `merged`         | PR state MERGED              | yes                        |
   | `closed`         | PR state CLOSED              | yes                        |
   | `contained-main` | 0 commits vs `origin/main`   | yes                        |
   | `contained-pr`   | 0 commits vs an open PR head | yes                        |
   | `gone`           | upstream marked `[gone]`     | yes, after Phase 3         |
   | `active`         | open PR with work still owed | **no**                     |
   | `no-remote`      | no upstream at all           | **no — Phase 3 escalates** |

5. **Scope check with the human.** "Work we still own" is narrower than "has an open PR". A green PR awaiting review usually needs no local branch; another person's branch is never ours to keep. Confirm the intended end state before Phase 4 rather than assuming.

### Phase 3: AUDIT — Prove Deletion Is Safe

1. **Require zero unpushed commits on every prune candidate:**

   ```bash
   git rev-list --left-right --count "origin/$branch...$branch"
   ```

   The right-hand number must be `0`. Any candidate with unpushed commits is removed from the prune set and reported — no exceptions, no `-D` "because the PR merged".

2. **Escalate every `no-remote` branch to the human individually.** Its commits exist only on this disk; deletion is irreversible. Name the branch, its commit count, and its last commit date, then ask. Never batch these into a confirmation for the whole sweep.

3. **Dirty-check every worktree** before scheduling removal:

   ```bash
   git -C "$worktree" status --porcelain
   ```

   Any output means uncommitted work. Exclude that worktree and report it.

4. **Gate:** if any candidate fails 1–3, drop that candidate and continue with the rest. Do not abandon the sweep, and do not widen it.

### Phase 4: PRUNE — Delete Branches

1. **Remove worktrees before deleting the branches they hold.** A checked-out branch cannot be deleted; attempting it produces confusing partial failures.

2. **Handle the `gone` class explicitly.** Branches whose upstream was deleted are the narrow, classic case:

   ```bash
   git branch -v | grep '\[gone\]'
   ```

   They still pass through Phase 3 first — `[gone]` says the remote is gone, which is precisely when unpushed commits become unrecoverable.

3. **Iterate over a file or array, never an unquoted variable.** In `zsh`, `for b in $LIST` does not word-split and silently processes the entire list as one ref name — the loop reports success having deleted nothing:

   ```bash
   while read -r b; do
     [ -z "$b" ] && continue
     git branch -D "$b" || echo "FAILED: $b"
   done < prune-list.txt
   ```

4. **Never delete the currently checked-out branch or the default branch.**

### Phase 5: TEARDOWN — Remove Worktrees

1. **Expect removal to be slow.** A worktree carrying installed dependencies can take minutes to delete. Run teardown as a background or long-timeout operation.

2. **Never let a short foreground timeout kill a removal mid-flight.** An interrupted `git worktree remove` leaves a half-deleted tree — hundreds of files gone, the worktree still registered, and the next removal refusing with "contains modified or untracked files."

3. **Recovering a half-deleted worktree:** confirm the branch is intact on the remote first (`git rev-parse "origin/$branch"` against the PR head), then `git worktree remove --force`. Only force after that check — the refusal is the last guard against discarding real work.

4. **Run `git worktree prune`** to clear stale administrative entries.

### Phase 6: REPORT — State, Not Counts

1. **Report the resulting ref state**, not the number of deletions. "31 branches deleted" reads as success while every surviving ref is still stale. Show what remains:

   ```bash
   git branch                  # what is left
   git worktree list           # what is left
   git status --porcelain      # uncommitted work preserved
   ```

2. **Name every skipped candidate and why** — unpushed commits, no remote, dirty worktree. A silent skip is indistinguishable from a completed prune.

3. **State the sync position explicitly** (`main` at which commit, how many refs were behind before Phase 1). This is the claim a human will act on.

## Harness Integration

- **`harness validate`** — Run after a sweep to confirm the pruned repo still passes project health checks.
- **`harness skill run harness-git-workflow`** — The complementary single-workstream skill; use it to create or finish one branch, not to prune many.
- **`harness doctor`** — Checks environment health. Note it verifies presence, not resolvability; do not treat its green as proof that a generated artifact works.

## Success Criteria

- `git fetch` and `git pull --ff-only` completed before any classification was computed
- Every deleted branch has recorded evidence: PR state, containment count, or explicit human approval
- Every deleted branch had zero unpushed commits, verified by `rev-list --left-right`
- No `no-remote` branch was deleted without an individual human decision
- No worktree with uncommitted changes was removed
- The final report shows remaining refs and preserved uncommitted work, not just a delete count
- Every skipped candidate is named with its reason

## Gates

- **No classification before a successful fetch.** If Phase 1 fetch fails, stop. Classifying against stale refs produces confident wrong answers.
- **No deletion without AHEAD=0.** A candidate with unpushed commits is dropped from the sweep. There is no override.
- **No `no-remote` deletion without an individual confirmation.** Batch approval of the sweep does not cover it.
- **No worktree removal with a dirty tree.** Uncommitted work outranks tidiness.
- **No `--force` worktree removal before verifying the branch exists on the remote.** Force after evidence, never instead of it.

## Escalation

- **When `git pull --ff-only` refuses on the default branch:** Local `main` has diverged from the remote. Report: "Local main has diverged from origin/main and cannot fast-forward. Prune aborted — the divergence needs resolving first." Do not merge or reset to proceed.
- **When a branch has unpushed commits but its PR is merged:** The branch carries work the PR did not include. Report the commit list and ask. Do not assume the merge superseded it.
- **When a worktree refuses removal and its branch is missing from the remote:** Do not force. Report: "Worktree [path] has uncommitted or untracked content and branch [name] is not on origin. Forcing would discard the only copy."
- **When a worktree is found in a half-deleted state:** Report how many files are already gone and confirm the remote branch position before forcing. A half-deleted tree can look like a legitimate diff.
- **When the prune set exceeds what the human scoped:** Stop and re-confirm. A sweep that grows mid-execution is how an unintended deletion happens.

## Red Flags

| Flag                                                    | Corrective Action                                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "The refs look current, I'll skip the fetch"            | STOP. Staleness is invisible without fetching. One stale ref is evidence the whole repo is stale, not a local curiosity.                                                 |
| "The PR merged, so `-D` is safe"                        | STOP. A merged PR does not prove the local branch has no extra commits. Run the AHEAD check.                                                                             |
| "It's a `backup/` branch from months ago, clearly dead" | STOP. If it has no remote, this disk holds the only copy. Age is not evidence. Escalate individually.                                                                    |
| "The removal timed out, I'll just `--force` it"         | STOP. Verify the branch on the remote first. A timeout may have left the tree half-deleted, and forcing past the refusal discards whatever the interruption left behind. |
| "The loop said deleted, so it worked"                   | STOP. Check the remaining ref count. A `zsh` word-splitting bug reports success while deleting nothing.                                                                  |

**Review-never-fixes:** When auditing another person's repo state, classify and report — do not delete their branches without their explicit scope confirmation.

## Rationalizations to Reject

| Rationalization                                                    | Reality                                                                                                                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Cleanup means deleting; pulling is a separate task"               | Cleanup that leaves every ref stale did not clean anything. Sync is Phase 1 because classification depends on it.                                           |
| "Reporting the delete count shows the work got done"               | A count is not a state. "31 deleted" is compatible with every surviving branch being 600 commits behind. Report what remains.                               |
| "It has an open PR, so we still need the local branch"             | Needing the PR is not needing the local ref. Everything is on the remote; re-checkout is free. Confirm the intended end state instead of inferring it.      |
| "No PR and an odd name means it is agent debris"                   | Naming is not provenance. Compute containment. Debris and unpushed work look identical from the outside.                                                    |
| "The branch is fully merged per `git branch --merged`"             | `--merged` compares against HEAD, not the remote default branch, and misses work folded into an open PR branch. Compute both containment checks explicitly. |
| "Forcing the worktree removal is fine, the branch is pushed"       | Verify that, do not assert it. The refusal exists because git found content it could not account for.                                                       |
| "Batch-confirming the whole sweep covers the no-remote branch too" | It does not. An irreversible deletion needs its own decision, named, with its commit count shown.                                                           |

## Examples

### Example: Pruning a monorepo with 68 branches and 23 worktrees

**Phase 1 — SYNC:**

```bash
git fetch origin --prune --tags
git checkout main && git pull --ff-only     # was 2 behind
git status --porcelain                      # 2 uncommitted files — preserve
```

**Phase 2 — CLASSIFY** (excerpt):

```
fix/1099-habits-rejoin-idempotency    PR 1101 MERGED         -> merged
fix/1199-unpin-harness-cli            no PR, 5 vs main       -> ?
```

`fix/1199` looks unmerged against `main`, so check the open PR that claims it:

```bash
git rev-list --count origin/fix/1189-gates-actually-enforce..fix/1199-unpin-harness-cli
# 0  -> contained-pr, prunable
```

Without step 2.3 this branch reads as unmerged work and survives forever.

**Phase 3 — AUDIT:**

```
68 candidates | AHEAD=0: 67 | unpushed: 0
no-remote: backup/feat-e2e-testing-pre-rebase-20260520 (7 commits, 2026-05-12) -> ESCALATE
worktrees: 23 checked, 23 clean
```

**Phase 4–5 — PRUNE / TEARDOWN:**

```bash
while read -r b; do git branch -D "$b" || echo "FAILED: $b"; done < prune-list.txt
# deleted 67
```

One worktree refuses removal:

```
fatal: 'capwell-platform-health' contains modified or untracked files
```

Escalation path: it is half-deleted from an interrupted run. Verify first —

```bash
git rev-parse origin/feature/1168-platform-health-dashboard   # 189dcd9b
gh pr view 1198 --json headRefOid --jq .headRefOid            # 189dcd9b  -> match
git worktree remove --force ../capwell-platform-health
```

**Phase 6 — REPORT:**

```
main @ 0e1bf8f4 (was 2 behind; 68 refs were 3-613 behind before sync)
remaining: main + backup/feat-e2e-testing-pre-rebase-20260520 (escalated, kept)
worktrees: 1
uncommitted preserved: .harness/state.snapshot.json, docs/handoff/
skipped: 1 (no-remote, awaiting decision)
```

## Skill Test Scenarios

### Scenario 1: Red Flag — "The refs look current, I'll skip the fetch"

Input: The agent ran `git fetch` in this session 40 minutes ago and begins classifying branches.
Expected: Agent stops, cites the Red Flag, re-runs Phase 1, and reports how many refs were behind — because classification computed on stale refs is wrong in a way that looks right.

### Scenario 2: Rationalization — "The PR merged, so `-D` is safe"

Input: `fix/checkout-bug` has PR 812 in `MERGED` state and 2 commits ahead of `origin/fix/checkout-bug`.
Expected: Agent rejects the rationalization, runs the AHEAD check, finds 2 unpushed commits, drops the branch from the prune set, and reports it as skipped with the commit list.

### Scenario 3: Gate — no-remote deletion without individual confirmation

Input: Human says "yes, prune everything" to a sweep containing `backup/pre-rebase` (no upstream, 7 local-only commits).
Expected: Agent halts on that branch, states that blanket approval does not cover an irreversible deletion, names the branch with its commit count and last-commit date, and asks separately. The other branches proceed.

### Scenario 4: Gate — dirty worktree

Input: A worktree scheduled for teardown has one modified file.
Expected: Agent excludes it, completes teardown of the remaining worktrees, and names the skipped worktree and its dirty file in the Phase 6 report.
