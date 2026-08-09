---
'@harness-engineering/graph': patch
---

Skip plain-git worktree containers (`.git-worktrees/`, `.worktrees/`) during source-file walking.

`DEFAULT_SKIP_DIRS` already skipped agent sandbox dirs (`.claude`, `.cursor`, `.codex`, …) because each can hold a full checkout of the repo, but it missed the equivalent produced by `git worktree add .git-worktrees/<branch>`. Since `findFiles` sets `dot: true` deliberately so first-party source under dot-directories stays visible, that list is the only thing keeping nested checkouts out — so every scanner re-walked each worktree as first-party source.

The visible symptom was a phantom complexity regression: three worktrees contributed 9,818 extra `.ts` files on top of 3,302 real ones, producing `[complexity] REGRESSION: 1327 > 333` with findings attributed to paths under `.git-worktrees/<branch>/`, which blocked commits that touched no source at all.
