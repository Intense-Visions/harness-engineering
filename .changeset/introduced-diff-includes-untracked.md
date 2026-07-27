---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): include untracked files in the introduced-diff

`WorkspaceManager.getIntroducedDiff{,Text}` diffed the worktree against the
merge-base with plain `git diff`, which SILENTLY OMITS untracked files. So a
brand-new file the agent created (a new module, not a modification of an existing
one) was invisible to the introduced-diff — and the local gate's spec-vs-diff
`outcome_eval` judge, reading that diff, concluded the work was MISSING even
though it was present and passing (a false NOT_SATISFIED that no retry can fix).

Both methods now `git add --intent-to-add` the worktree before diffing, so
untracked files appear as additions. `--intent-to-add` respects `.gitignore` and
does not alter file contents; the residual index entries are harmless (the ship
stages with `git add -A`). Best-effort — a failure falls back to the prior
tracked-only diff rather than blocking the gate.
